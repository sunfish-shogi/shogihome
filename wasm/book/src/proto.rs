//! SBK (Protocol Buffers) の読み書き。
//!
//! JavaScript 版は ts-proto が生成したコード (src/background/book/proto/sbk.ts) と
//! @bufbuild/protobuf の BinaryReader / BinaryWriter を使っている。
//! 同じ入力に対して同じ結果を得るため、読み取りの規則 (後勝ち・不明なフィールドの扱い・
//! 文字列のデコード) と書き出しの規則 (既定値の省略・varint の形式) をそれらに合わせている。

pub type Result<T> = core::result::Result<T, String>;

#[derive(Clone, Default, Debug)]
pub struct SBookMove {
    pub mv: i32,
    pub evaluation: i32,
    pub weight: i32,
    pub next_state_id: i32,
}

#[derive(Clone, Default, Debug)]
pub struct SBookEval {
    pub evaluation_value: i32,
    pub depth: i32,
    pub sel_depth: i32,
    pub nodes: i64,
    pub variation: String,
    pub engine_name: Option<String>,
}

#[derive(Clone, Default, Debug)]
pub struct SBookState {
    pub id: i32,
    pub games: i32,
    pub won_black: i32,
    pub won_white: i32,
    pub position: Option<String>,
    pub comment: Option<String>,
    pub moves: Vec<SBookMove>,
    pub evals: Vec<SBookEval>,
}

#[derive(Default, Debug)]
pub struct SBook {
    pub author: String,
    pub description: String,
    pub states: Vec<SBookState>,
}

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    /// JavaScript では範囲外の要素は undefined になり、ビット演算で 0 として扱われる
    fn byte(&mut self) -> u8 {
        let b = self.buf.get(self.pos).copied().unwrap_or(0);
        self.pos += 1;
        b
    }

    fn assert_bounds(&self) -> Result<()> {
        if self.pos > self.buf.len() {
            Err("premature EOF".to_string())
        } else {
            Ok(())
        }
    }

    /// varint32read と同じ動作
    fn uint32(&mut self) -> Result<u32> {
        let mut b = self.byte();
        if b & 0x80 == 0 {
            self.assert_bounds()?;
            return Ok(b as u32);
        }
        let mut result = (b & 0x7f) as u32;
        for shift in [7, 14, 21] {
            b = self.byte();
            result |= ((b & 0x7f) as u32) << shift;
            if b & 0x80 == 0 {
                self.assert_bounds()?;
                return Ok(result);
            }
        }
        b = self.byte();
        result |= ((b & 0x0f) as u32) << 28;
        let mut read_bytes = 5;
        while b & 0x80 != 0 && read_bytes < 10 {
            b = self.byte();
            read_bytes += 1;
        }
        if b & 0x80 != 0 {
            return Err("invalid varint".to_string());
        }
        self.assert_bounds()?;
        Ok(result)
    }

    fn int32(&mut self) -> Result<i32> {
        Ok(self.uint32()? as i32)
    }

    /// varint64read と同じく下位 64 bit を読む
    fn int64(&mut self) -> Result<i64> {
        let mut result: u64 = 0;
        for i in 0..10 {
            let b = self.byte();
            if i < 9 {
                result |= ((b & 0x7f) as u64) << (7 * i);
            } else {
                result |= ((b & 0x01) as u64) << 63;
            }
            if b & 0x80 == 0 {
                self.assert_bounds()?;
                return Ok(result as i64);
            }
        }
        Err("invalid varint".to_string())
    }

    fn bytes(&mut self) -> Result<&'a [u8]> {
        let len = self.uint32()? as usize;
        let start = self.pos;
        self.pos = self.pos.saturating_add(len);
        self.assert_bounds()?;
        Ok(&self.buf[start..self.pos])
    }

    fn string(&mut self) -> Result<String> {
        Ok(decode_utf8(self.bytes()?))
    }

    fn skip(&mut self, wire_type: u32, field_no: Option<u32>, recursion_limit: u32) -> Result<()> {
        match wire_type {
            0 => {
                while self.byte() & 0x80 != 0 {}
            }
            1 => self.pos = self.pos.saturating_add(8),
            5 => self.pos = self.pos.saturating_add(4),
            2 => {
                let len = self.uint32()? as usize;
                self.pos = self.pos.saturating_add(len);
            }
            3 => {
                if recursion_limit == 0 {
                    return Err("maximum recursion depth reached".to_string());
                }
                loop {
                    let tag = self.uint32()?;
                    let (fn_, wt) = (tag >> 3, tag & 7);
                    if wt == 4 {
                        if let Some(f) = field_no {
                            if fn_ != f {
                                return Err("invalid end group tag".to_string());
                            }
                        }
                        break;
                    }
                    self.skip(wt, Some(fn_), recursion_limit - 1)?;
                }
            }
            _ => return Err(format!("cant skip wire type {}", wire_type)),
        }
        self.assert_bounds()
    }

    /// ts-proto が生成するデコード関数のループの後処理。
    /// ループを抜ける場合は true を返す。
    fn finish_field(&mut self, tag: u32) -> Result<bool> {
        if tag & 7 == 4 || tag == 0 {
            return Ok(true);
        }
        self.skip(tag & 7, None, 100)?;
        Ok(false)
    }
}

