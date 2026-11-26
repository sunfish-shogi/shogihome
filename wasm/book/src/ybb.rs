//! YBB 形式 (YANE-BINBOOK-V1) の On-the-fly 処理。
//! src/background/book/ybb.ts (searchYbbBookMovesOnTheFly・mergeYbbBook・storeYbbBook・
//! loadYbbBookFull) の移植。同じ入力に対して同じ結果 (検索結果・書き出したバイト列) を得る。
//!
//! 元のファイルはメモリに読み込まず、Source を通して必要な部分だけを読む。
//! 数値の書き込みは JavaScript と同じ規則に従う (Buffer の書き込みは範囲外の場合にエラー、
//! DataView の書き込みは 65536 で割った余り)。

use crate::entry::{merge_entries, BookMove, Entry};
use crate::packed::{pack_sfen, unpack, Packed};
use crate::yane::Source;
use std::cmp::Ordering;
use std::collections::HashMap;

const MAGIC: &[u8; 16] = b"YANE-BINBOOK-V1\0";
const HEADER_SIZE: u64 = 32; // magic(16) + record_count(8) + flags(8)
const RECORD_SIZE: u64 = 44; // packed_sfen(32) + moves_offset(8) + ply(2) + move_count(2)
const MOVE_ENTRY_SIZE_V0: usize = 4; // move16(2) + eval(2)
const MOVE_ENTRY_SIZE_V1: usize = 6; // move16(2) + eval(2) + depth(2)
/// 順に読み込む場合の読み込みの単位
const READ_CHUNK: usize = 1024 * 1024;

type Result<T> = std::result::Result<T, String>;

fn move_entry_size(flags: u64) -> usize {
    if flags & 1 == 1 {
        MOVE_ENTRY_SIZE_V1
    } else {
        MOVE_ENTRY_SIZE_V0
    }
}

/// readExact: 1 回の読み込みで指定したバイト数を読めない場合はエラー
fn read_exact(src: &mut dyn Source, pos: u64, buf: &mut [u8]) -> Result<()> {
    let n = src.read_at(pos, buf)?;
    if n != buf.len() {
        return Err(format!(
            "YBB read error: expected {} bytes at offset {}, got {}",
            buf.len(),
            pos,
            n
        ));
    }
    Ok(())
}

fn u16_at(b: &[u8], off: usize) -> u16 {
    u16::from_le_bytes([b[off], b[off + 1]])
}

fn u64_at(b: &[u8], off: usize) -> u64 {
    u64::from_le_bytes(b[off..off + 8].try_into().unwrap())
}

fn packed_bytes(p: &Packed) -> [u8; 32] {
    let mut out = [0u8; 32];
    for (i, w) in p.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&w.to_le_bytes());
    }
    out
}

fn packed_from_bytes(b: &[u8]) -> Packed {
    let mut p: Packed = [0; 8];
    for (i, w) in p.iter_mut().enumerate() {
        *w = u32::from_le_bytes(b[i * 4..i * 4 + 4].try_into().unwrap());
    }
    p
}

/// sfenToPackedSfen
fn pack_key(sfen: &str) -> Result<[u8; 32]> {
    pack_sfen(sfen)
        .map(|p| packed_bytes(&p))
        .ok_or_else(|| format!("Invalid SFEN: {}", sfen))
}

// ---------------------------------------------------------------------------
// 指し手 (yane_move.ts)

/// squareFromYane
fn square_from_yane(value: u16) -> String {
    let file = value / 9 + 1;
    let rank = value % 9 + 1;
    format!("{}{}", file, (b'a' + rank as u8 - 1) as char)
}

