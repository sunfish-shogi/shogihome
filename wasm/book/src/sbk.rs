//! SBK 形式の処理 (JavaScript 版の On-the-fly モードと同じ方式)。
//! src/background/book/sbk.ts の loadSbkBookOnTheFly・searchSbkBookEntryOnTheFly・
//! storeSbkBookOnTheFly の移植。同じ入力に対して同じ結果 (検索結果・書き出したバイト列) を得る。

use crate::board::{Board, STANDARD_SFEN};
use crate::entry::{merge_entries, BookMove, Entry, Eval};
use crate::moves::{create_move, do_move, from_sbk_move, parse_usi, to_sbk_move, undo_move};
use crate::packed::{pack_position, pack_sfen, Packed};
use crate::proto::{decode_state, decode_utf8_keep_bom, encode_state, SBookEval, SBookMove, SBookState, Writer};
use std::collections::{HashMap, HashSet};

pub type Result<T> = core::result::Result<T, String>;

/// sbk.ts の readVarint (64 bit を超える値も含めて number として読む)
fn read_varint(data: &[u8], mut offset: usize) -> Result<(f64, usize)> {
    let mut value = 0.0f64;
    let mut scale = 1.0f64;
    for _ in 0..10 {
        let Some(&byte) = data.get(offset) else {
            return Err("Invalid protobuf: unexpected EOF while reading varint".to_string());
        };
        offset += 1;
        value += (byte & 0x7f) as f64 * scale;
        if byte & 0x80 == 0 {
            return Ok((value, offset));
        }
        scale *= 128.0;
    }
    Err("Invalid protobuf: varint is too long".to_string())
}

/// JavaScript の ToUint32
fn to_uint32(v: f64) -> u32 {
    (v % 4294967296.0) as u32
}

fn add_offset(offset: usize, length: f64) -> usize {
    if length >= usize::MAX as f64 {
        usize::MAX
    } else {
        offset.saturating_add(length as usize)
    }
}

/// sbk.ts の skipField
fn skip_field(data: &[u8], offset: usize, wire_type: u32) -> Result<usize> {
    match wire_type {
        0 => Ok(read_varint(data, offset)?.1),
        1 => {
            if offset + 8 > data.len() {
                return Err("Invalid protobuf: truncated 64-bit field".to_string());
            }
            Ok(offset + 8)
        }
        2 => {
            let (length, next) = read_varint(data, offset)?;
            Ok(add_offset(next, length))
        }
        5 => {
            if offset + 4 > data.len() {
                return Err("Invalid protobuf: truncated 32-bit field".to_string());
            }
            Ok(offset + 4)
        }
        _ => Err(format!("Unsupported protobuf wire type: {}", wire_type)),
    }
}

#[derive(Clone, Copy)]
struct Row {
    packed: Packed,
    offset: u32,
}

pub struct SbkBook {
    data: Vec<u8>,
    /// Packed SFEN 順に整列した行
    rows: Vec<Row>,
    /// ファイル内の順序での State の位置
    offsets: Vec<u32>,
    first_non_zero_row: usize,
    pub author: Option<String>,
    pub description: Option<String>,
}

/// sbk.ts の decodeStateAt (範囲外の場合はエラー)
fn decode_state_at(data: &[u8], tag_offset: usize) -> Result<SBookState> {
    let (tag, after_tag) = read_varint(data, tag_offset)?;
    if tag != 26.0 {
        return Err(format!("Invalid SBookState tag: {}", tag));
    }
    let (length, payload) = read_varint(data, after_tag)?;
    let end = add_offset(payload, length);
    if end > data.len() {
        return Err("Invalid sbk: truncated SBookState payload".to_string());
    }
    decode_state(&data[payload..end])
}

/// sbk.ts の decodeStateAtFile (範囲外は切り詰める)
fn decode_state_at_file(data: &[u8], tag_offset: usize) -> Result<SBookState> {
    let (tag, after_tag) = read_varint(data, tag_offset)?;
    if tag != 26.0 {
        return Err(format!("Invalid SBookState tag: {}", tag));
    }
    let (length, payload) = read_varint(data, after_tag)?;
    let end = add_offset(payload, length).min(data.len());
    let start = payload.min(end);
    decode_state(&data[start..end])
}