/// TextDecoder (fatal: false, ignoreBOM: false) と同じく、不正なバイト列を U+FFFD に置き換え、
/// 先頭の BOM を取り除く。
pub fn decode_utf8(bytes: &[u8]) -> String {
    let s = String::from_utf8_lossy(bytes);
    match s.strip_prefix('\u{feff}') {
        // @bufbuild/protobuf は ASCII のみの場合 TextDecoder を使わないが、BOM は非 ASCII なので常に取り除かれる
        Some(rest) => rest.to_string(),
        None => s.into_owned(),
    }
}

fn decode_move(r: &mut Reader, length: usize) -> Result<SBookMove> {
    let end = r.pos.saturating_add(length);
    let mut m = SBookMove::default();
    while r.pos < end {
        let tag = r.uint32()?;
        match tag {
            8 => m.mv = r.int32()?,
            16 => m.evaluation = r.int32()?,
            24 => m.weight = r.int32()?,
            32 => m.next_state_id = r.int32()?,
            _ => {
                if r.finish_field(tag)? {
                    break;
                }
            }
        }
    }
    Ok(m)
}

fn decode_eval(r: &mut Reader, length: usize) -> Result<SBookEval> {
    let end = r.pos.saturating_add(length);
    let mut e = SBookEval::default();
    while r.pos < end {
        let tag = r.uint32()?;
        match tag {
            8 => e.evaluation_value = r.int32()?,
            16 => e.depth = r.int32()?,
            24 => e.sel_depth = r.int32()?,
            32 => e.nodes = r.int64()?,
            42 => e.variation = r.string()?,
            50 => e.engine_name = Some(r.string()?),
            _ => {
                if r.finish_field(tag)? {
                    break;
                }
            }
        }
    }
    Ok(e)
}

fn decode_state(r: &mut Reader, length: usize) -> Result<SBookState> {
    let end = r.pos.saturating_add(length);
    let mut s = SBookState::default();
    while r.pos < end {
        let tag = r.uint32()?;
        match tag {
            8 => s.id = r.int32()?,
            16 => {
                r.int64()?; // BoardKey (使わない)
            }
            24 => {
                r.uint32()?; // HandKey (使わない)
            }
            32 => s.games = r.int32()?,
            40 => s.won_black = r.int32()?,
            48 => s.won_white = r.int32()?,
            58 => s.position = Some(r.string()?),
            66 => s.comment = Some(r.string()?),
            74 => {
                let len = r.uint32()? as usize;
                let m = decode_move(r, len)?;
                s.moves.push(m);
            }
            82 => {
                let len = r.uint32()? as usize;
                let e = decode_eval(r, len)?;
                s.evals.push(e);
            }
            _ => {
                if r.finish_field(tag)? {
                    break;
                }
            }
        }
    }
    Ok(s)
}

