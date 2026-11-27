//! ShogiHome の定跡データを扱う WebAssembly モジュール。
//!
//! JavaScript からは src/background/book/wasm/ のラッパーを通して使う。
//! インスタンスごとに 1 冊の定跡を保持する。関数の仕様は specs/book-wasm.md を参照。

pub mod apery;
pub mod apery_zobrist;
pub mod board;
pub mod codec;
pub mod entry;
pub mod moves;
pub mod packed;
pub mod proto;
pub mod sbk;
pub mod ybb;
pub mod yane;

use apery::{AperyMerger, AperyOnTheFly, AperyStore};
use codec::{decode_entry, encode_entry, Decoder, Encoder};
use sbk::{SbkBook, SbkWriter};
use yane::{Source, YaneInMemory, YaneMerger, YaneStore};
use ybb::{YbbMerger, YbbOnTheFly, YbbStore};
use std::cell::RefCell;

#[derive(Default)]
struct State {
    sbk: Option<SbkBook>,
    writer: Option<SbkWriter>,
    yane: Option<YaneBook>,
    yane_writer: Option<YaneWriter>,
    ybb: Option<YbbOnTheFly>,
    ybb_writer: Option<YbbWriter>,
    apery: Option<AperyOnTheFly>,
    apery_writer: Option<AperyWriter>,
    result: Vec<u8>,
    error: String,
}

/// やねうら王形式の定跡
enum YaneBook {
    /// On-the-fly モード (元のファイルの大きさ)
    OnTheFly(u64),
    /// in-memory モード
    InMemory(YaneInMemory),
}

enum AperyWriter {
    Merge(AperyMerger),
    Store(AperyStore),
}

enum YbbWriter {
    Merge(YbbMerger),
    Store(YbbStore),
}

enum YaneWriter {
    Merge(YaneMerger, u64),
    Store(YaneStore),
}

/// JavaScript から読み込む元のファイル。
/// 読み込みは JavaScript の関数 (env.book_read) で行う。
struct HostFile;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    /// pos から最大 len バイトを ptr に読み込み、読み込めたバイト数を返す。失敗した場合は -1 を返す。
    fn book_read(pos: f64, ptr: *mut u8, len: u32) -> i32;
}

