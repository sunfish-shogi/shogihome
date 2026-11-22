//! 定跡データの保持。
//!
//! JavaScript 版の `Map<string, BookEntry>` と同じ意味を持つ。
//! - キーは SFEN 文字列で、文字列として完全一致したものを同じキーとみなす。
//! - 挿入順を保持し、既存のキーへの代入は順序を変えない (Map.set と同じ)。
//!
//! メモリを節約するため、正規形の SFEN (tsshogi の Position.sfen と同じ表記) で
//! 256 bit に詰められる局面は詰めた形で保持し、それ以外は文字列のまま保持する。

use crate::board::Board;
use crate::moves::{format_usi, pack_usi, parse_usi, unpack_usi, From, UsiMove};
use crate::packed::{pack, unpack, Packed};
use std::hash::{BuildHasherDefault, Hasher};

/// 局面のキーのための軽量なハッシュ関数
#[derive(Default)]
pub struct FxHasher {
    hash: u64,
}

impl Hasher for FxHasher {
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.write_u64(b as u64);
        }
    }

    fn write_u32(&mut self, i: u32) {
        self.write_u64(i as u64);
    }

    fn write_u64(&mut self, i: u64) {
        self.hash = (self.hash.rotate_left(5) ^ i).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
    }

    fn write_usize(&mut self, i: usize) {
        self.write_u64(i as u64);
    }

    fn finish(&self) -> u64 {
        self.hash
    }
}

pub type FxBuild = BuildHasherDefault<FxHasher>;

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub enum Key {
    Packed(Packed),
    Raw(Box<str>),
}

impl Key {
    /// SFEN 文字列からキーを作る
    pub fn from_str(sfen: &str) -> Key {
        if let Some(board) = Board::parse_sfen(sfen) {
            if let Some(packed) = pack(&board) {
                if board.to_sfen() == sfen {
                    return Key::Packed(packed);
                }
            }
        }
        Key::Raw(sfen.into())
    }

    /// 局面からキーを作る (Key::from_str(&board.to_sfen()) と同じ結果になる)
    pub fn from_board(board: &Board) -> Key {
        let has_negative = board.hands.iter().any(|h| h.iter().any(|&n| n < 0));
        if !has_negative {
            if let Some(packed) = pack(board) {
                return Key::Packed(packed);
            }
            return Key::Raw(board.to_sfen().into());
        }
        let normalized = board.normalized();
        match pack(&normalized) {
            Some(packed) => Key::Packed(packed),
            None => Key::Raw(normalized.to_sfen().into()),
        }
    }

    pub fn to_sfen(&self) -> String {
        match self {
            Key::Packed(p) => unpack(p).map(|b| b.to_sfen()).unwrap_or_default(),
            Key::Raw(s) => s.to_string(),
        }
    }

    /// tsshogi の Position.newBySFEN(sfen) に相当する
    pub fn to_board(&self) -> Option<Board> {
        match self {
            Key::Packed(p) => unpack(p),
            Key::Raw(s) => Board::parse_sfen(s),
        }
    }
}

/// 指し手の USI。正規形であれば 32bit に詰めて保持する。
#[derive(Clone, PartialEq, Debug)]
pub enum Usi {
    Packed(u32),
    Raw(Box<str>),
}

impl Usi {
    pub fn from_str(usi: &str) -> Usi {
        if let Some(m) = parse_usi(usi) {
            if format_usi(&m) == usi {
                return Usi::Packed(pack_usi(&m));
            }
        }
        Usi::Raw(usi.into())
    }

    pub fn from_move(m: &UsiMove) -> Usi {
        match m.from {
            // 成駒を打つ指し手 ("+P*5e" など) は解析できない表記になるため文字列で保持する
            From::Drop(t) if !(1..=8).contains(&t) => Usi::Raw(format_usi(m).into()),
            _ => Usi::Packed(pack_usi(m)),
        }
    }

    pub fn to_string(&self) -> String {
        match self {
            Usi::Packed(v) => format_usi(&unpack_usi(*v)),
            Usi::Raw(s) => s.to_string(),
        }
    }

    /// tsshogi の parseUSIMove に相当する
    pub fn parse(&self) -> Option<UsiMove> {
        match self {
            Usi::Packed(v) => Some(unpack_usi(*v)),
            Usi::Raw(s) => parse_usi(s),
        }
    }
}

#[derive(Clone, Default, PartialEq, Debug)]
pub struct MoveExtra {
    pub usi2: Option<String>,
    pub score: Option<f64>,
    pub depth: Option<f64>,
    pub comment: Option<String>,
}