/// fromYaneMove16
pub fn from_yane_move16(value: u16) -> Result<String> {
    let to = square_from_yane(value & 0x7f);
    if value & (1 << 14) != 0 {
        let pt = (value >> 7) & 0x7f;
        let piece = match pt {
            1 => "P",
            2 => "L",
            3 => "N",
            4 => "S",
            5 => "B",
            6 => "R",
            7 => "G",
            _ => return Err(format!("Invalid YaneuraOu Move16 drop piece type: {}", pt)),
        };
        return Ok(format!("{}*{}", piece, to));
    }
    let from = square_from_yane((value >> 7) & 0x7f);
    let promote = if value & (1 << 15) != 0 { "+" } else { "" };
    Ok(format!("{}{}{}", from, to, promote))
}

/// Square.newByUSI と toAperySquare
fn yane_square(s: &[u8]) -> Option<u16> {
    if s.len() != 2 || !(b'1'..=b'9').contains(&s[0]) || !(b'a'..=b'i').contains(&s[1]) {
        return None;
    }
    Some((s[0] - b'1') as u16 * 9 + (s[1] - b'a') as u16)
}

/// toYaneMove16。指し手を解析できない場合はエラー (JavaScript 版では例外になる)
pub fn to_yane_move16(usi: &str) -> Result<u16> {
    let invalid = || format!("Invalid USI move: {}", usi);
    let chars: Vec<char> = usi.chars().collect();
    let take = |range: std::ops::Range<usize>| -> String {
        chars.get(range).map(|c| c.iter().collect()).unwrap_or_default()
    };
    let from = take(0..2.min(chars.len()));
    let to = take(2.min(chars.len())..4.min(chars.len()));
    let promote: u16 = if chars.len() == 5 { 1 } else { 0 };
    let to_sq = yane_square(to.as_bytes()).ok_or_else(invalid)?;
    let from_chars: Vec<char> = from.chars().collect();
    if from_chars.get(1) == Some(&'*') {
        // Piece.newBySFEN: 玉は飛車として扱われる (JavaScript 版と同じ)
        let pt = match from_chars[0].to_ascii_uppercase() {
            'P' => 1,
            'L' => 2,
            'N' => 3,
            'S' => 4,
            'G' => 7,
            'B' => 5,
            'R' | 'K' => 6,
            _ => return Err(invalid()),
        };
        return Ok((1 << 14) | (pt << 7) | to_sq);
    }
    let from_sq = yane_square(from.as_bytes()).ok_or_else(invalid)?;
    Ok((promote << 15) | (from_sq << 7) | to_sq)
}

// ---------------------------------------------------------------------------
// 数値の書き込み

/// Buffer.writeInt16LE・writeUInt16LE: 範囲外の場合はエラー。範囲内の場合は小数を切り捨てる (NaN は 0)
fn checked_16(x: f64, min: f64, max: f64) -> Result<u16> {
    if x > max || x < min {
        return Err(format!(
            "The value of \"value\" is out of range. It must be >= {} and <= {}. Received {}",
            min, max, x
        ));
    }
    Ok((x.trunc() as i64) as u16)
}

fn int16(x: f64) -> Result<u16> {
    checked_16(x, -32768.0, 32767.0)
}

fn uint16(x: f64) -> Result<u16> {
    checked_16(x, 0.0, 65535.0)
}

/// DataView.setUint16: 65536 で割った余り (NaN・無限大は 0)
fn to_uint16(x: f64) -> u16 {
    if !x.is_finite() {
        return 0;
    }
    (x.trunc() as i64).rem_euclid(65536) as u16
}

/// 指し手を書き出す形式にする
fn encode_moves(moves: &[BookMove], has_depth: bool, out: &mut Vec<u8>) -> Result<()> {
    for m in moves {
        out.extend_from_slice(&to_yane_move16(&m.usi)?.to_le_bytes());
        out.extend_from_slice(&int16(m.score.unwrap_or(0.0))?.to_le_bytes());
        if has_depth {
            out.extend_from_slice(&uint16(m.depth.unwrap_or(0.0))?.to_le_bytes());
        }
    }
    Ok(())
}

