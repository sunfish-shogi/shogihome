//! Apery 形式の On-the-fly 処理。
//! src/background/book/apery.ts (searchAperyBookMovesOnTheFly・mergeAperyBook・storeAperyBook) と
//! apery_zobrist.ts (局面のハッシュ値) の移植。同じ入力に対して同じ結果 (検索結果・書き出したバイト列) を得る。
//!
//! 定跡のエントリーは 16 バイト (ハッシュ値 64 bit・指し手 16 bit・回数 16 bit・評価値 32 bit) で、
//! ハッシュ値の順に並んでいる。元のファイルはメモリに読み込まず、Source を通して必要な部分だけを読む。

use crate::apery_zobrist::{HAND_TABLE, PIECE_TABLE, TURN};
use crate::board::*;
use crate::entry::{merge_entries, BookMove, Entry};
use crate::yane::Source;
use std::collections::HashMap;

const ENTRY_SIZE: u64 = 16;
/// 順に読み込む場合の読み込みの単位
const READ_CHUNK: usize = 1024 * 1024;

type Result<T> = std::result::Result<T, String>;

// ---------------------------------------------------------------------------
// ハッシュ値 (apery_zobrist.ts)

/// toAperyPiece の駒の種類の番号
fn apery_piece_type(t: u8) -> u64 {
    match t {
        PAWN => 1,
        LANCE => 2,
        KNIGHT => 3,
        SILVER => 4,
        BISHOP => 5,
        ROOK => 6,
        GOLD => 7,
        KING => 8,
        PROM_PAWN => 9,
        PROM_LANCE => 10,
        PROM_KNIGHT => 11,
        PROM_SILVER => 12,
        HORSE => 13,
        _ => 14, // DRAGON
    }
}