fn compare_packed(a: &Packed, b: &Packed) -> core::cmp::Ordering {
    a.cmp(b)
}

/// sbk.ts の sortRows (Packed SFEN 順)。
/// 同じ局面の行の順序が JavaScript 版と一致するように、同じアルゴリズムで整列する。
fn sort_rows(rows: &mut [Row]) {
    let n = rows.len();
    if n <= 1 {
        return;
    }
    let mut ranges: Vec<(usize, usize)> = vec![(0, n - 1)];
    while let Some((left, right)) = ranges.pop() {
        if left >= right {
            continue;
        }
        let pivot = rows[left + (right - left) / 2].packed;
        let mut i = left as isize;
        let mut j = right as isize;
        while i <= j {
            while compare_packed(&rows[i as usize].packed, &pivot).is_lt() {
                i += 1;
            }
            while compare_packed(&rows[j as usize].packed, &pivot).is_gt() {
                j -= 1;
            }
            if i <= j {
                rows.swap(i as usize, j as usize);
                i += 1;
                j -= 1;
            }
        }
        let (l, r) = (left as isize, right as isize);
        if l < j && i < r {
            if j - l > r - i {
                ranges.push((left, j as usize));
                ranges.push((i as usize, right));
            } else {
                ranges.push((i as usize, right));
                ranges.push((left, j as usize));
            }
        } else if l < j {
            ranges.push((left, j as usize));
        } else if i < r {
            ranges.push((i as usize, right));
        }
    }
}

fn is_empty_state(state: &SBookState) -> bool {
    state.moves.is_empty()
        && state.evals.is_empty()
        && state.comment.as_deref().unwrap_or("").is_empty()
        && state.games == 0
        && state.won_black == 0
        && state.won_white == 0
}