/// readMoves
fn read_moves(buf: &[u8], count: usize, entry_size: usize) -> Result<Vec<BookMove>> {
    let mut moves = Vec::with_capacity(count);
    for i in 0..count {
        let off = i * entry_size;
        let move16 = u16_at(buf, off);
        let score = i16::from_le_bytes([buf[off + 2], buf[off + 3]]);
        let depth = if entry_size >= MOVE_ENTRY_SIZE_V1 {
            Some(u16_at(buf, off + 4))
        } else {
            None
        };
        moves.push(BookMove {
            usi: from_yane_move16(move16)?,
            score: Some(score as f64),
            depth: depth.filter(|&d| d > 0).map(|d| d as f64),
            ..Default::default()
        });
    }
    Ok(moves)
}

fn has_depth(entry: &Entry) -> bool {
    entry.moves.iter().any(|m| m.depth.is_some_and(|d| d > 0.0))
}

// ---------------------------------------------------------------------------
// 順に読み込む

/// 元のファイルを読み込むためのバッファー。同じ範囲を続けて読む場合に読み込みの回数を減らす。
struct Window {
    pos: u64,
    buf: Vec<u8>,
}

impl Window {
    fn new() -> Window {
        Window {
            pos: 0,
            buf: Vec::new(),
        }
    }

    /// pos から len バイトを返す。読み込めない場合は readExact と同じエラー
    fn get(&mut self, src: &mut dyn Source, pos: u64, len: usize) -> Result<&[u8]> {
        let end = self.pos + self.buf.len() as u64;
        if pos < self.pos || pos + len as u64 > end {
            let size = len.max(READ_CHUNK);
            self.buf.resize(size, 0);
            let n = src.read_at(pos, &mut self.buf)?;
            self.buf.truncate(n);
            self.pos = pos;
            if n < len {
                return Err(format!(
                    "YBB read error: expected {} bytes at offset {}, got {}",
                    len, pos, n
                ));
            }
        }
        let start = (pos - self.pos) as usize;
        Ok(&self.buf[start..start + len])
    }
}

// ---------------------------------------------------------------------------
// 開く・検索

pub struct YbbOnTheFly {
    pub record_count: u64,
    pub flags: u64,
}

impl YbbOnTheFly {
    /// 元のファイルが無い空の定跡
    pub fn empty() -> YbbOnTheFly {
        YbbOnTheFly {
            record_count: 0,
            flags: 0,
        }
    }

    /// openYbbBookOnTheFly: ヘッダーを読み込む
    pub fn open(src: &mut dyn Source) -> Result<YbbOnTheFly> {
        let mut header = [0u8; HEADER_SIZE as usize];
        read_exact(src, 0, &mut header)?;
        // JavaScript 版と同じく ASCII として比較する (上位ビットは無視される)
        let magic: String = header[..16].iter().map(|&b| (b & 0x7f) as char).collect();
        if magic.as_bytes() != MAGIC {
            return Err(format!("Invalid YBB magic: {}", magic));
        }
        Ok(YbbOnTheFly {
            record_count: u64_at(&header, 16),
            flags: u64_at(&header, 24),
        })
    }

    fn moves_area_start(&self) -> u64 {
        HEADER_SIZE + self.record_count * RECORD_SIZE
    }

    /// searchYbbBookMovesOnTheFly
    pub fn search(&self, src: &mut dyn Source, sfen: &str) -> Result<Option<Entry>> {
        if self.record_count == 0 {
            return Ok(None);
        }
        let target = pack_key(sfen)?;
        let entry_size = move_entry_size(self.flags);
        let mut rec = [0u8; RECORD_SIZE as usize];
        let mut lo: u64 = 0;
        let mut hi: u64 = self.record_count - 1;
        while lo <= hi {
            let mid = (lo + hi) / 2;
            read_exact(src, HEADER_SIZE + mid * RECORD_SIZE, &mut rec)?;
            match rec[..32].cmp(&target[..]) {
                Ordering::Equal => {
                    let rel = u64_at(&rec, 32);
                    let ply = u16_at(&rec, 40) as f64;
                    let count = u16_at(&rec, 42) as usize;
                    let mut entry = Entry {
                        min_ply: Some(ply),
                        ..Default::default()
                    };
                    if count > 0 {
                        let mut buf = vec![0u8; count * entry_size];
                        read_exact(src, self.moves_area_start() + rel, &mut buf)?;
                        entry.moves = read_moves(&buf, count, entry_size)?;
                    }
                    return Ok(Some(entry));
                }
                Ordering::Less => lo = mid + 1,
                Ordering::Greater => {
                    if mid == 0 {
                        break;
                    }
                    hi = mid - 1;
                }
            }
        }
        Ok(None)
    }