/// hash: 局面のハッシュ値。持ち駒は手番側のもののみ使う (JavaScript 版と同じ)。
pub fn hash(sfen: &str) -> Result<u64> {
    let board = Board::parse_sfen(sfen).ok_or("Invalid SFEN")?;
    let mut result: u64 = 0;
    for file in 1..=9u8 {
        for rank in 1..=9u8 {
            let piece = board.at(square_index(file, rank));
            if piece == 0 {
                continue;
            }
            let square = (file as u64 - 1) * 9 + (rank as u64 - 1);
            let index = apery_piece_type(piece_type(piece))
                + if piece_color(piece) == BLACK { 0 } else { 16 };
            result ^= PIECE_TABLE[(index * 81 + square) as usize];
        }
    }
    // handIndex: 歩・香・桂・銀・金・角・飛の順に 1〜7 (board の駒の種類の番号と同じ)
    for t in [PAWN, LANCE, KNIGHT, SILVER, GOLD, BISHOP, ROOK] {
        let n = board.hands[board.turn as usize][t as usize];
        let index = (t as i64 - 1) * 19 + n as i64;
        // 枚数が多すぎる場合、JavaScript 版は乱数表の範囲外を参照して例外になる
        let value = usize::try_from(index)
            .ok()
            .and_then(|i| HAND_TABLE.get(i))
            .ok_or("Invalid number of pieces in hand")?;
        result ^= value;
    }
    if board.turn == WHITE {
        result ^= TURN;
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// 指し手 (apery_move.ts)

fn square_usi(value: u16) -> String {
    format!("{}{}", value / 9 + 1, (b'a' + (value % 9) as u8) as char)
}

/// fromAperyMove
fn from_apery_move(value: u16) -> String {
    let to = square_usi(value & 0x7f);
    let from_value = (value >> 7) & 0x7f;
    let from = if from_value < 81 {
        square_usi(from_value)
    } else {
        // pieceTypeToSFEN: 範囲外の場合は null になる (JavaScript 版と同じ文字列にする)
        let piece = match from_value - 81 + 1 {
            1 => "P",
            2 => "L",
            3 => "N",
            4 => "S",
            5 => "B",
            6 => "R",
            7 => "G",
            8 => "K",
            9 => "+P",
            10 => "+L",
            11 => "+N",
            12 => "+S",
            13 => "+B",
            14 => "+R",
            _ => "null",
        };
        format!("{}*", piece)
    };
    let promote = if (value >> 14) & 1 == 1 { "+" } else { "" };
    format!("{}{}{}", from, to, promote)
}

/// Square.newByUSI と toAperySquare
fn apery_square(s: &[u8]) -> Option<u16> {
    if s.len() != 2 || !(b'1'..=b'9').contains(&s[0]) || !(b'a'..=b'i').contains(&s[1]) {
        return None;
    }
    Some((s[0] - b'1') as u16 * 9 + (s[1] - b'a') as u16)
}

/// toAperyMove。指し手を解析できない場合はエラー (JavaScript 版では例外になる)
fn to_apery_move(usi: &str) -> Result<u16> {
    let invalid = || format!("Invalid USI move: {}", usi);
    let chars: Vec<char> = usi.chars().collect();
    let take = |a: usize, b: usize| -> String {
        chars[a.min(chars.len())..b.min(chars.len())].iter().collect()
    };
    let from = take(0, 2);
    let to = take(2, 4);
    let promote: u16 = if chars.len() == 5 { 1 } else { 0 };
    let from_chars: Vec<char> = from.chars().collect();
    let from_value = if from_chars.get(1) == Some(&'*') {
        // Piece.newBySFEN と toAperyHand (玉は 8)
        let index = match from_chars[0].to_ascii_uppercase() {
            'P' => 1,
            'L' => 2,
            'N' => 3,
            'S' => 4,
            'B' => 5,
            'R' => 6,
            'G' => 7,
            'K' => 8,
            _ => return Err(invalid()),
        };
        index + 81 - 1
    } else {
        apery_square(from.as_bytes()).ok_or_else(invalid)?
    };
    let to_value = apery_square(to.as_bytes()).ok_or_else(invalid)?;
    Ok((promote << 14) | (from_value << 7) | to_value)
}

/// Buffer の書き込み: 範囲外の場合はエラー。範囲内の場合は小数を切り捨てる
fn checked(x: f64, min: f64, max: f64) -> Result<i64> {
    if x > max || x < min {
        return Err(format!(
            "The value of \"value\" is out of range. It must be >= {} and <= {}. Received {}",
            min, max, x
        ));
    }
    Ok(x.trunc() as i64)
}

/// JavaScript の `x || 0` (x が number の場合)
fn or_zero(x: Option<f64>) -> f64 {
    match x {
        Some(v) if v != 0.0 && !v.is_nan() => v,
        _ => 0.0,
    }
}

/// encodeEntry
fn encode_entry(key: u64, m: &BookMove, out: &mut Vec<u8>) -> Result<()> {
    out.extend_from_slice(&key.to_le_bytes());
    out.extend_from_slice(&to_apery_move(&m.usi)?.to_le_bytes());
    out.extend_from_slice(&(checked(or_zero(m.count), 0.0, 65535.0)? as u16).to_le_bytes());
    out.extend_from_slice(
        &(checked(or_zero(m.score), -2147483648.0, 2147483647.0)? as i32).to_le_bytes(),
    );
    Ok(())
}

/// decodeEntry
fn decode_entry(b: &[u8]) -> (u64, BookMove) {
    let key = u64::from_le_bytes(b[0..8].try_into().unwrap());
    let mv = u16::from_le_bytes([b[8], b[9]]);
    let count = u16::from_le_bytes([b[10], b[11]]);
    let score = i32::from_le_bytes(b[12..16].try_into().unwrap());
    (
        key,
        BookMove {
            usi: from_apery_move(mv),
            score: Some(score as f64),
            count: Some(count as f64),
            ..Default::default()
        },
    )
}

/// 書き出せない値 (範囲外の回数・評価値など) が無いかを検査する
fn validate(entries: &[(u64, Entry)]) -> Result<()> {
    let mut scratch = Vec::new();
    for (key, entry) in entries {
        for m in &entry.moves {
            scratch.clear();
            encode_entry(*key, m, &mut scratch)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 開く・検索

pub struct AperyOnTheFly {
    pub size: u64,
}

impl AperyOnTheFly {
    /// binarySearch: 局面のエントリーの先頭の位置
    fn binary_search(&self, src: &mut dyn Source, key: u64) -> Result<Option<u64>> {
        // JavaScript 版と同じく、読み込みに使うバッファーは使い回す (読み込めなかった部分には前の内容が残る)
        let mut buffer = [0u8; 8];
        let mut begin: u64 = 0;
        let mut end: u64 = self.size;
        while begin < end {
            let mid = (begin + end) / 2;
            let mut offset = mid - mid % ENTRY_SIZE;
            loop {
                if offset < begin {
                    break;
                }
                src.read_at(offset, &mut buffer)?;
                let current = u64::from_le_bytes(buffer);
                if key < current {
                    end = mid;
                    break;
                } else if key > current {
                    begin = offset + ENTRY_SIZE;
                    break;
                } else if offset == begin {
                    return Ok(Some(offset));
                }
                if offset < ENTRY_SIZE {
                    break;
                }
                offset -= ENTRY_SIZE;
            }
        }
        Ok(None)
    }

    /// searchAperyBookMovesOnTheFly
    pub fn search(&self, src: &mut dyn Source, sfen: &str) -> Result<Option<Entry>> {
        let key = hash(sfen)?;
        let Some(mut offset) = self.binary_search(src, key)? else {
            return Ok(None);
        };
        let mut moves = Vec::new();
        while offset < self.size {
            let mut buffer = [0u8; ENTRY_SIZE as usize];
            src.read_at(offset, &mut buffer)?;
            let (k, m) = decode_entry(&buffer);
            if k != key {
                break;
            }
            moves.push(m);
            offset += ENTRY_SIZE;
        }
        Ok(Some(Entry {
            moves,
            ..Default::default()
        }))
    }
}

// ---------------------------------------------------------------------------
// 書き出し

/// 元のファイルに in-memory のエントリーを統合して書き出す (mergeAperyBook)
pub struct AperyMerger {
    patches: Vec<(u64, Entry)>,
    patch_index: usize,
    /// 最後に書き出したパッチのキー。JavaScript 版は 0 で初期化するため、ハッシュ値が 0 の局面を書き出さない
    /// 不具合があるが、WebAssembly 版では書き出したパッチが無い状態と区別する。
    last_patch_key: Option<u64>,
    /// 元のファイルの読み込み位置
    pos: u64,
    size: u64,
    buf: Vec<u8>,
    buf_pos: u64,
    /// 読み込み中のエントリー (ハッシュ値が同じ連続したエントリー)
    current: Option<(u64, Entry)>,
    done: bool,
}

impl AperyMerger {
    /// patches のキーはハッシュ値 (10 進数の文字列)
    pub fn new(book: &AperyOnTheFly, patches: Vec<(String, Entry)>) -> Result<AperyMerger> {
        // JavaScript 版はストリームのチャンクが 16 バイトの倍数でない場合 (ファイルの末尾) にエラーになる
        if book.size % ENTRY_SIZE != 0 {
            return Err("Invalid Apery book format".to_string());
        }
        let mut sorted = Vec::with_capacity(patches.len());
        for (key, entry) in patches {
            let key: u64 = key.parse().map_err(|_| format!("Invalid key: {}", key))?;
            sorted.push((key, entry));
        }
        sorted.sort_by_key(|(key, _)| *key);
        validate(&sorted)?;
        Ok(AperyMerger {
            patches: sorted,
            patch_index: 0,
            last_patch_key: None,
            pos: 0,
            size: book.size,
            buf: Vec::new(),
            buf_pos: 0,
            current: None,
            done: false,
        })
    }

    pub fn progress(&self) -> f64 {
        if self.size == 0 {
            return if self.done { 1.0 } else { 0.0 };
        }
        self.pos as f64 / self.size as f64
    }

    fn write_moves(out: &mut Vec<u8>, key: u64, entry: &Entry) -> Result<()> {
        for m in &entry.moves {
            encode_entry(key, m, out)?;
        }
        Ok(())
    }

    /// 元のファイルのエントリーを、それ以前のパッチと共に書き出す
    fn emit(&mut self, key: u64, entry: Entry, out: &mut Vec<u8>) -> Result<()> {
        while self.patch_index < self.patches.len() {
            let (patch_key, patch) = &self.patches[self.patch_index];
            if *patch_key > key {
                break;
            }
            if *patch_key == key {
                let merged = merge_entries(Some(entry.clone()), Some(patch)).unwrap_or_default();
                Self::write_moves(out, *patch_key, &merged)?;
            } else {
                Self::write_moves(out, *patch_key, patch)?;
            }
            self.last_patch_key = Some(*patch_key);
            self.patch_index += 1;
        }
        if self.last_patch_key != Some(key) {
            Self::write_moves(out, key, &entry)?;
        }
        Ok(())
    }

    /// 元のファイルの次の 16 バイト
    fn next_record(&mut self, src: &mut dyn Source) -> Result<Option<[u8; 16]>> {
        if self.pos >= self.size {
            return Ok(None);
        }
        let end = self.buf_pos + self.buf.len() as u64;
        if self.pos + ENTRY_SIZE > end {
            let len = (READ_CHUNK as u64).min(self.size - self.pos) as usize;
            self.buf.resize(len, 0);
            let mut read = 0;
            while read < len {
                let n = src.read_at(self.pos + read as u64, &mut self.buf[read..])?;
                if n == 0 {
                    return Err("Unexpected end of the book file".to_string());
                }
                read += n;
            }
            self.buf_pos = self.pos;
        }
        let start = (self.pos - self.buf_pos) as usize;
        let record: [u8; 16] = self.buf[start..start + 16].try_into().unwrap();
        self.pos += ENTRY_SIZE;
        Ok(Some(record))
    }

    /// 続きを書き出す。この呼び出しで max_out バイト以上を書き出すか、最後まで書き出すと戻る。
    /// 最後まで書き出した場合は true を返す。
    pub fn write_next(&mut self, src: &mut dyn Source, max_out: usize, out: &mut Vec<u8>) -> Result<bool> {
        if self.done {
            return Ok(true);
        }
        let start = out.len();
        while out.len() - start < max_out {
            let Some(record) = self.next_record(src)? else {
                if let Some((key, entry)) = self.current.take() {
                    self.emit(key, entry, out)?;
                }
                while self.patch_index < self.patches.len() {
                    let (key, patch) = &self.patches[self.patch_index];
                    Self::write_moves(out, *key, patch)?;
                    self.patch_index += 1;
                }
                self.done = true;
                return Ok(true);
            };
            // load: ハッシュ値が同じ連続したエントリーをまとめる (同じ指し手は先のものを使う)
            let (key, m) = decode_entry(&record);
            match &mut self.current {
                Some((k, entry)) if *k == key => {
                    if !entry.moves.iter().any(|x| x.usi == m.usi) {
                        entry.moves.push(m);
                    }
                }
                _ => {
                    if let Some((k, entry)) = self.current.take() {
                        self.emit(k, entry, out)?;
                    }
                    self.current = Some((
                        key,
                        Entry {
                            moves: vec![m],
                            ..Default::default()
                        },
                    ));
                }
            }
        }
        Ok(false)
    }
}

/// 全ての局面を書き出す (他の形式からの変換。storeAperyBook)。entries は JavaScript の Map と同じ順序。
pub struct AperyStore {
    entries: Vec<(u64, Entry)>,
    index: usize,
}

impl AperyStore {
    pub fn new(entries: Vec<(String, Entry)>) -> Result<AperyStore> {
        // 同じハッシュ値になる局面は後のもので上書きする (JavaScript 版の Map と同じ)
        let mut by_key: Vec<(u64, Entry)> = Vec::new();
        let mut positions: HashMap<u64, usize> = HashMap::new();
        for (sfen, entry) in entries {
            let key = hash(&sfen)?;
            match positions.get(&key) {
                Some(&p) => by_key[p].1 = entry,
                None => {
                    positions.insert(key, by_key.len());
                    by_key.push((key, entry));
                }
            }
        }
        by_key.sort_by_key(|(key, _)| *key);
        validate(&by_key)?;
        Ok(AperyStore {
            entries: by_key,
            index: 0,
        })
    }

    pub fn progress(&self) -> f64 {
        if self.entries.is_empty() {
            return 1.0;
        }
        self.index as f64 / self.entries.len() as f64
    }

    pub fn write_next(&mut self, max_out: usize, out: &mut Vec<u8>) -> Result<bool> {
        let start = out.len();
        while out.len() - start < max_out {
            let Some((key, entry)) = self.entries.get(self.index) else {
                return Ok(true);
            };
            AperyMerger::write_moves(out, *key, entry)?;
            self.index += 1;
        }
        Ok(self.index >= self.entries.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash() {
        // JavaScript 版 (apery_zobrist.ts の hash) の値
        assert_eq!(hash(STANDARD_SFEN).unwrap(), 0xeebe8ee7e1ad7e15);
        assert_eq!(
            hash("lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1").unwrap(),
            0x3e7b1f82567220d5
        );
        // 後手番の持ち駒 (手番側の持ち駒のみ使う)
        assert_eq!(
            hash("4k4/9/9/9/9/9/9/9/4K4 w 2r2b4g4s4n4l18p 1").unwrap(),
            0x3f3078ee95d7770c
        );
    }

    #[test]
    fn test_move_round_trip() {
        for usi in ["7g7f", "2b8h+", "P*5e", "R*1a", "G*9i", "K*5e"] {
            assert_eq!(from_apery_move(to_apery_move(usi).unwrap()), usi);
        }
        assert_eq!(from_apery_move(0x7f << 7), "null*1a");
        assert!(to_apery_move("0a1b").is_err());
    }
}