/// SBook.decode に相当する。
pub fn decode_book(buf: &[u8]) -> Result<SBook> {
    let mut r = Reader { buf, pos: 0 };
    let mut book = SBook::default();
    let end = buf.len();
    while r.pos < end {
        let tag = r.uint32()?;
        match tag {
            10 => book.author = r.string()?,
            18 => book.description = r.string()?,
            26 => {
                let len = r.uint32()? as usize;
                let s = decode_state(&mut r, len)?;
                book.states.push(s);
            }
            _ => {
                if r.finish_field(tag)? {
                    break;
                }
            }
        }
    }
    Ok(book)
}

/// BinaryWriter と同じ形式で書き出す。
pub struct Writer {
    pub buf: Vec<u8>,
}

impl Writer {
    pub fn new() -> Writer {
        Writer { buf: Vec::new() }
    }

    pub fn uint32(&mut self, mut v: u32) {
        while v > 0x7f {
            self.buf.push((v & 0x7f) as u8 | 0x80);
            v >>= 7;
        }
        self.buf.push(v as u8);
    }

    pub fn int32(&mut self, v: i32) {
        if v >= 0 {
            self.uint32(v as u32);
            return;
        }
        self.int64(v as i64);
    }

    pub fn int64(&mut self, v: i64) {
        let mut u = v as u64;
        while u > 0x7f {
            self.buf.push((u & 0x7f) as u8 | 0x80);
            u >>= 7;
        }
        self.buf.push(u as u8);
    }

    pub fn string(&mut self, s: &str) {
        self.uint32(s.len() as u32);
        self.buf.extend_from_slice(s.as_bytes());
    }

    /// fork() / join() の代わりに、書き終えたメッセージを長さ付きで追加する
    pub fn message(&mut self, tag: u32, body: &[u8]) {
        self.uint32(tag);
        self.uint32(body.len() as u32);
        self.buf.extend_from_slice(body);
    }
}

/// SBookMove.encode
pub fn encode_move(w: &mut Writer, m: &SBookMove) {
    if m.mv != 0 {
        w.uint32(8);
        w.int32(m.mv);
    }
    if m.evaluation != 0 {
        w.uint32(16);
        w.int32(m.evaluation);
    }
    if m.weight != 0 {
        w.uint32(24);
        w.int32(m.weight);
    }
    if m.next_state_id != 0 {
        w.uint32(32);
        w.int32(m.next_state_id);
    }
}

/// SBookEval.encode
pub fn encode_eval(w: &mut Writer, e: &SBookEval) {
    if e.evaluation_value != 0 {
        w.uint32(8);
        w.int32(e.evaluation_value);
    }
    if e.depth != 0 {
        w.uint32(16);
        w.int32(e.depth);
    }
    if e.sel_depth != 0 {
        w.uint32(24);
        w.int32(e.sel_depth);
    }
    if e.nodes != 0 {
        w.uint32(32);
        w.int64(e.nodes);
    }
    if !e.variation.is_empty() {
        w.uint32(42);
        w.string(&e.variation);
    }
    if let Some(name) = &e.engine_name {
        if !name.is_empty() {
            w.uint32(50);
            w.string(name);
        }
    }
}

/// SBookState.encode (BoardKey と HandKey は常に 0 なので出力しない)
pub fn encode_state(w: &mut Writer, s: &SBookState, scratch: &mut Writer) {
    if s.id != 0 {
        w.uint32(8);
        w.int32(s.id);
    }
    if s.games != 0 {
        w.uint32(32);
        w.int32(s.games);
    }
    if s.won_black != 0 {
        w.uint32(40);
        w.int32(s.won_black);
    }
    if s.won_white != 0 {
        w.uint32(48);
        w.int32(s.won_white);
    }
    if let Some(p) = &s.position {
        if !p.is_empty() {
            w.uint32(58);
            w.string(p);
        }
    }
    if let Some(c) = &s.comment {
        if !c.is_empty() {
            w.uint32(66);
            w.string(c);
        }
    }
    for m in &s.moves {
        scratch.buf.clear();
        encode_move(scratch, m);
        w.message(74, &scratch.buf);
    }
    for e in &s.evals {
        scratch.buf.clear();
        encode_eval(scratch, e);
        w.message(82, &scratch.buf);
    }
}