    /// loadYbbBookFull: 指し手のある全ての局面 (JavaScript の Map と同じく、同じ局面は後のもので上書きする)
    pub fn all_entries(&self, src: &mut dyn Source) -> Result<Vec<(String, Entry)>> {
        let entry_size = move_entry_size(self.flags);
        let moves_area = self.moves_area_start();
        let mut index_window = Window::new();
        let mut moves_window = Window::new();
        let mut entries: Vec<(String, Entry)> = Vec::new();
        let mut positions: HashMap<String, usize> = HashMap::new();
        for i in 0..self.record_count {
            let rec = index_window.get(src, HEADER_SIZE + i * RECORD_SIZE, RECORD_SIZE as usize)?;
            let packed = packed_from_bytes(&rec[..32]);
            let rel = u64_at(rec, 32);
            let ply = u16_at(rec, 40) as f64;
            let count = u16_at(rec, 42) as usize;
            let sfen = unpack(&packed)
                .map(|b| b.to_sfen())
                .ok_or_else(|| "Invalid packed sfen".to_string())?;
            if count == 0 {
                continue;
            }
            let buf = moves_window.get(src, moves_area + rel, count * entry_size)?;
            let entry = Entry {
                moves: read_moves(buf, count, entry_size)?,
                min_ply: Some(ply),
                ..Default::default()
            };
            match positions.get(&sfen) {
                Some(&p) => entries[p].1 = entry,
                None => {
                    positions.insert(sfen.clone(), entries.len());
                    entries.push((sfen, entry));
                }
            }
        }
        Ok(entries)
    }
}

// ---------------------------------------------------------------------------
// 書き出し

/// 書き出す局面の一覧から 1 件ずつ取り出す処理の状態
#[derive(Clone, Copy)]
enum Item {
    /// 元のファイルのみ (レコードの番号)
    Base(u64),
    /// 編集内容のみ (編集内容の番号)
    Patch(usize),
    /// 両方 (統合する)
    Both(u64, usize),
}

/// 元のファイルの局面と編集内容を局面順に並べる (mergeYbbBook と同じ順序)
struct Scan {
    base_index: u64,
    patch_index: usize,
}

impl Scan {
    fn new() -> Scan {
        Scan {
            base_index: 0,
            patch_index: 0,
        }
    }

    fn next(
        &mut self,
        src: &mut dyn Source,
        window: &mut Window,
        base_count: u64,
        patches: &[Patch],
    ) -> Result<Option<Item>> {
        let base_left = self.base_index < base_count;
        let patch_left = self.patch_index < patches.len();
        let ordering = match (base_left, patch_left) {
            (false, false) => return Ok(None),
            (false, true) => Ordering::Greater,
            (true, false) => Ordering::Less,
            (true, true) => {
                let key = window.get(src, HEADER_SIZE + self.base_index * RECORD_SIZE, 32)?;
                key.cmp(&patches[self.patch_index].key[..])
            }
        };
        let item = match ordering {
            Ordering::Less => {
                self.base_index += 1;
                Item::Base(self.base_index - 1)
            }
            Ordering::Greater => {
                self.patch_index += 1;
                Item::Patch(self.patch_index - 1)
            }
            Ordering::Equal => {
                self.base_index += 1;
                self.patch_index += 1;
                Item::Both(self.base_index - 1, self.patch_index - 1)
            }
        };
        Ok(Some(item))
    }
}

