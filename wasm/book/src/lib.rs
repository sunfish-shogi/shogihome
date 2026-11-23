//! ShogiHome の定跡データを扱う WebAssembly モジュール。
//!
//! JavaScript からは src/background/book/wasm/ のラッパーを通して使う。
//! インスタンスごとに 1 冊の定跡を保持する。関数の仕様は specs/book-wasm.md を参照。

pub mod board;
pub mod codec;
pub mod entry;
pub mod moves;
pub mod packed;
pub mod proto;
pub mod sbk;

use codec::{decode_entry, encode_entry, Decoder, Encoder};
use sbk::{SbkBook, SbkWriter};
use std::cell::RefCell;

#[derive(Default)]
struct State {
    sbk: Option<SbkBook>,
    writer: Option<SbkWriter>,
    result: Vec<u8>,
    error: String,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

fn with_state<R>(f: impl FnOnce(&mut State) -> R) -> R {
    STATE.with(|s| f(&mut s.borrow_mut()))
}

/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
unsafe fn input<'a>(ptr: *const u8, len: u32) -> &'a [u8] {
    if len == 0 {
        return &[];
    }
    core::slice::from_raw_parts(ptr, len as usize)
}

fn fail(state: &mut State, message: impl Into<String>) -> i32 {
    state.error = message.into();
    -1
}

/// JavaScript から書き込むための領域を確保する
#[no_mangle]
pub extern "C" fn book_alloc(len: u32) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(len.max(1) as usize);
    let ptr = v.as_mut_ptr();
    core::mem::forget(v);
    ptr
}

/// # Safety
/// book_alloc で確保した領域と同じ長さを指定すること
#[no_mangle]
pub unsafe extern "C" fn book_free(ptr: *mut u8, len: u32) {
    drop(Vec::from_raw_parts(ptr, 0, len.max(1) as usize));
}

/// 直前の呼び出しの結果
#[no_mangle]
pub extern "C" fn book_result_ptr() -> *const u8 {
    with_state(|s| s.result.as_ptr())
}

#[no_mangle]
pub extern "C" fn book_result_len() -> u32 {
    with_state(|s| s.result.len() as u32)
}

/// 直前に失敗した呼び出しのエラーメッセージ
#[no_mangle]
pub extern "C" fn book_error_ptr() -> *const u8 {
    with_state(|s| s.error.as_ptr())
}

#[no_mangle]
pub extern "C" fn book_error_len() -> u32 {
    with_state(|s| s.error.len() as u32)
}

fn encode_opt_str(e: &mut Encoder, s: &Option<String>) {
    match s {
        Some(s) => {
            e.u8(1);
            e.str(s);
        }
        None => e.u8(0),
    }
}

/// SBK ファイルを開く。
/// ptr は book_alloc で確保した len バイトの領域で、所有権はこのモジュールに移る (解放しないこと)。
/// 成功した場合は 0 を返し、結果に [作者, 説明, State の数 (u32)] を書き込む。失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc(len) で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn sbk_open(ptr: *mut u8, len: u32) -> i32 {
    let data = if len == 0 {
        book_free(ptr, 0);
        Vec::new()
    } else {
        Vec::from_raw_parts(ptr, len as usize, len as usize)
    };
    with_state(|s| {
        s.writer = None;
        s.sbk = None;
        match SbkBook::open(data) {
            Ok(book) => {
                let mut e = Encoder { buf: Vec::new() };
                encode_opt_str(&mut e, &book.author);
                encode_opt_str(&mut e, &book.description);
                e.u32(book.state_count() as u32);
                s.result = e.buf;
                s.sbk = Some(book);
                0
            }
            Err(err) => fail(s, err),
        }
    })
}

/// 元のファイルが無い空の定跡を作る
#[no_mangle]
pub extern "C" fn sbk_create() {
    with_state(|s| {
        s.writer = None;
        s.sbk = Some(SbkBook::empty());
    })
}

/// 元のファイルから局面のエントリーを検索する。
/// 見つかった場合は 1 を返し、結果にエントリーを書き込む。見つからない場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn sbk_search(ptr: *const u8, len: u32) -> i32 {
    let sfen = input(ptr, len);
    with_state(|s| {
        let Some(book) = &s.sbk else {
            return fail(s, "book is not opened");
        };
        let Ok(sfen) = core::str::from_utf8(sfen) else {
            return fail(s, "invalid UTF-8 key");
        };
        match book.search(sfen) {
            Ok(Some(entry)) => {
                let mut e = Encoder {
                    buf: std::mem::take(&mut s.result),
                };
                e.buf.clear();
                encode_entry(&mut e, &entry);
                s.result = e.buf;
                1
            }
            Ok(None) => 0,
            Err(err) => fail(s, err),
        }
    })
}

/// 元のファイルに in-memory のエントリーを統合して書き出す処理を開始する。
/// 入力は [エントリーの数 (u32), (キー, エントリー) × エントリーの数] (挿入順)。
/// 書き出す State の総数を返す。失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn sbk_save_begin(ptr: *const u8, len: u32) -> i32 {
    let data = input(ptr, len);
    with_state(|s| {
        s.writer = None;
        let Some(book) = &s.sbk else {
            return fail(s, "book is not opened");
        };
        let mut d = Decoder::new(data);
        let Some(count) = d.u32() else {
            return fail(s, "invalid patch data");
        };
        let mut patches = Vec::with_capacity((count as usize).min(1 << 20));
        for _ in 0..count {
            let Some(key) = d.str().map(|k| k.to_string()) else {
                return fail(s, "invalid patch data");
            };
            let Some(entry) = decode_entry(&mut d) else {
                return fail(s, "invalid patch data");
            };
            patches.push((key, entry));
        }
        if !d.is_end() {
            return fail(s, "invalid patch data");
        }
        match book.begin_save(patches) {
            Ok(writer) => {
                let total = writer.total(book);
                s.writer = Some(writer);
                total as i32
            }
            Err(err) => fail(s, err),
        }
    })
}

/// 続きを最大 max_states 件書き出し、結果にバイト列を書き込む。
/// 書き出した件数を返す。0 の場合は完了している。失敗した場合は -1 を返す。
/// 最初の呼び出しでは件数が 0 でも結果にヘッダーが含まれる場合がある。
#[no_mangle]
pub extern "C" fn sbk_save_next(max_states: u32) -> i32 {
    with_state(|s| {
        let Some(mut writer) = s.writer.take() else {
            return fail(s, "writer is not started");
        };
        let Some(book) = &s.sbk else {
            return fail(s, "book is not opened");
        };
        let mut out = std::mem::take(&mut s.result);
        out.clear();
        let r = writer.write_next(book, max_states as usize, &mut out);
        s.result = out;
        match r {
            Ok(n) => {
                if n > 0 {
                    s.writer = Some(writer);
                }
                n as i32
            }
            Err(err) => fail(s, err),
        }
    })
}
