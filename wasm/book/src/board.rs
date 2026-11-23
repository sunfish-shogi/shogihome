//! 局面の表現と SFEN の読み書き。
//!
//! 定跡ファイルの読み書きで JavaScript 版 (tsshogi) と同じ結果を得るため、
//! SFEN の検証規則・出力形式・指し手の適用方法は tsshogi の実装に合わせている。

pub const BLACK: u8 = 0;
pub const WHITE: u8 = 1;

// 駒の種類 (tsshogi の PieceType に対応する)
pub const PAWN: u8 = 1;
pub const LANCE: u8 = 2;
pub const KNIGHT: u8 = 3;
pub const SILVER: u8 = 4;
pub const GOLD: u8 = 5;
pub const BISHOP: u8 = 6;
pub const ROOK: u8 = 7;
pub const KING: u8 = 8;
pub const PROM_PAWN: u8 = 9;
pub const PROM_LANCE: u8 = 10;
pub const PROM_KNIGHT: u8 = 11;
pub const PROM_SILVER: u8 = 12;
pub const HORSE: u8 = 13;
pub const DRAGON: u8 = 14;

/// 盤上の駒は `種類 | (手番 << 4)` で表し、0 は空きマスを表す。
pub fn make_piece(color: u8, piece_type: u8) -> u8 {
    piece_type | (color << 4)
}

pub fn piece_type(piece: u8) -> u8 {
    piece & 0x0f
}

pub fn piece_color(piece: u8) -> u8 {
    piece >> 4
}

pub fn promote(piece_type: u8) -> u8 {
    match piece_type {
        PAWN => PROM_PAWN,
        LANCE => PROM_LANCE,
        KNIGHT => PROM_KNIGHT,
        SILVER => PROM_SILVER,
        BISHOP => HORSE,
        ROOK => DRAGON,
        t => t,
    }
}

pub fn unpromote(piece_type: u8) -> u8 {
    match piece_type {
        PROM_PAWN => PAWN,
        PROM_LANCE => LANCE,
        PROM_KNIGHT => KNIGHT,
        PROM_SILVER => SILVER,
        HORSE => BISHOP,
        DRAGON => ROOK,
        t => t,
    }
}

/// 持ち駒になれる種類かどうか (歩〜飛)
pub fn is_hand_type(piece_type: u8) -> bool {
    (PAWN..=ROOK).contains(&piece_type)
}

const SFEN_CHARS: [&str; 15] = [
    "", "P", "L", "N", "S", "G", "B", "R", "K", "+P", "+L", "+N", "+S", "+B", "+R",
];

/// tsshogi の pieceTypeToSFEN (先手の表記)
pub fn piece_type_to_sfen(piece_type: u8) -> &'static str {
    SFEN_CHARS.get(piece_type as usize).copied().unwrap_or("")
}

fn sfen_letter_to_type(c: u8) -> Option<u8> {
    match c.to_ascii_uppercase() {
        b'P' => Some(PAWN),
        b'L' => Some(LANCE),
        b'N' => Some(KNIGHT),
        b'S' => Some(SILVER),
        b'G' => Some(GOLD),
        b'B' => Some(BISHOP),
        b'R' => Some(ROOK),
        b'K' => Some(KING),
        _ => None,
    }
}

/// tsshogi の Piece.newBySFEN に相当する。`+` 付きの表記にも対応する。
pub fn parse_sfen_piece(s: &[u8]) -> Option<u8> {
    let (promoted, c) = match s {
        [c] => (false, *c),
        [b'+', c] => (true, *c),
        _ => return None,
    };
    let base = sfen_letter_to_type(c)?;
    let color = if c.is_ascii_uppercase() { BLACK } else { WHITE };
    let t = if promoted {
        // "+G" や "+K" は不正
        if base == GOLD || base == KING {
            return None;
        }
        promote(base)
    } else {
        base
    };
    Some(make_piece(color, t))
}

/// マス番号 (tsshogi の Square.index と同じ: (段 - 1) * 9 + (9 - 筋))
pub fn square_index(file: u8, rank: u8) -> usize {
    (rank as usize - 1) * 9 + (9 - file as usize)
}

pub fn square_file(index: usize) -> u8 {
    (9 - index % 9) as u8
}

