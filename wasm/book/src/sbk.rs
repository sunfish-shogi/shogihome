//! SBK 形式の読み書き。
//! src/background/book/sbk.ts の loadSbkBook と storeSbkBookFromInMemoryMap の移植。
//! 同じ入力に対して同じ結果 (エントリーの内容と順序・出力のバイト列) を得ることを目標とする。

use crate::board::{Board, STANDARD_SFEN};
use crate::moves::{create_move, do_move, from_sbk_move, to_sbk_move, undo_move, Move};
use crate::proto::{self, decode_book, encode_state, SBookEval, SBookMove, SBookState, Writer};
use crate::store::{BookMove, Entry, Eval, FxBuild, Key, Store, Usi};
use std::collections::{HashMap, HashSet};

pub struct LoadedBook {
    pub store: Store,
    pub author: String,
    pub description: String,
}

/// JavaScript の Set<number> (State ID の集合)
struct IdSet {
    dense: Vec<bool>,
    sparse: HashSet<i32, FxBuild>,
}

impl IdSet {
    fn new(n: usize) -> IdSet {
        IdSet {
            dense: vec![false; n],
            sparse: HashSet::default(),
        }
    }

    fn has(&self, id: i32) -> bool {
        if id >= 0 && (id as usize) < self.dense.len() {
            self.dense[id as usize]
        } else {
            self.sparse.contains(&id)
        }
    }

