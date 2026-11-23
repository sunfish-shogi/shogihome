//! JavaScript との間で BookEntry を受け渡すためのバイナリ形式。
//! 形式は specs/book-wasm.md を参照。TypeScript 側の実装は src/background/book/wasm/codec.ts。

use crate::entry::{BookMove, Entry, Eval};

pub struct Decoder<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Decoder<'a> {
    pub fn new(buf: &'a [u8]) -> Decoder<'a> {
        Decoder { buf, pos: 0 }
    }

    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let end = self.pos.checked_add(n)?;
        let s = self.buf.get(self.pos..end)?;
        self.pos = end;
        Some(s)
    }

    pub fn u8(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }

    pub fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }

    pub fn f64(&mut self) -> Option<f64> {
        Some(f64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }

    pub fn i64(&mut self) -> Option<i64> {
        Some(i64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }

    pub fn str(&mut self) -> Option<&'a str> {
        let len = self.u32()? as usize;
        core::str::from_utf8(self.take(len)?).ok()
    }

    pub fn is_end(&self) -> bool {
        self.pos == self.buf.len()
    }
}

pub struct Encoder {
    pub buf: Vec<u8>,
}

impl Encoder {
    pub fn u8(&mut self, v: u8) {
        self.buf.push(v);
    }

    pub fn u32(&mut self, v: u32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn f64(&mut self, v: f64) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn i64(&mut self, v: i64) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn str(&mut self, s: &str) {
        self.u32(s.len() as u32);
        self.buf.extend_from_slice(s.as_bytes());
    }
}

// BookEntry のフラグ
const ENTRY_PATCH: u8 = 1;
const ENTRY_MIN_PLY: u8 = 2;
const ENTRY_COMMENT: u8 = 4;
const ENTRY_GAMES: u8 = 8;
const ENTRY_WON_BLACK: u8 = 16;
const ENTRY_WON_WHITE: u8 = 32;
const ENTRY_SBK_EVALS: u8 = 64;

// BookMove のフラグ
const MOVE_USI2: u8 = 1;
const MOVE_SCORE: u8 = 2;
const MOVE_DEPTH: u8 = 4;
const MOVE_COUNT: u8 = 8;
const MOVE_COMMENT: u8 = 16;
const MOVE_SBK_EVAL: u8 = 32;
const MOVE_SBK_ID: u8 = 64;

// SbkEval のフラグ
const EVAL_VARIATION: u8 = 1;
const EVAL_ENGINE_NAME: u8 = 2;

fn opt_f64(d: &mut Decoder, flags: u8, bit: u8) -> Option<Option<f64>> {
    Some(if flags & bit != 0 { Some(d.f64()?) } else { None })
}

fn opt_str(d: &mut Decoder, flags: u8, bit: u8) -> Option<Option<String>> {
    Some(if flags & bit != 0 { Some(d.str()?.to_string()) } else { None })
}

pub fn decode_entry(d: &mut Decoder) -> Option<Entry> {
    let flags = d.u8()?;
    let min_ply = opt_f64(d, flags, ENTRY_MIN_PLY)?;
    let comment = opt_str(d, flags, ENTRY_COMMENT)?;
    let games = opt_f64(d, flags, ENTRY_GAMES)?;
    let won_black = opt_f64(d, flags, ENTRY_WON_BLACK)?;
    let won_white = opt_f64(d, flags, ENTRY_WON_WHITE)?;
    let move_count = d.u32()? as usize;
    let mut moves = Vec::with_capacity(move_count.min(1024));
    for _ in 0..move_count {
        let usi = d.str()?.to_string();
        let mf = d.u8()?;
        moves.push(BookMove {
            usi,
            usi2: opt_str(d, mf, MOVE_USI2)?,
            score: opt_f64(d, mf, MOVE_SCORE)?,
            depth: opt_f64(d, mf, MOVE_DEPTH)?,
            count: opt_f64(d, mf, MOVE_COUNT)?,
            comment: opt_str(d, mf, MOVE_COMMENT)?,
            sbk_eval: opt_f64(d, mf, MOVE_SBK_EVAL)?,
            sbk_id: opt_f64(d, mf, MOVE_SBK_ID)?,
        });
    }
    let sbk_evals = if flags & ENTRY_SBK_EVALS != 0 {
        let n = d.u32()? as usize;
        let mut evals = Vec::with_capacity(n.min(1024));
        for _ in 0..n {
            let evaluation_value = d.f64()?;
            let depth = d.f64()?;
            let sel_depth = d.f64()?;
            let nodes = d.i64()?;
            let ef = d.u8()?;
            let variation = opt_str(d, ef, EVAL_VARIATION)?;
            let engine_name = opt_str(d, ef, EVAL_ENGINE_NAME)?;
            evals.push(Eval {
                evaluation_value,
                depth,
                sel_depth,
                nodes,
                variation,
                engine_name,
            });
        }
        Some(evals)
    } else {
        None
    };
    Some(Entry {
        patch: flags & ENTRY_PATCH != 0,
        moves,
        min_ply,
        comment,
        games,
        won_black,
        won_white,
        sbk_evals,
    })
}

pub fn encode_entry(e: &mut Encoder, entry: &Entry) {
    let mut flags = 0;
    if entry.patch {
        flags |= ENTRY_PATCH;
    }
    if entry.min_ply.is_some() {
        flags |= ENTRY_MIN_PLY;
    }
    if entry.comment.is_some() {
        flags |= ENTRY_COMMENT;
    }
    if entry.games.is_some() {
        flags |= ENTRY_GAMES;
    }
    if entry.won_black.is_some() {
        flags |= ENTRY_WON_BLACK;
    }
    if entry.won_white.is_some() {
        flags |= ENTRY_WON_WHITE;
    }
    if entry.sbk_evals.is_some() {
        flags |= ENTRY_SBK_EVALS;
    }
    e.u8(flags);
    if let Some(v) = entry.min_ply {
        e.f64(v);
    }
    if let Some(v) = &entry.comment {
        e.str(v);
    }
    if let Some(v) = entry.games {
        e.f64(v);
    }
    if let Some(v) = entry.won_black {
        e.f64(v);
    }
    if let Some(v) = entry.won_white {
        e.f64(v);
    }
    e.u32(entry.moves.len() as u32);
    for m in &entry.moves {
        e.str(&m.usi);
        let flag = |present: bool, bit: u8| if present { bit } else { 0 };
        e.u8(flag(m.usi2.is_some(), MOVE_USI2)
            | flag(m.score.is_some(), MOVE_SCORE)
            | flag(m.depth.is_some(), MOVE_DEPTH)
            | flag(m.count.is_some(), MOVE_COUNT)
            | flag(m.comment.is_some(), MOVE_COMMENT)
            | flag(m.sbk_eval.is_some(), MOVE_SBK_EVAL)
            | flag(m.sbk_id.is_some(), MOVE_SBK_ID));
        if let Some(v) = &m.usi2 {
            e.str(v);
        }
        if let Some(v) = m.score {
            e.f64(v);
        }
        if let Some(v) = m.depth {
            e.f64(v);
        }
        if let Some(v) = m.count {
            e.f64(v);
        }
        if let Some(v) = &m.comment {
            e.str(v);
        }
        if let Some(v) = m.sbk_eval {
            e.f64(v);
        }
        if let Some(v) = m.sbk_id {
            e.f64(v);
        }
    }
    if let Some(evals) = &entry.sbk_evals {
        e.u32(evals.len() as u32);
        for ev in evals.iter() {
            e.f64(ev.evaluation_value);
            e.f64(ev.depth);
            e.f64(ev.sel_depth);
            e.i64(ev.nodes);
            let mut ef = 0;
            if ev.variation.is_some() {
                ef |= EVAL_VARIATION;
            }
            if ev.engine_name.is_some() {
                ef |= EVAL_ENGINE_NAME;
            }
            e.u8(ef);
            if let Some(v) = &ev.variation {
                e.str(v);
            }
            if let Some(v) = &ev.engine_name {
                e.str(v);
            }
        }
    }
}