struct Patch {
    key: [u8; 32],
    entry: Entry,
}

#[derive(PartialEq)]
enum Phase {
    Index,
    Moves,
    Done,
}

/// 元のファイルに in-memory のエントリーを統合して書き出す (mergeYbbBook)。
/// JavaScript 版はファイルの位置を指定して索引と指し手を交互に書き込むが、ここでは先頭から順に書き出す
/// (ヘッダー・索引・指し手の順に、2 回に分けて元のファイルを読む)。
pub struct YbbMerger {
    patches: Vec<Patch>,
    /// 両方にある局面の統合結果 (編集内容の番号ごと)
    merged: Vec<Option<Entry>>,
    record_count: u64,
    base_count: u64,
    base_entry_size: usize,
    base_moves_area: u64,
    out_entry_size: usize,
    out_has_depth: bool,
    header_written: bool,
    phase: Phase,
    scan: Scan,
    written: u64,
    moves_pos: u64,
    index_window: Window,
    moves_window: Window,
}

impl YbbMerger {
    pub fn new(
        src: &mut dyn Source,
        book: &YbbOnTheFly,
        patches: Vec<(String, Entry)>,
    ) -> Result<YbbMerger> {
        let mut sorted = Vec::with_capacity(patches.len());
        for (sfen, entry) in patches {
            sorted.push(Patch {
                key: pack_key(&sfen)?,
                entry,
            });
        }
        // 同じ局面は無い (キーは一意) が、JavaScript の Array.prototype.sort と同じく安定な整列を使う
        sorted.sort_by(|a, b| a.key.cmp(&b.key));
        let base_entry_size = move_entry_size(book.flags);
        let out_has_depth = book.flags & 1 == 1 || sorted.iter().any(|p| has_depth(&p.entry));
        let out_entry_size = if out_has_depth {
            MOVE_ENTRY_SIZE_V1
        } else {
            MOVE_ENTRY_SIZE_V0
        };
        let mut merger = YbbMerger {
            merged: (0..sorted.len()).map(|_| None).collect(),
            patches: sorted,
            record_count: 0,
            base_count: book.record_count,
            base_entry_size,
            base_moves_area: book.moves_area_start(),
            out_entry_size,
            out_has_depth,
            header_written: false,
            phase: Phase::Index,
            scan: Scan::new(),
            written: 0,
            moves_pos: 0,
            index_window: Window::new(),
            moves_window: Window::new(),
        };
        // 出力するレコードの数を数え、両方にある局面を統合する。
        // 書き出せない値 (範囲外の評価値など) は書き出し始める前にエラーにする。
        let mut scan = Scan::new();
        let mut window = Window::new();
        while let Some(item) =
            scan.next(src, &mut window, merger.base_count, &merger.patches)?
        {
            merger.record_count += 1;
            let mut scratch = Vec::new();
            match item {
                Item::Base(_) => {}
                Item::Patch(p) => {
                    encode_moves(&merger.patches[p].entry.moves, out_has_depth, &mut scratch)?
                }
                Item::Both(b, p) => {
                    let (_, count, rel) = merger.read_record(src, b)?;
                    let base_moves = merger.read_base_moves(src, rel, count)?;
                    let base = Entry {
                        moves: base_moves,
                        ..Default::default()
                    };
                    let merged = merge_entries(Some(base), Some(&merger.patches[p].entry))
                        .unwrap_or_default();
                    encode_moves(&merged.moves, out_has_depth, &mut scratch)?;
                    merger.merged[p] = Some(merged);
                }
            }
        }
        Ok(merger)
    }

