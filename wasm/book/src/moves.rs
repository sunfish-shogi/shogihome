//! 指し手の表現と変換 (SBK の 32bit 表現・USI)。
//! tsshogi の Move・createMoveByUSI・doMove・undoMove と同じ動作をする。

use crate::board::*;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum From {
    Square(u8),
    /// 駒打ち。打つ駒の種類 (成駒を含む不正な種類もそのまま保持する)
    Drop(u8),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Move {
    pub from: From,
    pub to: u8,
    pub promote: bool,
    pub color: u8,
    /// 動かす駒の種類 (成る前)
    pub piece_type: u8,
    /// 取る駒の種類 (0 は無し)
    pub captured: u8,
}

/// SBK の駒番号 (先後フラグを除く) → 駒の種類
fn sbk_index_to_type(index: u32) -> u8 {
    match index {
        1..=12 => index as u8,
        14 => HORSE,
        15 => DRAGON,
        _ => 0,
    }
}

/// 駒の種類 → SBK の駒番号
fn type_to_sbk_index(t: u8) -> u32 {
    match t {
        1..=12 => t as u32,
        HORSE => 14,
        DRAGON => 15,
        _ => 0,
    }
}

/// sbk_move.ts の fromSbkMove に相当する。
/// 駒の種類やマスが不正な場合は None を返す (JavaScript 版では不正なオブジェクトが作られる)。
pub fn from_sbk_move(board: &Board, value: i32) -> Option<Move> {
    let v = value as u32;
    let from_dan = v & 0xf;
    let from_suji = (v >> 4) & 0xf;
    let to_dan = (v >> 8) & 0xf;
    let to_suji = (v >> 12) & 0xf;
    let promote = (v >> 19) & 1 == 1;
    let piece = (v >> 24) & 0x1f;
    let pt = sbk_index_to_type(piece & 0x0f);
    if pt == 0 || !(1..=9).contains(&to_dan) || !(1..=9).contains(&to_suji) {
        return None;
    }
    let to = square_index(to_suji as u8, to_dan as u8) as u8;
    if from_dan == 0 && from_suji == 0 {
        return Some(Move {
            from: From::Drop(pt),
            to,
            promote: false,
            color: board.turn,
            piece_type: pt,
            captured: 0,
        });
    }
    if !(1..=9).contains(&from_dan) || !(1..=9).contains(&from_suji) {
        return None;
    }
    let from = square_index(from_suji as u8, from_dan as u8) as u8;
    let captured = board.at(to as usize);
    Some(Move {
        from: From::Square(from),
        to,
        promote,
        color: board.turn,
        piece_type: pt,
        captured: if captured == 0 { 0 } else { piece_type(captured) },
    })
}

/// sbk_move.ts の toSbkMove に相当する。
pub fn to_sbk_move(mv: &Move) -> i32 {
    let color_bit: u32 = if mv.color == BLACK { 0 } else { 1 };
    let piece_bits = type_to_sbk_index(mv.piece_type) | if mv.color == WHITE { 0x10 } else { 0 };
    let to = mv.to as usize;
    let to_file = square_file(to) as u32;
    let to_rank = square_rank(to) as u32;
    let value = match mv.from {
        From::Drop(_) => (color_bit << 31) | (piece_bits << 24) | (to_file << 12) | (to_rank << 8),
        From::Square(from) => {
            let from = from as usize;
            let capture_bits = if mv.captured != 0 { type_to_sbk_index(mv.captured) } else { 0 };
            (color_bit << 31)
                | (piece_bits << 24)
                | (capture_bits << 20)
                | ((mv.promote as u32) << 19)
                | (to_file << 12)
                | (to_rank << 8)
                | ((square_file(from) as u32) << 4)
                | square_rank(from) as u32
        }
    };
    value as i32
}

/// USI の指し手を構文上の要素に分解したもの
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct UsiMove {
    pub from: From,
    pub to: u8,
    pub promote: bool,
}

fn parse_usi_square(file: Option<&u8>, rank: Option<&u8>) -> Option<u8> {
    let file = *file?;
    let rank = *rank?;
    if !(b'1'..=b'9').contains(&file) || !(b'a'..=b'i').contains(&rank) {
        return None;
    }
    Some(square_index(file - b'0', rank - b'a' + 1) as u8)
}

/// tsshogi の parseUSIMove に相当する。
pub fn parse_usi(usi: &str) -> Option<UsiMove> {
    let b = usi.as_bytes();
    let from = if b.get(1) == Some(&b'*') {
        let piece = parse_sfen_piece(&b[0..1])?;
        From::Drop(piece_type(piece))
    } else {
        From::Square(parse_usi_square(b.first(), b.get(1))?)
    };
    let to = parse_usi_square(b.get(2), b.get(3))?;
    // JavaScript の文字列長は UTF-16 単位だが、先頭 4 文字が ASCII であれば 5 文字目の判定は一致する
    let promote = b.get(4) == Some(&b'+');
    Some(UsiMove { from, to, promote })
}

pub fn format_usi(m: &UsiMove) -> String {
    let mut s = String::with_capacity(6);
    match m.from {
        From::Square(sq) => push_square(&mut s, sq as usize),
        From::Drop(t) => {
            s.push_str(piece_type_to_sfen(t));
            s.push('*');
        }
    }
    push_square(&mut s, m.to as usize);
    if m.promote {
        s.push('+');
    }
    s
}

fn push_square(s: &mut String, index: usize) {
    s.push((b'0' + square_file(index)) as char);
    s.push((b'a' + square_rank(index) - 1) as char);
}

impl Move {
    pub fn usi_move(&self) -> UsiMove {
        UsiMove {
            from: self.from,
            to: self.to,
            promote: self.promote,
        }
    }
}

/// tsshogi の Position.createMoveByUSI に相当する。
pub fn create_move(board: &Board, m: &UsiMove) -> Option<Move> {
    let piece_type_value = match m.from {
        From::Square(sq) => {
            let piece = board.at(sq as usize);
            if piece == 0 {
                return None;
            }
            piece_type(piece)
        }
        From::Drop(t) => t,
    };
    let captured = board.at(m.to as usize);
    Some(Move {
        from: m.from,
        to: m.to,
        promote: m.promote,
        color: board.turn,
        piece_type: piece_type_value,
        captured: if captured == 0 { 0 } else { piece_type(captured) },
    })
}

/// tsshogi の Position.doMove(move, { ignoreValidation: true }) に相当する。
pub fn do_move(board: &mut Board, mv: &Move) -> bool {
    let turn = board.turn as usize;
    match mv.from {
        From::Square(from) => {
            let target = board.squares[from as usize];
            if target == 0 {
                return false;
            }
            let captured = board.squares[mv.to as usize];
            board.squares[from as usize] = 0;
            board.squares[mv.to as usize] = if mv.promote {
                make_piece(piece_color(target), promote(piece_type(target)))
            } else {
                target
            };
            if captured != 0 && piece_type(captured) != KING {
                let t = unpromote(piece_type(captured));
                board.hands[turn][t as usize] += 1;
            }
        }
        From::Drop(t) => {
            if is_hand_type(t) {
                board.hands[turn][t as usize] -= 1;
            }
            board.squares[mv.to as usize] = make_piece(board.turn, t);
        }
    }
    board.turn ^= 1;
    true
}

/// tsshogi の Position.undoMove に相当する。
pub fn undo_move(board: &mut Board, mv: &Move) {
    board.turn ^= 1;
    let turn = board.turn;
    match mv.from {
        From::Square(from) => {
            board.squares[from as usize] = make_piece(turn, mv.piece_type);
            if mv.captured != 0 {
                board.squares[mv.to as usize] = make_piece(turn ^ 1, mv.captured);
                if mv.captured != KING {
                    let t = unpromote(mv.captured);
                    board.hands[turn as usize][t as usize] -= 1;
                }
            } else {
                board.squares[mv.to as usize] = 0;
            }
        }
        From::Drop(t) => {
            if is_hand_type(t) {
                board.hands[turn as usize][t as usize] += 1;
            }
            board.squares[mv.to as usize] = 0;
        }
    }
}

/// USI を 32bit に詰めた表現。正規形 (format_usi(parse_usi(s)) == s) の USI だけを表す。
/// bit 0-6: 移動先, bit 7-13: 移動元 (0-80) または 81 + 打つ駒の種類, bit 14: 成り
pub fn pack_usi(m: &UsiMove) -> u32 {
    let from = match m.from {
        From::Square(sq) => sq as u32,
        From::Drop(t) => 81 + t as u32,
    };
    (m.to as u32) | (from << 7) | ((m.promote as u32) << 14)
}

pub fn unpack_usi(v: u32) -> UsiMove {
    let to = (v & 0x7f) as u8;
    let from = (v >> 7) & 0x7f;
    UsiMove {
        from: if from < 81 { From::Square(from as u8) } else { From::Drop((from - 81) as u8) },
        to,
        promote: (v >> 14) & 1 == 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usi_round_trip() {
        for s in ["7g7f", "8h2b+", "P*5e", "2b8h"] {
            let m = parse_usi(s).unwrap();
            assert_eq!(format_usi(&m), s);
            assert_eq!(format_usi(&unpack_usi(pack_usi(&m))), s);
        }
        // 小文字の打ち駒も解析できるが正規形ではない
        let m = parse_usi("p*5e").unwrap();
        assert_eq!(format_usi(&m), "P*5e");
        assert!(parse_usi("7g").is_none());
        assert!(parse_usi("0g7f").is_none());
    }

    #[test]
    fn do_and_undo() {
        let mut b = Board::parse_sfen(STANDARD_SFEN).unwrap();
        let original = b.clone();
        let m = create_move(&b, &parse_usi("7g7f").unwrap()).unwrap();
        assert!(do_move(&mut b, &m));
        assert_eq!(
            b.to_sfen(),
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1"
        );
        undo_move(&mut b, &m);
        assert_eq!(b, original);
    }

    #[test]
    fn sbk_round_trip() {
        let mut b = Board::parse_sfen(STANDARD_SFEN).unwrap();
        for usi in ["7g7f", "3c3d", "8h2b+", "3a2b", "B*4e"] {
            let m = create_move(&b, &parse_usi(usi).unwrap()).unwrap();
            let v = to_sbk_move(&m);
            let m2 = from_sbk_move(&b, v).unwrap();
            assert_eq!(format_usi(&m2.usi_move()), usi);
            assert!(do_move(&mut b, &m2));
        }
    }
}