impl Source for HostFile {
    #[cfg(target_arch = "wasm32")]
    fn read_at(&mut self, pos: u64, buf: &mut [u8]) -> Result<usize, String> {
        let n = unsafe { book_read(pos as f64, buf.as_mut_ptr(), buf.len() as u32) };
        if n < 0 {
            return Err("failed to read the book file".to_string());
        }
        Ok((n as usize).min(buf.len()))
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn read_at(&mut self, _pos: u64, _buf: &mut [u8]) -> Result<usize, String> {
        Err("reading files is only supported on WebAssembly".to_string())
    }
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

/// [エントリーの数 (u32), (キー, エントリー) × エントリーの数] を読み込む
fn decode_patches(data: &[u8]) -> Option<Vec<(String, entry::Entry)>> {
    let mut d = Decoder::new(data);
    let count = d.u32()?;
    let mut patches = Vec::with_capacity((count as usize).min(1 << 20));
    for _ in 0..count {
        let key = d.str()?.to_string();
        let entry = decode_entry(&mut d)?;
        patches.push((key, entry));
    }
    if !d.is_end() {
        return None;
    }
    Some(patches)
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
        let Some(patches) = decode_patches(data) else {
            return fail(s, "invalid patch data");
        };
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

/// やねうら王形式のファイルを On-the-fly モードで開く (ファイルの内容は読み込まず、必要な部分を env.book_read で読む)。
/// 先頭の局面が整列されている場合は 1、整列されていない場合は 0、失敗した場合は -1 を返す。
#[no_mangle]
pub extern "C" fn yane_open(size: f64) -> i32 {
    with_state(|s| {
        s.yane_writer = None;
        s.yane = None;
        match yane::validate_ordering(&mut HostFile) {
            Ok(ordered) => {
                s.yane = Some(YaneBook::OnTheFly(size as u64));
                ordered as i32
            }
            Err(err) => fail(s, err),
        }
    })
}

/// やねうら王形式のファイルを in-memory モードで開く。
/// ptr は book_alloc で確保した len バイトの領域で、所有権はこのモジュールに移る (解放しないこと)。
/// 成功した場合は局面の数を返す。失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc(len) で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn yane_load(ptr: *mut u8, len: u32) -> i32 {
    let data = if len == 0 {
        book_free(ptr, 0);
        Vec::new()
    } else {
        Vec::from_raw_parts(ptr, len as usize, len as usize)
    };
    with_state(|s| {
        s.yane_writer = None;
        s.yane = None;
        match YaneInMemory::load(data) {
            Ok(book) => {
                let count = book.len() as i32;
                s.yane = Some(YaneBook::InMemory(book));
                count
            }
            Err(err) => fail(s, err),
        }
    })
}

/// 元のファイルが無い空のやねうら王形式の定跡を作る (in-memory モード)
#[no_mangle]
pub extern "C" fn yane_create() {
    with_state(|s| {
        s.yane_writer = None;
        s.yane = Some(YaneBook::InMemory(YaneInMemory::empty()));
    })
}

/// 元のファイルから局面のエントリーを検索する。キーは手数を 1 にした SFEN。
/// 見つかった場合は 1 を返し、結果にエントリーを書き込む。見つからない場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn yane_search(ptr: *const u8, len: u32) -> i32 {
    let sfen = input(ptr, len);
    with_state(|s| {
        let Ok(sfen) = core::str::from_utf8(sfen) else {
            return fail(s, "invalid UTF-8 key");
        };
        let found = match &s.yane {
            None => return fail(s, "book is not opened"),
            Some(YaneBook::OnTheFly(size)) => yane::search(&mut HostFile, *size, sfen),
            Some(YaneBook::InMemory(book)) => Ok(book.search(sfen)),
        };
        match found {
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

/// 編集内容を統合して書き出す処理を開始する。On-the-fly モードでは元のファイルに統合し、
/// in-memory モードでは全ての局面を書き出す。入力は sbk_save_begin と同じ形式。
/// 成功した場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn yane_save_begin(ptr: *const u8, len: u32) -> i32 {
    let data = input(ptr, len);
    with_state(|s| {
        s.yane_writer = None;
        let Some(patches) = decode_patches(data) else {
            return fail(s, "invalid patch data");
        };
        s.yane_writer = match &s.yane {
            None => return fail(s, "book is not opened"),
            Some(YaneBook::OnTheFly(size)) => Some(YaneWriter::Merge(YaneMerger::new(patches), *size)),
            Some(YaneBook::InMemory(_)) => Some(YaneWriter::Store(YaneStore::new(patches))),
        };
        0
    })
}

/// 続きを書き出し、結果に約 max_bytes バイト以上のバイト列を書き込む。
/// 続きがある場合は 1、完了した場合は 0、失敗した場合は -1 を返す。
#[no_mangle]
pub extern "C" fn yane_save_next(max_bytes: u32) -> i32 {
    with_state(|s| {
        let mut out = std::mem::take(&mut s.result);
        out.clear();
        let r = match (&mut s.yane_writer, &s.yane) {
            (Some(YaneWriter::Merge(writer, _)), Some(YaneBook::OnTheFly(_))) => {
                writer.write_next(&mut HostFile, max_bytes as usize, &mut out)
            }
            (Some(YaneWriter::Store(writer)), Some(YaneBook::InMemory(book))) => {
                Ok(writer.write_next(book, max_bytes as usize, &mut out))
            }
            _ => Err("writer is not started".to_string()),
        };
        s.result = out;
        match r {
            // 完了した後も yane_save_progress で進捗を返せるように書き出しの状態は残す
            Ok(done) => (!done) as i32,
            Err(err) => {
                s.yane_writer = None;
                fail(s, err)
            }
        }
    })
}

/// 書き出しの進捗 (0〜1)
#[no_mangle]
pub extern "C" fn yane_save_progress() -> f64 {
    with_state(|s| match (&s.yane_writer, &s.yane) {
        (Some(YaneWriter::Merge(writer, size)), _) if *size > 0 => {
            writer.consumed() as f64 / *size as f64
        }
        (Some(YaneWriter::Store(writer)), Some(YaneBook::InMemory(book))) => writer.progress(book),
        _ => 0.0,
    })
}

/// 元のエントリーに編集内容を統合する。新たな局面は末尾に追加する (JavaScript の Map と同じ順序)。
fn merge_patches(
    mut entries: Vec<(String, entry::Entry)>,
    patches: Vec<(String, entry::Entry)>,
) -> Vec<(String, entry::Entry)> {
    let mut index: std::collections::HashMap<String, usize> = entries
        .iter()
        .enumerate()
        .map(|(i, (key, _))| (key.clone(), i))
        .collect();
    for (key, patch) in patches {
        match index.get(&key) {
            Some(&i) => {
                if let Some(merged) = entry::merge_entries(Some(entries[i].1.clone()), Some(&patch)) {
                    entries[i].1 = merged;
                }
            }
            None => {
                if let Some(merged) = entry::merge_entries(None, Some(&patch)) {
                    index.insert(key.clone(), entries.len());
                    entries.push((key, merged));
                }
            }
        }
    }
    entries
}

/// やねうら王形式の全ての局面のエントリー (On-the-fly モードではファイル全体を読み込む)。
/// file_order が true の場合はファイル内で最初に現れた順 (loadYaneuraOuBook の Map の順序)、false の場合は局面順。
fn yane_entries(s: &State, file_order: bool) -> Result<Vec<(String, entry::Entry)>, String> {
    let entries = |book: &YaneInMemory| {
        if file_order {
            book.entries_in_file_order()
        } else {
            book.entries()
        }
    };
    match &s.yane {
        None => Err("book is not opened".to_string()),
        Some(YaneBook::InMemory(book)) => Ok(entries(book)),
        Some(YaneBook::OnTheFly(size)) => {
            let mut data = vec![0u8; *size as usize];
            let mut pos = 0;
            while pos < data.len() {
                match HostFile.read_at(pos as u64, &mut data[pos..])? {
                    0 => return Err("unexpected end of the book file".to_string()),
                    n => pos += n,
                }
            }
            Ok(entries(&YaneInMemory::load(data)?))
        }
    }
}

/// 全ての局面を空の SBK に追加して書き出す処理を開始し、State の総数を返す (続きは sbk_save_next)
fn begin_sbk_export(s: &mut State, entries: Vec<(String, entry::Entry)>) -> i32 {
    let sbk = SbkBook::empty();
    match sbk.begin_save(entries) {
        Ok(writer) => {
            let total = writer.total(&sbk);
            s.sbk = Some(sbk);
            s.writer = Some(writer);
            total as i32
        }
        Err(err) => fail(s, err),
    }
}

/// 全ての局面をやねうら王形式で書き出す処理を開始する (続きは yane_save_next)
fn begin_yane_export(s: &mut State, entries: Vec<(String, entry::Entry)>) -> i32 {
    s.yane = Some(YaneBook::InMemory(YaneInMemory::empty()));
    s.yane_writer = Some(YaneWriter::Store(YaneStore::new(entries)));
    0
}

/// 全ての局面を YBB 形式で書き出す処理を開始する (続きは ybb_save_next)
fn begin_ybb_export(s: &mut State, entries: Vec<(String, entry::Entry)>) -> i32 {
    match YbbStore::new(entries) {
        Ok(writer) => {
            s.ybb_writer = Some(YbbWriter::Store(writer));
            0
        }
        Err(err) => fail(s, err),
    }
}

/// 変換を開始する。入力は sbk_save_begin と同じ形式の編集内容。
/// entries で元の定跡の全ての局面を取得し、編集内容を統合して begin で書き出しを開始する。
fn export(
    data: &[u8],
    entries: impl FnOnce(&State) -> Result<Vec<(String, entry::Entry)>, String>,
    begin: impl FnOnce(&mut State, Vec<(String, entry::Entry)>) -> i32,
) -> i32 {
    with_state(|s| {
        s.writer = None;
        s.yane_writer = None;
        s.ybb_writer = None;
        s.apery_writer = None;
        let Some(patches) = decode_patches(data) else {
            return fail(s, "invalid patch data");
        };
        match entries(s) {
            Ok(base) => begin(s, merge_patches(base, patches)),
            Err(err) => fail(s, err),
        }
    })
}

/// やねうら王形式の定跡を SBK 形式に変換して書き出す処理を開始する。
/// 全ての局面を読み込み (On-the-fly モードではファイル全体を読む)、編集内容を統合して、
/// 空の SBK に追加した結果を書き出す。入力は sbk_save_begin と同じ形式。
/// 書き出す State の総数を返す。続きは sbk_save_next で書き出す。失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn yane_export_sbk_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), |s| yane_entries(s, false), begin_sbk_export)
}

/// やねうら王形式の定跡を YBB 形式に変換して書き出す処理を開始する (storeYbbBook と同じ結果)。
/// 続きは ybb_save_next で書き出す。成功した場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn yane_export_ybb_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), |s| yane_entries(s, true), begin_ybb_export)
}

fn sbk_entries(s: &State) -> Result<Vec<(String, entry::Entry)>, String> {
    s.sbk.as_ref().ok_or("book is not opened")?.all_entries()
}

/// SBK 形式の定跡をやねうら王形式に変換して書き出す処理を開始する。
/// 全ての局面のエントリー (loadSbkBook と同じ) に編集内容を統合して、局面順に書き出す。
/// 入力は sbk_save_begin と同じ形式。続きは yane_save_next で書き出す。
/// 成功した場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn sbk_export_yane_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), sbk_entries, begin_yane_export)
}

/// SBK 形式の定跡を YBB 形式に変換して書き出す処理を開始する (続きは ybb_save_next)。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn sbk_export_ybb_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), sbk_entries, begin_ybb_export)
}