    /// 元のファイルのレコード (レコード全体・指し手の数・指し手の位置)
    fn read_record(&mut self, src: &mut dyn Source, index: u64) -> Result<([u8; 44], usize, u64)> {
        let rec = self.index_window.get(src, HEADER_SIZE + index * RECORD_SIZE, RECORD_SIZE as usize)?;
        let rec: [u8; 44] = rec.try_into().unwrap();
        Ok((rec, u16_at(&rec, 42) as usize, u64_at(&rec, 32)))
    }

    fn read_base_moves(&mut self, src: &mut dyn Source, rel: u64, count: usize) -> Result<Vec<BookMove>> {
        let size = count * self.base_entry_size;
        let buf = self.moves_window.get(src, self.base_moves_area + rel, size)?;
        read_moves(buf, count, self.base_entry_size)
    }

    /// 書き出しの進捗 (0〜1)
    pub fn progress(&self) -> f64 {
        if self.record_count == 0 {
            return 1.0;
        }
        let done = match self.phase {
            Phase::Index => self.written,
            Phase::Moves => self.record_count + self.written,
            Phase::Done => self.record_count * 2,
        };
        done as f64 / (self.record_count * 2) as f64
    }

    /// 続きを書き出す。この呼び出しで max_out バイト以上を書き出すか、最後まで書き出すと戻る。
    /// 最後まで書き出した場合は true を返す。
    pub fn write_next(&mut self, src: &mut dyn Source, max_out: usize, out: &mut Vec<u8>) -> Result<bool> {
        let start = out.len();
        if !self.header_written {
            out.extend_from_slice(MAGIC);
            out.extend_from_slice(&self.record_count.to_le_bytes());
            out.extend_from_slice(&(self.out_has_depth as u64).to_le_bytes());
            self.header_written = true;
        }
        while out.len() - start < max_out {
            if self.phase == Phase::Done {
                return Ok(true);
            }
            let mut window = std::mem::replace(&mut self.index_window, Window::new());
            let item = self.scan.next(src, &mut window, self.base_count, &self.patches);
            self.index_window = window;
            let Some(item) = item? else {
                self.phase = match self.phase {
                    Phase::Index => Phase::Moves,
                    _ => Phase::Done,
                };
                self.scan = Scan::new();
                self.written = 0;
                continue;
            };
            if self.phase == Phase::Index {
                self.write_record(src, item, out)?;
            } else {
                self.write_moves(src, item, out)?;
            }
            self.written += 1;
        }
        Ok(self.phase == Phase::Done)
    }

    fn write_record(&mut self, src: &mut dyn Source, item: Item, out: &mut Vec<u8>) -> Result<()> {
        let offset = self.moves_pos;
        let (mut rec, moves_len) = match item {
            Item::Base(b) => {
                let (rec, count, _) = self.read_record(src, b)?;
                (rec, count)
            }
            Item::Patch(p) => {
                let entry = &self.patches[p].entry;
                let mut rec = [0u8; 44];
                rec[..32].copy_from_slice(&self.patches[p].key);
                rec[40..42].copy_from_slice(&to_uint16(entry.min_ply.unwrap_or(1.0)).to_le_bytes());
                rec[42..44].copy_from_slice(&to_uint16(entry.moves.len() as f64).to_le_bytes());
                (rec, entry.moves.len())
            }
            Item::Both(b, p) => {
                let (mut rec, _, _) = self.read_record(src, b)?;
                let merged = self.merged[p].as_ref().expect("merged entry");
                let base_ply = u16_at(&rec, 40) as f64;
                if let Some(ply) = self.patches[p].entry.min_ply {
                    if ply < base_ply {
                        rec[40..42].copy_from_slice(&to_uint16(ply).to_le_bytes());
                    }
                }
                rec[42..44].copy_from_slice(&to_uint16(merged.moves.len() as f64).to_le_bytes());
                (rec, merged.moves.len())
            }
        };
        rec[32..40].copy_from_slice(&offset.to_le_bytes());
        out.extend_from_slice(&rec);
        self.moves_pos += (moves_len * self.out_entry_size) as u64;
        Ok(())
    }