fn non_empty(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

/// sbk.ts の buildBookEntryFromState
fn build_entry(state: &SBookState, sfen: &str) -> Option<Entry> {
    if is_empty_state(state) {
        return None;
    }
    let pos = Board::parse_sfen(sfen)?;
    let mut moves = Vec::with_capacity(state.moves.len());
    for m in &state.moves {
        // 駒の種類やマスが不正な指し手は除外する (JavaScript 版では不正なオブジェクトが作られる)
        let Some(mv) = from_sbk_move(&pos, m.mv) else {
            continue;
        };
        moves.push(BookMove {
            usi: crate::moves::format_usi(&mv.usi_move()),
            count: (m.weight != 0).then_some(m.weight as f64),
            sbk_eval: (m.evaluation != 0).then_some(m.evaluation as f64),
            sbk_id: Some(m.next_state_id as f64),
            ..Default::default()
        });
    }
    let evals: Vec<Eval> = state
        .evals
        .iter()
        .map(|e| Eval {
            evaluation_value: e.evaluation_value as f64,
            depth: e.depth as f64,
            sel_depth: e.sel_depth as f64,
            nodes: e.nodes,
            variation: non_empty(&e.variation),
            engine_name: e.engine_name.as_deref().and_then(non_empty),
        })
        .collect();
    Some(Entry {
        patch: false,
        moves,
        min_ply: None,
        comment: state.comment.as_deref().and_then(non_empty),
        games: (state.games != 0).then_some(state.games as f64),
        won_black: (state.won_black != 0).then_some(state.won_black as f64),
        won_white: (state.won_white != 0).then_some(state.won_white as f64),
        sbk_evals: (!evals.is_empty()).then_some(evals),
    })
}

struct Frame {
    moves: Vec<SBookMove>,
    index: usize,
    last_move: Option<crate::moves::Move>,
}

impl SbkBook {
    /// 空の定跡 (元のファイルが無い場合)
    pub fn empty() -> SbkBook {
        SbkBook {
            data: Vec::new(),
            rows: Vec::new(),
            offsets: Vec::new(),
            first_non_zero_row: 0,
            author: None,
            description: None,
        }
    }

    /// loadSbkBookOnTheFly に相当する
    pub fn open(data: Vec<u8>) -> Result<SbkBook> {
        // scanSBookTopLevel と buildStateOffsetTable
        let mut author = None;
        let mut description = None;
        let mut offsets: Vec<u32> = Vec::new();
        let mut offset = 0usize;
        while offset < data.len() {
            let tag_offset = offset;
            let (tag, next) = read_varint(&data, offset)?;
            offset = next;
            if tag == 0.0 {
                break;
            }
            let field = to_uint32(tag) >> 3;
            let wire_type = to_uint32(tag) & 7;
            if (field == 1 || field == 2) && wire_type == 2 {
                let (length, text_offset) = read_varint(&data, offset)?;
                let end = add_offset(text_offset, length);
                if end > data.len() {
                    return Err("Invalid protobuf: truncated field payload".to_string());
                }
                let text = decode_utf8_keep_bom(&data[text_offset..end]);
                if field == 1 {
                    author = Some(text);
                } else {
                    description = Some(text);
                }
                offset = end;
                continue;
            }
            if field == 3 && wire_type == 2 {
                let (length, state_offset) = read_varint(&data, offset)?;
                offset = add_offset(state_offset, length);
                if offset > data.len() {
                    return Err("Invalid protobuf: truncated SBookState payload".to_string());
                }
                offsets.push(tag_offset as u32);
                continue;
            }
            offset = skip_field(&data, offset, wire_type)?;
        }

        // fillPackedSfenByTraversal
        let count = offsets.len();
        let mut packed: Vec<Packed> = vec![[0; 8]; count];
        let mut visited = vec![false; count];
        let mut stack: Vec<Frame> = Vec::new();
        for root in 0..count {
            if visited[root] {
                continue;
            }
            let root_offset = offsets[root] as usize;
            let mut root_state = decode_state_at(&data, root_offset)?;
            // Position を持たない State は他の State からの遷移により解決される
            // ただし、BookConv の実装では先頭の State が Position を持たない場合に平手初期局面とみなしているのでそれに倣う
            if root_state.position.as_deref().unwrap_or("").is_empty() {
                if root != 0 {
                    continue;
                }
                root_state.position = Some(STANDARD_SFEN.to_string());
            }
            let Some(mut pos) = Board::parse_sfen(root_state.position.as_deref().unwrap_or(""))
            else {
                continue;
            };
            if let Some(p) = pack_position(&pos) {
                packed[root] = p;
            }
            visited[root] = true;
            stack.push(Frame {
                moves: std::mem::take(&mut root_state.moves),
                index: 0,
                last_move: None,
            });
            // JavaScript 版はフレームを積む時点で全ての指し手を変換しているが、
            // 子の局面から戻った時点で局面は元に戻っているため、取り出す時点で変換しても同じ結果になる。
            while let Some(frame) = stack.last_mut() {
                if frame.index >= frame.moves.len() {
                    let frame = stack.pop().unwrap();
                    if let Some(m) = frame.last_move {
                        undo_move(&mut pos, &m);
                    }
                    continue;
                }
                let sbk_move = &frame.moves[frame.index];
                frame.index += 1;
                let next = sbk_move.next_state_id;
                if next < 0 || next as usize >= count || visited[next as usize] {
                    continue;
                }
                let Some(mv) = from_sbk_move(&pos, sbk_move.mv) else {
                    continue;
                };
                if !do_move(&mut pos, &mv) {
                    continue;
                }
                let next = next as usize;
                let next_offset = offsets[next] as usize;
                let next_state = decode_state_at(&data, next_offset)?;
                if let Some(p) = pack_position(&pos) {
                    packed[next] = p;
                }
                stack.push(Frame {
                    moves: next_state.moves,
                    index: 0,
                    last_move: Some(mv),
                });
                visited[next] = true;
            }
        }

        let mut rows: Vec<Row> = offsets
            .iter()
            .zip(packed)
            .map(|(&offset, packed)| Row { packed, offset })
            .collect();
        sort_rows(&mut rows);
        let first_non_zero_row = rows.iter().take_while(|r| r.packed == [0; 8]).count();
        Ok(SbkBook {
            data,
            rows,
            offsets,
            first_non_zero_row,
            author,
            description,
        })
    }

    pub fn state_count(&self) -> usize {
        self.offsets.len()
    }

    /// searchOnTheFlyRow
    fn search_row(&self, sfen: &str) -> Option<usize> {
        // 元のファイルが無い場合 (新規作成・他の形式からの変換) は SFEN を解析せずに済ませる
        if self.rows.is_empty() {
            return None;
        }
        let packed = pack_sfen(sfen)?;
        let mut left = self.first_non_zero_row;
        let mut right = self.rows.len();
        while left < right {
            let mid = (left + right) / 2;
            if self.rows[mid].packed < packed {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        if left < self.rows.len() && self.rows[left].packed == packed {
            Some(left)
        } else {
            None
        }
    }

    /// searchSbkBookEntryOnTheFly
    pub fn search(&self, sfen: &str) -> Result<Option<Entry>> {
        let Some(row) = self.search_row(sfen) else {
            return Ok(None);
        };
        let state = decode_state_at_file(&self.data, self.rows[row].offset as usize)?;
        Ok(build_entry(&state, sfen))
    }

    /// 全ての局面のエントリー (loadSbkBook に相当する)。
    /// ルート局面から指し手をたどり、同じ局面は後にたどった State で上書きする。順序は最初に現れた順。
    pub fn all_entries(&self) -> Result<Vec<(String, Entry)>> {
        let count = self.offsets.len();
        let mut entries: Vec<(String, Entry)> = Vec::new();
        let mut index: HashMap<String, usize> = HashMap::new();
        let mut add = |sfen: String, state: &SBookState| {
            // 何も情報を持たないリーフノードを除外 (上書きもしない)
            let Some(entry) = build_entry(state, &sfen) else {
                return;
            };
            match index.get(&sfen) {
                Some(&i) => entries[i].1 = entry,
                None => {
                    index.insert(sfen.clone(), entries.len());
                    entries.push((sfen, entry));
                }
            }
        };
        // JavaScript 版と同じく、ルート局面は State の Id、遷移先は State の順序 (NextStateId) で記録する
        let mut visited: HashSet<i64> = HashSet::new();
        struct LoadFrame {
            moves: Vec<SBookMove>,
            index: usize,
            last_move: Option<crate::moves::Move>,
        }
        for root in 0..count {
            let mut root_state = decode_state_at(&self.data, self.offsets[root] as usize)?;
            // BookConv の実装では先頭の State が Position を持たない場合に平手初期局面とみなしているのでそれに倣う
            if root == 0 && root_state.position.as_deref().unwrap_or("").is_empty() {
                root_state.position = Some(STANDARD_SFEN.to_string());
            }
            let position = root_state.position.clone().unwrap_or_default();
            if position.is_empty() || visited.contains(&(root_state.id as i64)) {
                continue;
            }
            let Some(mut pos) = Board::parse_sfen(&position) else {
                continue;
            };
            add(position, &root_state);
            visited.insert(root_state.id as i64);
            let mut stack = vec![LoadFrame {
                moves: std::mem::take(&mut root_state.moves),
                index: 0,
                last_move: None,
            }];
            while let Some(frame) = stack.last_mut() {
                if frame.index >= frame.moves.len() {
                    let frame = stack.pop().unwrap();
                    if let Some(m) = frame.last_move {
                        undo_move(&mut pos, &m);
                    }
                    continue;
                }
                let sbk_move = &frame.moves[frame.index];
                frame.index += 1;
                let next = sbk_move.next_state_id as i64;
                if visited.contains(&next) {
                    continue;
                }
                let Some(mv) = from_sbk_move(&pos, sbk_move.mv) else {
                    continue;
                };
                if !do_move(&mut pos, &mv) {
                    continue;
                }
                if next < 0 || next as usize >= count {
                    undo_move(&mut pos, &mv);
                    continue;
                }
                let next_state = decode_state_at(&self.data, self.offsets[next as usize] as usize)?;
                add(pos.to_sfen(), &next_state);
                stack.push(LoadFrame {
                    moves: next_state.moves,
                    index: 0,
                    last_move: Some(mv),
                });
                visited.insert(next);
            }
        }
        Ok(entries)
    }

    /// storeSbkBookOnTheFly の書き出しを開始する。patches は in-memory のエントリー (挿入順)。
    pub fn begin_save(&self, patches: Vec<(String, Entry)>) -> Result<SbkWriter> {
        SbkWriter::new(self, patches)
    }
}

/// JavaScript の Set<string> (挿入順を保持する)
#[derive(Default)]
struct OrderedSet {
    items: Vec<String>,
    index: HashSet<String>,
}

impl OrderedSet {
    fn add(&mut self, s: String) {
        if !self.index.contains(&s) {
            self.index.insert(s.clone());
            self.items.push(s);
        }
    }

    fn has(&self, s: &str) -> bool {
        self.index.contains(s)
    }
}

/// tsshogi の createMoveByUSI と doMove を行い、成功した場合は移動後の SFEN を返して局面を戻す
fn next_sfen(pos: &mut Board, usi: &str) -> Option<String> {
    let mv = create_move(pos, &parse_usi(usi)?)?;
    if !do_move(pos, &mv) {
        return None;
    }
    let sfen = pos.to_sfen();
    undo_move(pos, &mv);
    Some(sfen)
}

/// JavaScript の数値を int32 として書き出す場合の検証 (assertInt32)
fn to_int32(v: f64) -> Result<i32> {
    if v.fract() != 0.0 || !(i32::MIN as f64..=i32::MAX as f64).contains(&v) {
        return Err(format!("invalid int32: {}", v));
    }
    Ok(v as i32)
}

/// `x ?? 0` を int32 として書き出す値 (0 は書き出されないので検証しない)
fn int32_or_zero(v: Option<f64>) -> Result<i32> {
    match v {
        Some(v) if v != 0.0 => to_int32(v),
        _ => Ok(0),
    }
}

/// sbk.ts の entryToSbkState
fn entry_to_state(
    id: i32,
    entry: &Entry,
    sfen: &str,
    usi_to_next_id: Option<&HashMap<String, i32>>,
    with_position: bool,
) -> Result<SBookState> {
    let mut moves = Vec::new();
    if let Some(pos) = Board::parse_sfen(sfen) {
        for bm in &entry.moves {
            let Some(mv) = parse_usi(&bm.usi).and_then(|u| create_move(&pos, &u)) else {
                continue;
            };
            moves.push(SBookMove {
                mv: to_sbk_move(&mv),
                // bookMove.sbkEval || SBookMoveEvaluation.None
                evaluation: match bm.sbk_eval {
                    Some(v) if v != 0.0 && !v.is_nan() => to_int32(v)?,
                    _ => 0,
                },
                weight: int32_or_zero(bm.count)?,
                next_state_id: usi_to_next_id
                    .and_then(|m| m.get(&bm.usi).copied())
                    .unwrap_or(-1),
            });
        }
    }
    let mut evals = Vec::new();
    for e in entry.sbk_evals.iter().flatten() {
        evals.push(SBookEval {
            evaluation_value: int32_or_zero(Some(e.evaluation_value))?,
            depth: int32_or_zero(Some(e.depth))?,
            sel_depth: int32_or_zero(Some(e.sel_depth))?,
            nodes: e.nodes,
            variation: e.variation.clone().unwrap_or_default(),
            engine_name: e.engine_name.clone(),
        });
    }
    Ok(SBookState {
        id,
        games: int32_or_zero(entry.games)?,
        won_black: int32_or_zero(entry.won_black)?,
        won_white: int32_or_zero(entry.won_white)?,
        position: with_position.then(|| sfen.to_string()),
        comment: entry.comment.clone(),
        moves,
        evals,
    })
}

/// storeSbkBookOnTheFly の書き出し処理
pub struct SbkWriter {
    patches: Vec<(String, Entry)>,
    patch_index: HashMap<String, usize>,
    offset_to_patch: HashMap<u32, usize>,
    new_sfens: Vec<String>,
    root_sfens: OrderedSet,
    /// 新たにルートになる局面のうち元の SBK に存在する State の位置 → SFEN
    root_offsets: HashMap<u32, String>,
    usi_to_next_id: Vec<HashMap<String, i32>>,
    header: Option<Vec<u8>>,
    /// 次に書き出す State (0〜state_count-1 は元の SBK、それ以降は新しい局面)
    next: usize,
}

impl SbkWriter {
    fn new(book: &SbkBook, patches: Vec<(String, Entry)>) -> Result<SbkWriter> {
        let mut patch_index = HashMap::new();
        for (i, (sfen, _)) in patches.iter().enumerate() {
            patch_index.insert(sfen.clone(), i);
        }

        // in-memory 内で遷移元が存在する局面
        let mut in_memory_ref = OrderedSet::default();
        // 元の SBK に存在しない局面
        let mut new_sfens = OrderedSet::default();
        // 新たにルートになる局面
        let mut root_sfens = OrderedSet::default();
        // 元の SBK の State の位置 → in-memory のエントリー
        let mut offset_to_patch: HashMap<u32, usize> = HashMap::new();
        // 指し手の遷移先の局面 (局面の解析に失敗した場合は空)。後で再び使うため保持しておく
        let mut next_sfens: Vec<Vec<Option<String>>> = Vec::with_capacity(patches.len());

        for (i, (sfen, entry)) in patches.iter().enumerate() {
            // 同一局面の State が複数存在する場合は全てに同じエントリーを適用する
            if let Some(first) = book.search_row(sfen) {
                let key = book.rows[first].packed;
                for row in &book.rows[first..] {
                    if row.packed != key {
                        break;
                    }
                    offset_to_patch.insert(row.offset, i);
                }
            }

            let Some(mut pos) = Board::parse_sfen(sfen) else {
                next_sfens.push(Vec::new());
                continue;
            };
            // 遷移先の局面を列挙する
            let nexts: Vec<Option<String>> =
                entry.moves.iter().map(|bm| next_sfen(&mut pos, &bm.usi)).collect();
            for next in nexts.iter().flatten() {
                in_memory_ref.add(next.clone());
            }
            next_sfens.push(nexts);

            // 元の SBK を検索する
            let Some(sbk_entry) = book.search(sfen)? else {
                // 元の SBK に存在しない局面
                new_sfens.add(sfen.clone());
                continue;
            };

            // 元の SBK にあったが in-memory では削除された指し手
            // パッチは元の SBK の指し手に追加・上書きするだけで削除はしないため対象外とする
            for m in &sbk_entry.moves {
                if entry.patch || entry.moves.iter().any(|bm| bm.usi == m.usi) {
                    continue;
                }
                // 遷移元の指し手が削除された場合はルート局面として扱う
                if let Some(next) = next_sfen(&mut pos, &m.usi) {
                    root_sfens.add(next);
                }
            }
        }

        // in-memory の参照先が元の SBK に存在しない場合は newSfens に追加
        for sfen in &in_memory_ref.items {
            if new_sfens.has(sfen) {
                continue;
            }
            if book.search_row(sfen).is_none() {
                new_sfens.add(sfen.clone());
            }
        }

        // in-memory で遷移元が存在せず、かつ元の SBK にも存在しない局面はルート局面として扱う
        for (sfen, _) in &patches {
            if !in_memory_ref.has(sfen) && new_sfens.has(sfen) {
                root_sfens.add(sfen.clone());
            }
        }

        // 新たにルートになる局面のうち元の SBK に存在する State の位置
        // 削除された指し手の遷移先は編集されていなくても Position を書き出す必要がある
        // (書き出さないと、他に遷移元が無い場合に到達できなくなる)
        let mut root_offsets: HashMap<u32, String> = HashMap::new();
        for sfen in &root_sfens.items {
            if let Some(first) = book.search_row(sfen) {
                let key = book.rows[first].packed;
                for row in &book.rows[first..] {
                    if row.packed != key {
                        break;
                    }
                    root_offsets.insert(row.offset, sfen.clone());
                }
            }
        }

        // 新しい SFEN に ID を割り当てる
        let mut new_sfen_to_id: HashMap<&str, i32> = HashMap::new();
        let base = book.state_count() as i32;
        for (i, sfen) in new_sfens.items.iter().enumerate() {
            new_sfen_to_id.insert(sfen, base + i as i32);
        }

        // 局面と USI に対して遷移先の ID を解決する
        let mut usi_to_next_id = Vec::with_capacity(patches.len());
        for ((sfen, entry), nexts) in patches.iter().zip(&next_sfens) {
            let mut map: HashMap<String, i32> = HashMap::new();
            if let Some(sbk_entry) = book.search(sfen)? {
                for m in &sbk_entry.moves {
                    if let Some(id) = m.sbk_id {
                        if id >= 0.0 {
                            map.insert(m.usi.clone(), id as i32);
                        }
                    }
                }
            }
            // 局面の解析に失敗した場合 (nexts が空) は遷移先を解決しない
            if !nexts.is_empty() {
                for (bm, next) in entry.moves.iter().zip(nexts) {
                    if map.contains_key(&bm.usi) {
                        continue;
                    }
                    let Some(next) = next else {
                        continue;
                    };
                    let mut next_id = new_sfen_to_id.get(next.as_str()).copied();
                    if next_id.is_none() {
                        if let Some(row) = book.search_row(&next) {
                            let state = decode_state_at_file(&book.data, book.rows[row].offset as usize)?;
                            next_id = Some(state.id);
                        }
                    }
                    if let Some(id) = next_id {
                        map.insert(bm.usi.clone(), id);
                    }
                }
            }
            usi_to_next_id.push(map);
        }

        let mut header = Writer::new();
        if let Some(author) = book.author.as_deref().filter(|s| !s.is_empty()) {
            header.uint32(10);
            header.string(author);
        }
        if let Some(description) = book.description.as_deref().filter(|s| !s.is_empty()) {
            header.uint32(18);
            header.string(description);
        }

        Ok(SbkWriter {
            patches,
            patch_index,
            offset_to_patch,
            new_sfens: new_sfens.items,
            root_sfens,
            root_offsets,
            usi_to_next_id,
            header: Some(header.buf),
            next: 0,
        })
    }

    pub fn total(&self, book: &SbkBook) -> usize {
        book.state_count() + self.new_sfens.len()
    }

    fn base_state(&self, book: &SbkBook, id: usize) -> Result<SBookState> {
        let offset = book.offsets[id];
        let Some(&p) = self.offset_to_patch.get(&offset) else {
            // 元の SBK を変更無しで書き出す (BoardKey と HandKey は取り除く)
            let mut state = decode_state_at(&book.data, offset as usize)?;
            // 新たにルートになる場合は Position を付与する
            if let Some(root) = self.root_offsets.get(&offset) {
                if state.position.as_deref().unwrap_or("").is_empty() {
                    state.position = Some(root.clone());
                }
            }
            return Ok(state);
        };
        let (sfen, patch) = &self.patches[p];
        let usi_to_next_id = Some(&self.usi_to_next_id[p]);
        if !patch.patch {
            // in-memory のデータを書き出す
            // 元の State が Position を持つ場合 (ルート局面) はそれを維持する
            let original = decode_state_at_file(&book.data, offset as usize)?;
            let with_position = !original.position.as_deref().unwrap_or("").is_empty()
                || self.root_sfens.has(sfen);
            return entry_to_state(id as i32, patch, sfen, usi_to_next_id, with_position);
        }
        // 元の SBK にパッチを当てて書き出す
        let state = decode_state_at_file(&book.data, offset as usize)?;
        let base_entry = build_entry(&state, sfen);
        match merge_entries(base_entry, Some(patch)) {
            Some(entry) => {
                let with_position = !state.position.as_deref().unwrap_or("").is_empty()
                    || self.root_sfens.has(sfen);
                entry_to_state(id as i32, &entry, sfen, usi_to_next_id, with_position)
            }
            None => Ok(state),
        }
    }

    /// 最大 max_states 件の State を out に書き出し、書き出した件数を返す
    pub fn write_next(
        &mut self,
        book: &SbkBook,
        max_states: usize,
        out: &mut Vec<u8>,
    ) -> Result<usize> {
        let mut w = Writer {
            buf: std::mem::take(out),
        };
        if let Some(header) = self.header.take() {
            w.buf.extend_from_slice(&header);
        }
        let base_count = book.state_count();
        let total = self.total(book);
        let mut state_buf = Writer::new();
        let mut scratch = Writer::new();
        let mut count = 0;
        while count < max_states && self.next < total {
            let state = if self.next < base_count {
                self.base_state(book, self.next)?
            } else {
                // 新たに追加された局面
                let sfen = &self.new_sfens[self.next - base_count];
                let id = self.next as i32;
                let empty = Entry::default();
                let (entry, map) = match self.patch_index.get(sfen) {
                    Some(&p) => (&self.patches[p].1, Some(&self.usi_to_next_id[p])),
                    None => (&empty, None),
                };
                entry_to_state(id, entry, sfen, map, self.root_sfens.has(sfen))?
            };
            state_buf.buf.clear();
            encode_state(&mut state_buf, &state, &mut scratch);
            w.message(26, &state_buf.buf);
            self.next += 1;
            count += 1;
        }
        *out = w.buf;
        Ok(count)
    }
}