// ---------------------------------------------------------------------------
// YBB 形式

fn ybb_entries(s: &State) -> Result<Vec<(String, entry::Entry)>, String> {
    s.ybb.as_ref().ok_or("book is not opened")?.all_entries(&mut HostFile)
}

/// YBB 形式のファイルを開く (ファイルの内容は読み込まず、必要な部分を env.book_read で読む)。
/// 成功した場合は 0、失敗した場合は -1 を返す。
#[no_mangle]
pub extern "C" fn ybb_open() -> i32 {
    with_state(|s| {
        s.ybb_writer = None;
        s.ybb = None;
        match YbbOnTheFly::open(&mut HostFile) {
            Ok(book) => {
                s.ybb = Some(book);
                0
            }
            Err(err) => fail(s, err),
        }
    })
}

/// 元のファイルが無い空の YBB 形式の定跡を作る
#[no_mangle]
pub extern "C" fn ybb_create() {
    with_state(|s| {
        s.ybb_writer = None;
        s.ybb = Some(YbbOnTheFly::empty());
    })
}

/// 元のファイルから局面のエントリーを検索する。
/// 見つかった場合は 1 を返し、結果にエントリーを書き込む。見つからない場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn ybb_search(ptr: *const u8, len: u32) -> i32 {
    let sfen = input(ptr, len);
    with_state(|s| {
        let Ok(sfen) = core::str::from_utf8(sfen) else {
            return fail(s, "invalid UTF-8 key");
        };
        let Some(book) = &s.ybb else {
            return fail(s, "book is not opened");
        };
        match book.search(&mut HostFile, sfen) {
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

/// 元のファイルに編集内容を統合して書き出す処理を開始する (mergeYbbBook と同じ結果)。
/// 入力は sbk_save_begin と同じ形式。成功した場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn ybb_save_begin(ptr: *const u8, len: u32) -> i32 {
    let data = input(ptr, len);
    with_state(|s| {
        s.ybb_writer = None;
        let Some(patches) = decode_patches(data) else {
            return fail(s, "invalid patch data");
        };
        let Some(book) = &s.ybb else {
            return fail(s, "book is not opened");
        };
        match YbbMerger::new(&mut HostFile, book, patches) {
            Ok(writer) => {
                s.ybb_writer = Some(YbbWriter::Merge(writer));
                0
            }
            Err(err) => fail(s, err),
        }
    })
}

/// 続きを書き出し、結果に約 max_bytes バイト以上のバイト列を書き込む。
/// 続きがある場合は 1、完了した場合は 0、失敗した場合は -1 を返す。
#[no_mangle]
pub extern "C" fn ybb_save_next(max_bytes: u32) -> i32 {
    with_state(|s| {
        let mut out = std::mem::take(&mut s.result);
        out.clear();
        let r = match &mut s.ybb_writer {
            Some(YbbWriter::Merge(writer)) => {
                writer.write_next(&mut HostFile, max_bytes as usize, &mut out)
            }
            Some(YbbWriter::Store(writer)) => writer.write_next(max_bytes as usize, &mut out),
            None => Err("writer is not started".to_string()),
        };
        s.result = out;
        match r {
            // 完了した後も ybb_save_progress で進捗を返せるように書き出しの状態は残す
            Ok(done) => (!done) as i32,
            Err(err) => {
                s.ybb_writer = None;
                fail(s, err)
            }
        }
    })
}

/// 書き出しの進捗 (0〜1)
#[no_mangle]
pub extern "C" fn ybb_save_progress() -> f64 {
    with_state(|s| match &s.ybb_writer {
        Some(YbbWriter::Merge(writer)) => writer.progress(),
        Some(YbbWriter::Store(writer)) => writer.progress(),
        None => 0.0,
    })
}

/// YBB 形式の定跡をやねうら王形式に変換して書き出す処理を開始する (続きは yane_save_next)。
/// 全ての局面 (loadYbbBookFull と同じ) に編集内容を統合する。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn ybb_export_yane_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), ybb_entries, begin_yane_export)
}

/// YBB 形式の定跡を SBK 形式に変換して書き出す処理を開始し、State の総数を返す (続きは sbk_save_next)。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn ybb_export_sbk_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), ybb_entries, begin_sbk_export)
}