    fn write_moves(&mut self, src: &mut dyn Source, item: Item, out: &mut Vec<u8>) -> Result<()> {
        match item {
            Item::Base(b) => {
                let (_, count, rel) = self.read_record(src, b)?;
                let size = count * self.base_entry_size;
                let (base_size, out_size) = (self.base_entry_size, self.out_entry_size);
                let buf = self.moves_window.get(src, self.base_moves_area + rel, size)?;
                if base_size == out_size {
                    out.extend_from_slice(buf);
                } else {
                    for i in 0..count {
                        out.extend_from_slice(&buf[i * base_size..(i + 1) * base_size]);
                        out.resize(out.len() + out_size - base_size, 0);
                    }
                }
            }
            Item::Patch(p) => encode_moves(&self.patches[p].entry.moves, self.out_has_depth, out)?,
            Item::Both(_, p) => {
                let merged = self.merged[p].as_ref().expect("merged entry");
                encode_moves(&merged.moves, self.out_has_depth, out)?;
            }
        }
        Ok(())
    }
}

/// 全ての局面を書き出す (storeYbbBook)。entries は JavaScript の Map と同じ順序。
pub struct YbbStore {
    records: Vec<([u8; 32], Entry)>,
    has_depth: bool,
    header_written: bool,
    phase: Phase,
    index: usize,
    moves_pos: u64,
}

impl YbbStore {
    pub fn new(entries: Vec<(String, Entry)>) -> Result<YbbStore> {
        let mut records = Vec::new();
        let mut depth = false;
        for (sfen, entry) in entries {
            if entry.moves.is_empty() {
                continue;
            }
            depth = depth || has_depth(&entry);
            records.push((pack_key(&sfen)?, entry));
        }
        // 同じ局面 (異なる SFEN から同じ Packed SFEN になる場合) は両方とも書き出す (安定な整列)
        records.sort_by(|a, b| a.0.cmp(&b.0));
        // 書き出せない値 (範囲外の評価値など) は書き出し始める前にエラーにする
        let mut scratch = Vec::new();
        for (_, entry) in &records {
            scratch.clear();
            encode_moves(&entry.moves, depth, &mut scratch)?;
        }
        Ok(YbbStore {
            records,
            has_depth: depth,
            header_written: false,
            phase: Phase::Index,
            index: 0,
            moves_pos: 0,
        })
    }

    pub fn progress(&self) -> f64 {
        let total = self.records.len() * 2;
        if total == 0 {
            return 1.0;
        }
        let done = match self.phase {
            Phase::Index => self.index,
            Phase::Moves => self.records.len() + self.index,
            Phase::Done => total,
        };
        done as f64 / total as f64
    }