    fn add(&mut self, id: i32) {
        if id >= 0 && (id as usize) < self.dense.len() {
            self.dense[id as usize] = true;
        } else {
            self.sparse.insert(id);
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

fn add_entry(store: &mut Store, key: Key, state: &SBookState, pos: &Board) {
    // 何も情報を持たないリーフノードを除外
    if is_empty_state(state) {
        return;
    }
    let mut book_moves = Vec::with_capacity(state.moves.len());
    for m in &state.moves {
        // USI は局面に依存しない。
        // 不正な指し手 (JavaScript 版では不正なオブジェクトが作られる) は除外する
        let Some(mv) = from_sbk_move(pos, m.mv) else { continue };
        let mut bm = BookMove::new(Usi::from_move(&mv.usi_move()));
        bm.sbk_id = Some(m.next_state_id as f64);
        if m.weight != 0 {
            bm.count = Some(m.weight as f64);
        }
        if m.evaluation != 0 {
            bm.sbk_eval = Some(m.evaluation as f64);
        }
        book_moves.push(bm);
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
    let entry = Entry {
        patch: false,
        moves: book_moves,
        min_ply: None,
        comment: state.comment.as_deref().and_then(non_empty),
        games: (state.games != 0).then_some(state.games as f64),
        won_black: (state.won_black != 0).then_some(state.won_black as f64),
        won_white: (state.won_white != 0).then_some(state.won_white as f64),
        sbk_evals: (!evals.is_empty()).then(|| Box::new(evals)),
    };
    store.set(key, entry);
}

// JavaScript 版はフレームを積む時点で全ての指し手を Move に変換しているが、
// 子の局面から戻った時点で局面は元に戻っているため、取り出す時点で変換しても同じ結果になる。
struct LoadFrame {
    state: usize,
    index: usize,
    last_move: Option<Move>,
}

/// loadSbkBook に相当する
pub fn load_sbk(data: &[u8]) -> proto::Result<LoadedBook> {
    let mut book = decode_book(data)?;

    // BookConv の実装では先頭の State が Position を持たない場合に平手初期局面とみなしているのでそれに倣う
    if let Some(first) = book.states.first_mut() {
        if first.position.as_deref().unwrap_or("").is_empty() {
            first.position = Some(STANDARD_SFEN.to_string());
        }
    }

    let states = &book.states;
    let mut store = Store::default();
    store.reserve(states.len());
    let mut visited = IdSet::new(states.len());
    let mut stack: Vec<LoadFrame> = Vec::new();

    for (root_index, root_state) in states.iter().enumerate() {
        let position = root_state.position.as_deref().unwrap_or("");
        if position.is_empty() || visited.has(root_state.id) {
            continue;
        }
        let Some(mut pos) = Board::parse_sfen(position) else {
            continue;
        };
        add_entry(&mut store, Key::from_str(position), root_state, &pos);
        stack.push(LoadFrame {
            state: root_index,
            index: 0,
            last_move: None,
        });
        visited.add(root_state.id);

        while let Some(frame) = stack.last_mut() {
            let moves = &states[frame.state].moves;
            if frame.index >= moves.len() {
                let frame = stack.pop().unwrap();
                if let Some(m) = frame.last_move {
                    undo_move(&mut pos, &m);
                }
                continue;
            }
            let sbk_move = &moves[frame.index];
            frame.index += 1;
            let Some(mv) = from_sbk_move(&pos, sbk_move.mv) else {
                continue;
            };
            let next_state_id = sbk_move.next_state_id;
            if visited.has(next_state_id) {
                continue;
            }
            if !do_move(&mut pos, &mv) {
                continue;
            }
            let next_index = next_state_id as usize;
            if next_state_id < 0 || next_index >= states.len() {
                undo_move(&mut pos, &mv);
                continue;
            }
            let next_state = &states[next_index];
            add_entry(&mut store, Key::from_board(&pos), next_state, &pos);
            stack.push(LoadFrame {
                state: next_index,
                index: 0,
                last_move: Some(mv),
            });
            visited.add(next_state_id);
        }
    }

    Ok(LoadedBook {
        store,
        author: std::mem::take(&mut book.author),
        description: std::mem::take(&mut book.description),
    })
}

/// JavaScript の数値を int32 として書き出す場合の検証 (assertInt32)
fn to_int32(v: f64) -> proto::Result<i32> {
    if v.fract() != 0.0 || !(i32::MIN as f64..=i32::MAX as f64).contains(&v) {
        return Err(format!("invalid int32: {}", format_js_number(v)));
    }
    Ok(v as i32)
}

fn format_js_number(v: f64) -> String {
    if v.is_nan() {
        "NaN".to_string()
    } else if v.is_infinite() {
        if v > 0.0 { "Infinity" } else { "-Infinity" }.to_string()
    } else {
        format!("{}", v)
    }
}

#[derive(Clone, Copy)]
enum Target {
    Entry(u32),
    Leaf(u32),
}

struct Edge {
    move_index: u32,
    sbk_move: i32,
    next: Target,
}

struct SaveFrame {
    entry: usize,
    index: usize,
    last_move: Option<Move>,
}

/// storeSbkBookFromInMemoryMap の書き出し処理
pub struct SbkWriter {
    edges: Vec<Option<Vec<Edge>>>,
    non_root: Vec<bool>,
    leaves: Vec<Key>,
    entry_ids: Vec<i32>,
    leaf_id_base: i32,
    /// 書き出す順序 (エントリーの番号、または leaf_id_base 以降はリーフの番号)
    order: Vec<u32>,
    next: usize,
    header: Option<Vec<u8>>,
}

impl SbkWriter {
    pub fn new(store: &Store, author: &str, description: &str) -> SbkWriter {
        let n = store.len();
        let mut edges: Vec<Option<Vec<Edge>>> = (0..n).map(|_| None).collect();
        let mut non_root = vec![false; n];
        let mut leaves: Vec<Key> = Vec::new();
        let mut leaf_index: HashMap<Key, u32, FxBuild> = HashMap::default();
        let mut stack: Vec<SaveFrame> = Vec::new();

        for root in 0..n {
            if edges[root].is_some() {
                continue; // 訪問済み
            }
            let Some(mut pos) = store.key_at(root).to_board() else {
                continue;
            };
            stack.push(SaveFrame {
                entry: root,
                index: 0,
                last_move: None,
            });
            while let Some(frame) = stack.last_mut() {
                let entry = store.entry_at(frame.entry);
                if frame.index >= entry.moves.len() {
                    let frame = stack.pop().unwrap();
                    if let Some(m) = frame.last_move {
                        undo_move(&mut pos, &m);
                    }
                    continue;
                }
                let move_index = frame.index;
                frame.index += 1;
                let book_move = &entry.moves[move_index];
                let Some(usi) = book_move.usi.parse() else {
                    continue;
                };
                let Some(mv) = create_move(&pos, &usi) else {
                    continue;
                };
                if !do_move(&mut pos, &mv) {
                    continue;
                }
                let next_key = Key::from_board(&pos);
                let sbk_move = to_sbk_move(&mv);
                let from_entry = frame.entry;
                match store.find(&next_key) {
                    None => {
                        // エントリーに含まれないリーフノード (SBK の場合は出力に含める)
                        undo_move(&mut pos, &mv);
                        let id = match leaf_index.get(&next_key) {
                            Some(&id) => id,
                            None => {
                                let id = leaves.len() as u32;
                                leaf_index.insert(next_key.clone(), id);
                                leaves.push(next_key);
                                id
                            }
                        };
                        edges[from_entry].get_or_insert_with(Vec::new).push(Edge {
                            move_index: move_index as u32,
                            sbk_move,
                            next: Target::Leaf(id),
                        });
                    }
                    Some(next) => {
                        edges[from_entry].get_or_insert_with(Vec::new).push(Edge {
                            move_index: move_index as u32,
                            sbk_move,
                            next: Target::Entry(next as u32),
                        });
                        if next != root {
                            non_root[next] = true; // SFEN を省略してよいノード
                        }
                        if edges[next].is_some() {
                            undo_move(&mut pos, &mv);
                            continue; // 訪問済み
                        }
                        stack.push(SaveFrame {
                            entry: next,
                            index: 0,
                            last_move: Some(mv),
                        });
                    }
                }
            }
        }

        // ID を割り当てる。ID は書き出す順序と一致しなければならない。
        // ルートノードを先頭に書かないと ShogiGUI で正しく読み込まれない。
        let mut entry_ids = vec![0i32; n];
        let mut order = Vec::with_capacity(n + leaves.len());
        let mut id = 0i32;
        for pass_non_root in [false, true] {
            for i in 0..n {
                if non_root[i] == pass_non_root {
                    entry_ids[i] = id;
                    id += 1;
                    order.push(i as u32);
                }
            }
        }
        let leaf_id_base = id;
        for i in 0..leaves.len() {
            order.push((n + i) as u32);
        }

        let mut header = Writer::new();
        if !author.is_empty() {
            header.uint32(10);
            header.string(author);
        }
        if !description.is_empty() {
            header.uint32(18);
            header.string(description);
        }

        SbkWriter {
            edges,
            non_root,
            leaves,
            entry_ids,
            leaf_id_base,
            order,
            next: 0,
            header: Some(header.buf),
        }
    }

    pub fn total(&self) -> usize {
        self.order.len()
    }

    pub fn written(&self) -> usize {
        self.next
    }

    fn target_id(&self, t: Target) -> i32 {
        match t {
            Target::Entry(i) => self.entry_ids[i as usize],
            Target::Leaf(i) => self.leaf_id_base + i as i32,
        }
    }

    /// 最大 max_states 件の State を out に書き出し、書き出した件数を返す
    pub fn write_next(
        &mut self,
        store: &Store,
        max_states: usize,
        out: &mut Vec<u8>,
    ) -> proto::Result<usize> {
        let mut w = Writer { buf: std::mem::take(out) };
        if let Some(header) = self.header.take() {
            w.buf.extend_from_slice(&header);
        }
        let mut state_buf = Writer::new();
        let mut scratch = Writer::new();
        let n = store.len();
        let mut count = 0;
        while count < max_states && self.next < self.order.len() {
            let item = self.order[self.next] as usize;
            let state = if item < n {
                self.entry_state(store, item)?
            } else {
                let leaf = item - n;
                SBookState {
                    id: self.leaf_id_base + leaf as i32,
                    position: Some(self.leaves[leaf].to_sfen()),
                    ..Default::default()
                }
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

    fn entry_state(&self, store: &Store, i: usize) -> proto::Result<SBookState> {
        let entry = store.entry_at(i);
        let mut moves = Vec::new();
        if let Some(edges) = &self.edges[i] {
            for edge in edges {
                let bm = &entry.moves[edge.move_index as usize];
                // bookMove.sbkEval || SBookMoveEvaluation.None
                let evaluation = match bm.sbk_eval {
                    Some(v) if v != 0.0 && !v.is_nan() => to_int32(v)?,
                    _ => 0,
                };
                // bookMove.count ?? 0 (0 の場合は書き出されない)
                let weight = match bm.count {
                    Some(v) if v != 0.0 => to_int32(v)?,
                    _ => 0,
                };
                moves.push(SBookMove {
                    mv: edge.sbk_move,
                    evaluation,
                    weight,
                    next_state_id: self.target_id(edge.next),
                });
            }
        }
        let opt_int = |v: Option<f64>| -> proto::Result<i32> {
            match v {
                Some(v) if v != 0.0 => to_int32(v),
                _ => Ok(0),
            }
        };
        let mut evals = Vec::new();
        if let Some(list) = &entry.sbk_evals {
            for e in list.iter() {
                evals.push(SBookEval {
                    evaluation_value: opt_int(Some(e.evaluation_value))?,
                    depth: opt_int(Some(e.depth))?,
                    sel_depth: opt_int(Some(e.sel_depth))?,
                    nodes: e.nodes,
                    variation: e.variation.clone().unwrap_or_default(),
                    engine_name: e.engine_name.clone(),
                });
            }
        }
        Ok(SBookState {
            id: self.entry_ids[i],
            games: opt_int(entry.games)?,
            won_black: opt_int(entry.won_black)?,
            won_white: opt_int(entry.won_white)?,
            // 他のエントリーから参照されているノードの Position は省略
            position: if self.non_root[i] {
                None
            } else {
                Some(store.key_at(i).to_sfen())
            },
            comment: entry.comment.clone(),
            moves,
            evals,
        })
    }
}
