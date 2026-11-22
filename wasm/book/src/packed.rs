//! 局面を 256 bit に詰めたキー (やねうら王の PackedSfen と同じ形式)。
//! src/background/book/packed_sfen.ts の移植。

use crate::board::*;

pub type Packed = [u32; 8];

// (符号, ビット数) 駒の種類 1〜7 (歩〜飛)
const BOARD_HUFFMAN: [(u32, u32); 8] = [
    (0, 0),
    (0x01, 2),
    (0x03, 4),
    (0x0b, 4),
    (0x07, 4),
    (0x0f, 5),
    (0x1f, 6),
    (0x3f, 6),
];
const PIECEBOX_HUFFMAN: [(u32, u32); 8] = [
    (0, 0),
    (0x02, 2),
    (0x09, 4),
    (0x0d, 4),
    (0x0b, 4),
    (0x1b, 5),
    (0x2f, 6),
    (0x3f, 6),
];
/// 盤上の駒 (make_piece の値) → (符号, ビット数)。成りフラグと手番を含めた符号を 1 回で書き出すための表。
const BOARD_PIECE_CODE: [(u32, u32); 32] = {
    let mut t = [(0u32, 0u32); 32];
    let mut color = 0;
    while color < 2 {
        let mut pt = 1;
        while pt <= 14 {
            if pt != 8 {
                let base = match pt {
                    9 => 1,
                    10 => 2,
                    11 => 3,
                    12 => 4,
                    13 => 6,
                    14 => 7,
                    x => x,
                };
                let (code, bits) = BOARD_HUFFMAN[base as usize];
                let (value, len) = if base == 5 {
                    (code | ((color as u32) << bits), bits + 1)
                } else {
                    let promoted = (pt != base) as u32;
                    (code | (promoted << bits) | ((color as u32) << (bits + 1)), bits + 2)
                };
                t[(pt | (color << 4)) as usize] = (value, len);
            }
            pt += 1;
        }
        color += 1;
    }
    t
};

// 各駒の総数 (歩〜飛)
const PIECE_TOTAL: [i32; 8] = [0, 18, 4, 4, 4, 4, 2, 2];

const fn yane_to_ts(yane: usize) -> usize {
    let file = yane / 9 + 1;
    let rank = yane % 9 + 1;
    (rank - 1) * 9 + (9 - file)
}

const fn ts_to_yane(ts: usize) -> usize {
    let file = 9 - ts % 9;
    let rank = ts / 9 + 1;
    (file - 1) * 9 + (rank - 1)
}

const TS_TO_YANE: [u8; 81] = {
    let mut t = [0u8; 81];
    let mut i = 0;
    while i < 81 {
        t[i] = ts_to_yane(i) as u8;
        i += 1;
    }
    t
};

const YANE_TO_TS: [u8; 81] = {
    let mut t = [0u8; 81];
    let mut i = 0;
    while i < 81 {
        t[i] = yane_to_ts(i) as u8;
        i += 1;
    }
    t
};

/// 64 bit のアキュムレーターに溜めて 32 bit ずつ書き出す
struct BitWriter {
    words: Packed,
    index: usize,
    acc: u64,
    nbits: u32,
    overflow: bool,
}

impl BitWriter {
    #[inline(always)]
    fn write(&mut self, value: u32, bits: u32) {
        // value は bits ビットに収まっていること
        self.acc |= (value as u64) << self.nbits;
        self.nbits += bits;
        if self.nbits >= 32 {
            if self.index >= 8 {
                self.overflow = true;
                self.index = 7;
            }
            self.words[self.index] = self.acc as u32;
            self.index += 1;
            self.acc >>= 32;
            self.nbits -= 32;
        }
    }

    /// 書き出したビット数がちょうど 256 であれば結果を返す
    fn finish(self) -> Option<Packed> {
        if self.overflow || self.index != 8 || self.nbits != 0 {
            return None;
        }
        Some(self.words)
    }
}

struct BitReader<'a> {
    words: &'a Packed,
    cursor: u32,
}

impl BitReader<'_> {
    fn bit(&mut self) -> Option<u32> {
        if self.cursor >= 256 {
            return None;
        }
        let b = (self.words[(self.cursor >> 5) as usize] >> (self.cursor & 31)) & 1;
        self.cursor += 1;
        Some(b)
    }

    fn bits(&mut self, n: u32) -> Option<u32> {
        let mut v = 0;
        for i in 0..n {
            v |= self.bit()? << i;
        }
        Some(v)
    }
}