pub fn square_rank(index: usize) -> u8 {
    (index / 9 + 1) as u8
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Board {
    pub squares: [u8; 81],
    /// 持ち駒の枚数。[手番][種類] (種類は 1〜7 を使う)。
    /// tsshogi と同様に一時的に負の値を取りうる。
    pub hands: [[i32; 8]; 2],
    pub turn: u8,
}

pub const STANDARD_SFEN: &str = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

impl Board {
    pub fn empty() -> Board {
        Board {
            squares: [0; 81],
            hands: [[0; 8]; 2],
            turn: BLACK,
        }
    }

    /// tsshogi の Position.newBySFEN に相当する。
    pub fn parse_sfen(sfen: &str) -> Option<Board> {
        // tsshogi は 1 文字の空白で区切る (連続する空白は空のセクションになる)
        let mut sections: Vec<&str> = sfen.split(' ').collect();
        if (sections.len() == 5 || sections.len() == 4) && sections[0] == "sfen" {
            sections.remove(0);
        }
        if sections.len() != 4 && sections.len() != 3 {
            return None;
        }
        let mut board = Board::empty();
        if !parse_board(sections[0], &mut board.squares) {
            return None;
        }
        board.turn = match sections[1] {
            "b" => BLACK,
            "w" => WHITE,
            _ => return None,
        };
        if !parse_hands(sections[2], &mut board.hands) {
            return None;
        }
        if sections.len() == 4 && !sections[3].bytes().any(|c| c.is_ascii_digit()) {
            return None;
        }
        Some(board)
    }

    /// tsshogi の Position.sfen (手数は常に 1) と同じ文字列を返す。
    pub fn to_sfen(&self) -> String {
        let mut s = String::with_capacity(96);
        for rank in 0..9 {
            let mut empty = 0;
            for x in 0..9 {
                let piece = self.squares[rank * 9 + x];
                if piece == 0 {
                    empty += 1;
                    continue;
                }
                if empty > 0 {
                    s.push((b'0' + empty) as char);
                    empty = 0;
                }
                push_piece(&mut s, piece_type(piece), piece_color(piece));
            }
            if empty > 0 {
                s.push((b'0' + empty) as char);
            }
            if rank != 8 {
                s.push('/');
            }
        }
        s.push(' ');
        s.push(if self.turn == BLACK { 'b' } else { 'w' });
        s.push(' ');
        let before = s.len();
        for color in [BLACK, WHITE] {
            for t in [ROOK, BISHOP, GOLD, SILVER, KNIGHT, LANCE, PAWN] {
                let n = self.hands[color as usize][t as usize].max(0);
                if n == 0 {
                    continue;
                }
                if n != 1 {
                    push_number(&mut s, n as u32);
                }
                push_piece(&mut s, t, color);
            }
        }
        if s.len() == before {
            s.push('-');
        }
        s.push_str(" 1");
        s
    }

    pub fn at(&self, index: usize) -> u8 {
        self.squares[index]
    }

    /// 負の持ち駒を 0 として扱った局面 (SFEN に出力される内容と同じ局面) を返す。
    pub fn normalized(&self) -> Board {
        let mut b = self.clone();
        for hand in b.hands.iter_mut() {
            for n in hand.iter_mut() {
                if *n < 0 {
                    *n = 0;
                }
            }
        }
        b
    }
}

fn push_piece(s: &mut String, piece_type: u8, color: u8) {
    for c in piece_type_to_sfen(piece_type).bytes() {
        s.push(if color == BLACK { c } else { c.to_ascii_lowercase() } as char);
    }
}

fn push_number(s: &mut String, n: u32) {
    if n >= 10 {
        push_number(s, n / 10);
    }
    s.push((b'0' + (n % 10) as u8) as char);
}

/// tsshogi の Board.isValidSFEN と resetBySFEN に相当する。
fn parse_board(sfen: &str, squares: &mut [u8; 81]) -> bool {
    let rows: Vec<&[u8]> = sfen.split('/').map(|r| r.as_bytes()).collect();
    if rows.len() != 9 {
        return false;
    }
    for (y, row) in rows.iter().enumerate() {
        let mut x = 0usize;
        let mut i = 0usize;
        while i < row.len() {
            let c = row[i];
            if (b'1'..=b'9').contains(&c) {
                x += (c - b'0') as usize;
                i += 1;
                continue;
            }
            let token: &[u8] = if c == b'+' {
                if i + 1 >= row.len() {
                    return false;
                }
                &row[i..i + 2]
            } else {
                &row[i..i + 1]
            };
            let piece = match parse_sfen_piece(token) {
                Some(p) => p,
                None => return false,
            };
            if x < 9 {
                squares[y * 9 + x] = piece;
            }
            x += 1;
            i += token.len();
        }
        if x != 9 {
            return false;
        }
    }
    true
}

/// tsshogi の Hand.isValidSFEN と Hand.parseSFEN に相当する。
/// 検証は `^(?:[0-9]{0,2}[PLNSGBRplnsgbr])+$`。
fn parse_hands(sfen: &str, hands: &mut [[i32; 8]; 2]) -> bool {
    if sfen == "-" {
        return true;
    }
    let bytes = sfen.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let mut i = 0;
    while i < bytes.len() {
        let start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i - start > 2 || i >= bytes.len() {
            return false;
        }
        let c = bytes[i];
        let t = match sfen_letter_to_type(c) {
            Some(t) if t != KING => t,
            _ => return false,
        };
        let n: i32 = if i > start {
            let mut v = 0;
            for &d in &bytes[start..i] {
                v = v * 10 + (d - b'0') as i32;
            }
            v
        } else {
            1
        };
        let color = if c.is_ascii_uppercase() { BLACK } else { WHITE };
        hands[color as usize][t as usize] += n;
        i += 1;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard() {
        let b = Board::parse_sfen(STANDARD_SFEN).unwrap();
        assert_eq!(b.to_sfen(), STANDARD_SFEN);
    }

    #[test]
    fn hands() {
        let sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w 2RB10Pg3p 12";
        let b = Board::parse_sfen(sfen).unwrap();
        assert_eq!(
            b.to_sfen(),
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w 2RB10Pg3p 1"
        );
    }

    #[test]
    fn invalid() {
        assert!(Board::parse_sfen("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1 b - 1").is_none());
        assert!(Board::parse_sfen("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL x - 1").is_none());
        assert!(Board::parse_sfen("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSN b - 1").is_none());
        assert!(Board::parse_sfen("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b 100P 1").is_none());
        assert!(Board::parse_sfen("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - x").is_none());
    }
}