/// BookMove (src/common/book.ts)
#[derive(Clone, PartialEq, Debug)]
pub struct BookMove {
    pub usi: Usi,
    pub count: Option<f64>,
    pub sbk_eval: Option<f64>,
    pub sbk_id: Option<f64>,
    pub extra: Option<Box<MoveExtra>>,
}

impl BookMove {
    pub fn new(usi: Usi) -> BookMove {
        BookMove {
            usi,
            count: None,
            sbk_eval: None,
            sbk_id: None,
            extra: None,
        }
    }
}

/// SbkEval (src/background/book/types.ts)
#[derive(Clone, PartialEq, Debug)]
pub struct Eval {
    pub evaluation_value: f64,
    pub depth: f64,
    pub sel_depth: f64,
    pub nodes: i64,
    pub variation: Option<String>,
    pub engine_name: Option<String>,
}

/// BookEntry (src/background/book/types.ts)
#[derive(Clone, Default, PartialEq, Debug)]
pub struct Entry {
    pub patch: bool,
    pub moves: Vec<BookMove>,
    pub min_ply: Option<f64>,
    pub comment: Option<String>,
    pub games: Option<f64>,
    pub won_black: Option<f64>,
    pub won_white: Option<f64>,
    pub sbk_evals: Option<Box<Vec<Eval>>>,
}

fn hash_key(key: &Key) -> u32 {
    let mut h: u64 = 0;
    match key {
        Key::Packed(p) => {
            for &w in p.iter() {
                h = (h.rotate_left(5) ^ w as u64).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
            }
        }
        Key::Raw(s) => {
            h = 0x9e37_79b9_7f4a_7c15;
            for &b in s.as_bytes() {
                h = (h.rotate_left(5) ^ b as u64).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
            }
        }
    }
    (h >> 32) as u32
}

const EMPTY: u32 = u32::MAX;

/// JavaScript の Map と同じく挿入順を保持する辞書。
/// キーと値は挿入順の配列に保持し、ハッシュ表には配列の番号だけを持つ (オープンアドレス法)。
#[derive(Default)]
pub struct Store {
    keys: Vec<Key>,
    values: Vec<Entry>,
    /// (ハッシュ値, 配列の番号) の表。番号が EMPTY の場合は空き。
    slots: Vec<(u32, u32)>,
}

impl Store {
    pub fn len(&self) -> usize {
        self.keys.len()
    }

    fn mask(&self) -> usize {
        self.slots.len() - 1
    }

    /// キーが存在すれば Ok(配列の番号)、無ければ Err(挿入すべきスロット) を返す
    fn lookup(&self, key: &Key, hash: u32) -> Result<usize, usize> {
        let mask = self.mask();
        let mut slot = hash as usize & mask;
        loop {
            let (h, i) = self.slots[slot];
            if i == EMPTY {
                return Err(slot);
            }
            if h == hash && self.keys[i as usize] == *key {
                return Ok(i as usize);
            }
            slot = (slot + 1) & mask;
        }
    }

    fn grow(&mut self, min_len: usize) {
        let mut cap = self.slots.len().max(16);
        while cap < min_len * 2 {
            cap *= 2;
        }
        if cap == self.slots.len() {
            return;
        }
        let old = std::mem::replace(&mut self.slots, vec![(0, EMPTY); cap]);
        let mask = cap - 1;
        for (h, i) in old {
            if i == EMPTY {
                continue;
            }
            let mut slot = h as usize & mask;
            while self.slots[slot].1 != EMPTY {
                slot = (slot + 1) & mask;
            }
            self.slots[slot] = (h, i);
        }
    }

    pub fn find(&self, key: &Key) -> Option<usize> {
        if self.slots.is_empty() {
            return None;
        }
        self.lookup(key, hash_key(key)).ok()
    }

    pub fn get(&self, key: &Key) -> Option<&Entry> {
        self.find(key).map(|i| &self.values[i])
    }

    /// Map.set と同じく、既存のキーであれば順序を変えずに値を置き換える
    pub fn set(&mut self, key: Key, entry: Entry) -> usize {
        if self.slots.len() < (self.keys.len() + 1) * 2 {
            self.grow(self.keys.len() + 1);
        }
        let hash = hash_key(&key);
        match self.lookup(&key, hash) {
            Ok(i) => {
                self.values[i] = entry;
                i
            }
            Err(slot) => {
                let i = self.keys.len();
                self.slots[slot] = (hash, i as u32);
                self.keys.push(key);
                self.values.push(entry);
                i
            }
        }
    }

    pub fn key_at(&self, i: usize) -> &Key {
        &self.keys[i]
    }

    pub fn entry_at(&self, i: usize) -> &Entry {
        &self.values[i]
    }

    pub fn reserve(&mut self, n: usize) {
        self.keys.reserve(n);
        self.values.reserve(n);
        self.grow(self.keys.len() + n);
    }
}
