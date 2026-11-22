//! ShogiHome の定跡データを扱う WebAssembly モジュール。
//!
//! JavaScript からは src/background/book/wasm/ のラッパーを通して使う。
//! インスタンスごとに 1 冊の定跡を保持する。関数の仕様は specs/book-wasm.md を参照。

pub mod board;
pub mod codec;
pub mod moves;
pub mod packed;
pub mod proto;
pub mod sbk;
pub mod store;

use codec::{decode_entry, encode_entry, Decoder, Encoder};
use sbk::{load_sbk, SbkWriter};
use std::cell::RefCell;
use store::{Key, Store};

#[derive(Default)]
struct State {
    store: Store,
    author: String,
    description: String,
    result: Vec<u8>,
    error: String,
    writer: Option<SbkWriter>,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

fn with_state<R>(f: impl FnOnce(&mut State) -> R) -> R {
    STATE.with(|s| f(&mut s.borrow_mut()))
}

/// # Safety
/// ptr と len は alloc で確保した領域を指していること
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

/// 定跡を空にする
#[no_mangle]
pub extern "C" fn book_clear() {
    with_state(|s| {
        s.store = Store::default();
        s.author.clear();
        s.description.clear();
        s.writer = None;
        s.result = Vec::new();
    });
}

#[no_mangle]
pub extern "C" fn book_size() -> u32 {
    with_state(|s| s.store.len() as u32)
}

/// SBK ファイルの内容を読み込む。成功した場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn book_load_sbk(ptr: *const u8, len: u32) -> i32 {
    let data = input(ptr, len);
    with_state(|s| match load_sbk(data) {
        Ok(book) => {
            s.store = book.store;
            s.author = book.author;
            s.description = book.description;
            s.writer = None;
            0
        }
        Err(e) => fail(s, e),
    })
}

/// 局面のエントリーを取得する。
/// 見つかった場合は 1 を返し、結果にエントリーを書き込む。見つからない場合は 0 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn book_get(ptr: *const u8, len: u32) -> i32 {
    let sfen = input(ptr, len);
    with_state(|s| {
        let Ok(sfen) = core::str::from_utf8(sfen) else {
            return fail(s, "invalid UTF-8 key");
        };
        let key = Key::from_str(sfen);
        match s.store.get(&key) {
            Some(entry) => {
                let mut e = Encoder {
                    buf: std::mem::take(&mut s.result),
                };
                e.buf.clear();
                encode_entry(&mut e, entry);
                s.result = e.buf;
                1
            }
            None => 0,
        }
    })
}

/// 局面のエントリーを設定する。成功した場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// 各ポインターと長さは book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn book_set(
    key_ptr: *const u8,
    key_len: u32,
    entry_ptr: *const u8,
    entry_len: u32,
) -> i32 {
    let sfen = input(key_ptr, key_len);
    let data = input(entry_ptr, entry_len);
    with_state(|s| {
        let Ok(sfen) = core::str::from_utf8(sfen) else {
            return fail(s, "invalid UTF-8 key");
        };
        let mut d = Decoder::new(data);
        let entry = match decode_entry(&mut d) {
            Some(e) if d.is_end() => e,
            _ => return fail(s, "invalid entry data"),
        };
        s.writer = None;
        s.store.set(Key::from_str(sfen), entry);
        0
    })
}

/// 挿入順で start 番目から最大 count 件のエントリーを取得し、取得した件数を返す。
/// 結果は [キー (長さ (u32) + UTF-8), エントリー] の繰り返し。
#[no_mangle]
pub extern "C" fn book_entries(start: u32, count: u32) -> i32 {
    with_state(|s| {
        let start = (start as usize).min(s.store.len());
        let end = start.saturating_add(count as usize).min(s.store.len());
        let mut e = Encoder {
            buf: std::mem::take(&mut s.result),
        };
        e.buf.clear();
        for i in start..end {
            e.str(&s.store.key_at(i).to_sfen());
            encode_entry(&mut e, s.store.entry_at(i));
        }
        s.result = e.buf;
        (end - start) as i32
    })
}

/// SBK の作者と説明を取得する。結果は 2 つの文字列 ([長さ (u32), UTF-8] × 2)。
#[no_mangle]
pub extern "C" fn book_get_sbk_meta() -> i32 {
    with_state(|s| {
        let mut e = Encoder { buf: Vec::new() };
        e.str(&s.author);
        e.str(&s.description);
        s.result = e.buf;
        0
    })
}

/// SBK の作者と説明を設定する。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn book_set_sbk_meta(ptr: *const u8, len: u32) -> i32 {
    let data = input(ptr, len);
    with_state(|s| {
        let mut d = Decoder::new(data);
        match (d.str(), d.str()) {
            (Some(a), Some(b)) if d.is_end() => {
                s.author = a.to_string();
                s.description = b.to_string();
                0
            }
            _ => fail(s, "invalid meta data"),
        }
    })
}

/// SBK の書き出しを開始する。書き出す State の総数を返す。
#[no_mangle]
pub extern "C" fn book_save_sbk_begin() -> i32 {
    with_state(|s| {
        let writer = SbkWriter::new(&s.store, &s.author, &s.description);
        let total = writer.total();
        s.writer = Some(writer);
        total as i32
    })
}

/// 続きを最大 max_states 件書き出し、結果にバイト列を書き込む。
/// 書き出した件数を返す。0 の場合は完了している。失敗した場合は -1 を返す。
#[no_mangle]
pub extern "C" fn book_save_sbk_next(max_states: u32) -> i32 {
    with_state(|s| {
        let Some(mut writer) = s.writer.take() else {
            return fail(s, "writer is not started");
        };
        let mut out = std::mem::take(&mut s.result);
        out.clear();
        let r = writer.write_next(&s.store, max_states as usize, &mut out);
        s.result = out;
        match r {
            Ok(n) => {
                if n > 0 {
                    s.writer = Some(writer);
                }
                n as i32
            }
            Err(e) => fail(s, e),
        }
    })
}