// ---------------------------------------------------------------------------
// Apery 形式

/// 全ての局面を Apery 形式で書き出す処理を開始する (続きは apery_save_next)
fn begin_apery_export(s: &mut State, entries: Vec<(String, entry::Entry)>) -> i32 {
    match AperyStore::new(entries) {
        Ok(writer) => {
            s.apery_writer = Some(AperyWriter::Store(writer));
            0
        }
        Err(err) => fail(s, err),
    }
}

/// Apery 形式のファイルを開く (ファイルの内容は読み込まず、必要な部分を env.book_read で読む)
#[no_mangle]
pub extern "C" fn apery_open(size: f64) {
    with_state(|s| {
        s.apery_writer = None;
        s.apery = Some(AperyOnTheFly { size: size as u64 });
    })
}

/// 元のファイルが無い空の Apery 形式の定跡を作る
#[no_mangle]
pub extern "C" fn apery_create() {
    apery_open(0.0)
}

/// 元のファイルから局面のエントリーを検索する (キーは SFEN。ハッシュ値はこのモジュールで計算する)。
/// 見つかった場合は 1 を返し、結果にエントリーを書き込む。見つからない場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn apery_search(ptr: *const u8, len: u32) -> i32 {
    let sfen = input(ptr, len);
    with_state(|s| {
        let Ok(sfen) = core::str::from_utf8(sfen) else {
            return fail(s, "invalid UTF-8 key");
        };
        let Some(book) = &s.apery else {
            return fail(s, "book is not opened");
        };
        match book.search(&mut HostFile, sfen) {
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

/// 元のファイルに編集内容を統合して書き出す処理を開始する (mergeAperyBook と同じ結果)。
/// 入力は sbk_save_begin と同じ形式で、キーはハッシュ値 (10 進数の文字列)。
/// 成功した場合は 0、失敗した場合は -1 を返す。
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn apery_save_begin(ptr: *const u8, len: u32) -> i32 {
    let data = input(ptr, len);
    with_state(|s| {
        s.apery_writer = None;
        let Some(patches) = decode_patches(data) else {
            return fail(s, "invalid patch data");
        };
        let Some(book) = &s.apery else {
            return fail(s, "book is not opened");
        };
        match AperyMerger::new(book, patches) {
            Ok(writer) => {
                s.apery_writer = Some(AperyWriter::Merge(writer));
                0
            }
            Err(err) => fail(s, err),
        }
    })
}

/// 続きを書き出し、結果に約 max_bytes バイト以上のバイト列を書き込む。
/// 続きがある場合は 1、完了した場合は 0、失敗した場合は -1 を返す。
#[no_mangle]
pub extern "C" fn apery_save_next(max_bytes: u32) -> i32 {
    with_state(|s| {
        let mut out = std::mem::take(&mut s.result);
        out.clear();
        let r = match &mut s.apery_writer {
            Some(AperyWriter::Merge(writer)) => {
                writer.write_next(&mut HostFile, max_bytes as usize, &mut out)
            }
            Some(AperyWriter::Store(writer)) => writer.write_next(max_bytes as usize, &mut out),
            None => Err("writer is not started".to_string()),
        };
        s.result = out;
        match r {
            // 完了した後も apery_save_progress で進捗を返せるように書き出しの状態は残す
            Ok(done) => (!done) as i32,
            Err(err) => {
                s.apery_writer = None;
                fail(s, err)
            }
        }
    })
}

/// 書き出しの進捗 (0〜1)
#[no_mangle]
pub extern "C" fn apery_save_progress() -> f64 {
    with_state(|s| match &s.apery_writer {
        Some(AperyWriter::Merge(writer)) => writer.progress(),
        Some(AperyWriter::Store(writer)) => writer.progress(),
        None => 0.0,
    })
}

/// やねうら王形式の定跡を Apery 形式に変換して書き出す処理を開始する (続きは apery_save_next)
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn yane_export_apery_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), |s| yane_entries(s, true), begin_apery_export)
}

/// SBK 形式の定跡を Apery 形式に変換して書き出す処理を開始する (続きは apery_save_next)
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn sbk_export_apery_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), sbk_entries, begin_apery_export)
}

/// YBB 形式の定跡を Apery 形式に変換して書き出す処理を開始する (続きは apery_save_next)
///
/// # Safety
/// ptr と len は book_alloc で確保した領域を指していること
#[no_mangle]
pub unsafe extern "C" fn ybb_export_apery_begin(ptr: *const u8, len: u32) -> i32 {
    export(input(ptr, len), ybb_entries, begin_apery_export)
}