/// 局面をキーに変換する。キーとして一意に表せない局面 (玉が 2 枚以上ある・玉が無い・駒が多すぎる・
/// 持ち駒が負になっている) の場合は None を返す。
pub fn pack(board: &Board) -> Option<Packed> {
    let mut w = BitWriter {
        words: [0; 8],
        index: 0,
        acc: 0,
        nbits: 0,
        overflow: false,
    };
    let mut kings = [81u32; 2];
    for (index, &piece) in board.squares.iter().enumerate() {
        if piece_type(piece) == KING {
            let c = piece_color(piece) as usize;
            if kings[c] != 81 {
                return None;
            }
            kings[c] = TS_TO_YANE[index] as u32;
        }
    }
    w.write(board.turn as u32, 1);
    w.write(kings[0], 7);
    w.write(kings[1], 7);
    let mut counts = [0i32; 8];
    for &ts in YANE_TO_TS.iter() {
        let piece = board.squares[ts as usize];
        if piece == 0 {
            w.write(0, 1);
            continue;
        }
        let t = piece_type(piece);
        if t == KING {
            continue;
        }
        counts[unpromote(t) as usize] += 1;
        let (code, bits) = BOARD_PIECE_CODE[piece as usize];
        w.write(code, bits);
    }
    for color in 0..2u32 {
        for t in PAWN..=ROOK {
            let n = board.hands[color as usize][t as usize];
            if n < 0 || n > PIECE_TOTAL[t as usize] {
                return None;
            }
            counts[t as usize] += n;
            let (code, bits) = BOARD_HUFFMAN[t as usize];
            // 符号 + (金以外は成りフラグ 0) + 手番
            let (value, len) = if t == GOLD {
                ((code >> 1) | (color << (bits - 1)), bits)
            } else {
                ((code >> 1) | (color << bits), bits + 1)
            };
            for _ in 0..n {
                w.write(value, len);
            }
        }
    }
    for t in PAWN..=ROOK {
        let remaining = PIECE_TOTAL[t as usize] - counts[t as usize];
        if remaining < 0 {
            return None;
        }
        let (code, bits) = PIECEBOX_HUFFMAN[t as usize];
        let len = if t == GOLD { bits } else { bits + 1 };
        for _ in 0..remaining {
            w.write(code, len);
        }
    }
    w.finish()
}

fn read_board_piece(r: &mut BitReader) -> Option<u8> {
    // 戻り値: 0 = 空き, それ以外は駒 (make_piece の値)
    let mut code = 0;
    for bits in 1..=6 {
        code |= r.bit()? << (bits - 1);
        if bits == 1 && code == 0 {
            return Some(0);
        }
        for t in PAWN..=ROOK {
            if BOARD_HUFFMAN[t as usize] == (code, bits) {
                let promoted = if t != GOLD { r.bit()? == 1 } else { false };
                let color = r.bit()? as u8;
                return Some(make_piece(color, if promoted { promote(t) } else { t }));
            }
        }
    }
    None
}

/// (駒の種類, 手番, 駒箱かどうか)
fn read_hand_piece(r: &mut BitReader) -> Option<(u8, u8, bool)> {
    let mut code = 0;
    for bits in 1..=6 {
        code |= r.bit()? << (bits - 1);
        for t in PAWN..=ROOK {
            let (c, b) = BOARD_HUFFMAN[t as usize];
            if (c >> 1, b - 1) == (code, bits) {
                let promoted = if t != GOLD { r.bit()? == 1 } else { false };
                let color = r.bit()? as u8;
                return Some((t, color, promoted));
            }
        }
    }
    None
}

pub fn unpack(words: &Packed) -> Option<Board> {
    let mut r = BitReader { words, cursor: 0 };
    let mut board = Board::empty();
    board.turn = r.bit()? as u8;
    let mut king_squares = [81usize; 2];
    for (color, king) in king_squares.iter_mut().enumerate() {
        let yane = r.bits(7)? as usize;
        if yane != 81 {
            if yane > 81 {
                return None;
            }
            *king = yane_to_ts(yane);
            board.squares[*king] = make_piece(color as u8, KING);
        }
    }
    for yane in 0..81 {
        let ts = yane_to_ts(yane);
        if king_squares.contains(&ts) {
            continue;
        }
        board.squares[ts] = read_board_piece(&mut r)?;
    }
    while r.cursor < 256 {
        let (t, color, piecebox) = read_hand_piece(&mut r)?;
        if !piecebox {
            board.hands[color as usize][t as usize] += 1;
        }
    }
    Some(board)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        for sfen in [
            STANDARD_SFEN,
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
            "lnsgkgsnl/1r7/pppppp1pp/6p2/9/2P6/PP1PPPPPP/7R1/LNSGKGSNL b Bb 1",
            "lnsgk1snl/1r4g2/p1pppp1pp/6p2/1p7/2P6/PPSPPPPPP/2G4R1/LN2KGSNL w Bb 1",
            "4k4/9/9/9/9/9/9/9/4K4 b 2r2b4g4s4n4l18p 1",
            "+R3k4/9/9/9/9/9/9/9/4K4 w r2b4g4s4n4l18p 1",
        ] {
            let b = Board::parse_sfen(sfen).unwrap();
            let p = pack(&b).unwrap_or_else(|| panic!("{}", sfen));
            let b2 = unpack(&p).unwrap();
            assert_eq!(b2.to_sfen(), sfen);
        }
    }

    #[test]
    fn unpackable() {
        // 歩が 19 枚
        let b = Board::parse_sfen("4k4/9/9/9/9/9/9/9/4K4 b 19P 1").unwrap();
        assert!(pack(&b).is_none());
        // 先手玉が無い (やねうら王の形式では両方の玉が盤上にあることを前提としている)
        let b = Board::parse_sfen("4k4/9/9/9/9/9/9/9/9 b 2r2b4g4s4n4l18p 1").unwrap();
        assert!(pack(&b).is_none());
        // 先手玉が 2 枚
        let b = Board::parse_sfen("4k4/9/9/9/9/9/9/9/3KK4 b - 1").unwrap();
        assert!(pack(&b).is_none());
    }
}