    pub fn write_next(&mut self, max_out: usize, out: &mut Vec<u8>) -> Result<bool> {
        let start = out.len();
        if !self.header_written {
            out.extend_from_slice(MAGIC);
            out.extend_from_slice(&(self.records.len() as u64).to_le_bytes());
            out.extend_from_slice(&(self.has_depth as u64).to_le_bytes());
            self.header_written = true;
        }
        let entry_size = if self.has_depth {
            MOVE_ENTRY_SIZE_V1
        } else {
            MOVE_ENTRY_SIZE_V0
        };
        while out.len() - start < max_out {
            if self.phase == Phase::Done {
                return Ok(true);
            }
            let Some((key, entry)) = self.records.get(self.index) else {
                self.phase = match self.phase {
                    Phase::Index => Phase::Moves,
                    _ => Phase::Done,
                };
                self.index = 0;
                continue;
            };
            if self.phase == Phase::Index {
                out.extend_from_slice(key);
                out.extend_from_slice(&self.moves_pos.to_le_bytes());
                out.extend_from_slice(&to_uint16(entry.min_ply.unwrap_or(1.0)).to_le_bytes());
                out.extend_from_slice(&to_uint16(entry.moves.len() as f64).to_le_bytes());
                self.moves_pos += (entry.moves.len() * entry_size) as u64;
            } else {
                encode_moves(&entry.moves, self.has_depth, out)?;
            }
            self.index += 1;
        }
        Ok(self.phase == Phase::Done)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_move16_round_trip() {
        for usi in ["7g7f", "2b8h+", "P*5e", "R*1a", "G*9i", "1a9i"] {
            let v = to_yane_move16(usi).unwrap();
            assert_eq!(from_yane_move16(v).unwrap(), usi);
        }
        // 玉の打ちは飛車として扱われる (JavaScript 版と同じ)
        assert_eq!(from_yane_move16(to_yane_move16("K*5e").unwrap()).unwrap(), "R*5e");
        assert!(to_yane_move16("0a1b").is_err());
        assert!(from_yane_move16((1 << 14) | (8 << 7)).is_err());
    }

    #[test]
    fn test_numbers() {
        assert_eq!(int16(-1.5).unwrap(), 0xffff);
        assert_eq!(int16(f64::NAN).unwrap(), 0);
        assert!(int16(32768.0).is_err());
        assert!(uint16(-1.0).is_err());
        assert_eq!(to_uint16(65537.0), 1);
        assert_eq!(to_uint16(-1.0), 65535);
        assert_eq!(to_uint16(f64::NAN), 0);
    }

    fn entry(usi: &str, score: f64, depth: Option<f64>) -> Entry {
        Entry {
            moves: vec![BookMove {
                usi: usi.into(),
                score: Some(score),
                depth,
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    fn write_store(entries: Vec<(String, Entry)>) -> Vec<u8> {
        let mut store = YbbStore::new(entries).unwrap();
        let mut out = Vec::new();
        while !store.write_next(16, &mut out).unwrap() {}
        out
    }

    #[test]
    fn test_store_search_merge() {
        let a = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
        let b = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
        let data = write_store(vec![
            (a.into(), entry("7g7f", 10.0, None)),
            (b.into(), entry("3c3d", -5.0, None)),
        ]);
        let mut src: &[u8] = &data;
        let book = YbbOnTheFly::open(&mut src).unwrap();
        assert_eq!(book.record_count, 2);
        let found = book.search(&mut src, a).unwrap().unwrap();
        assert_eq!(found.moves[0].usi, "7g7f");
        assert_eq!(found.moves[0].score, Some(10.0));
        assert!(book.search(&mut src, &a.replace(" b ", " w ")).unwrap().is_none());
        assert_eq!(book.all_entries(&mut src).unwrap().len(), 2);

        // 探索深さを持つ指し手を追加すると、全ての指し手が探索深さを持つ形式になる
        let patch = Entry {
            patch: true,
            ..entry("2g2f", 20.0, Some(8.0))
        };
        let mut merger = YbbMerger::new(&mut src, &book, vec![(a.into(), patch)]).unwrap();
        let mut out = Vec::new();
        while !merger.write_next(&mut src, 16, &mut out).unwrap() {}
        let mut merged_src: &[u8] = &out;
        let merged = YbbOnTheFly::open(&mut merged_src).unwrap();
        assert_eq!(merged.flags, 1);
        let found = merged.search(&mut merged_src, a).unwrap().unwrap();
        let usis: Vec<&str> = found.moves.iter().map(|m| m.usi.as_str()).collect();
        assert_eq!(usis, ["7g7f", "2g2f"]);
        assert_eq!(found.moves[1].depth, Some(8.0));
        assert_eq!(merged.search(&mut merged_src, b).unwrap().unwrap().moves[0].usi, "3c3d");

        // 範囲外の値は書き出し始める前にエラーになる
        assert!(YbbMerger::new(&mut src, &book, vec![(b.into(), entry("1g1f", 40000.0, None))]).is_err());
        assert!(YbbStore::new(vec![(a.into(), entry("7g7f", 40000.0, None))]).is_err());
    }
}
