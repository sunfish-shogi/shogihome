//! 定跡のエントリー (src/background/book/types.ts の BookEntry に対応する)。
//! 数値は JavaScript の number と同じく f64 で保持する。

#[derive(Clone, Default, PartialEq, Debug)]
pub struct BookMove {
    pub usi: String,
    pub usi2: Option<String>,
    pub score: Option<f64>,
    pub depth: Option<f64>,
    pub count: Option<f64>,
    pub comment: Option<String>,
    pub sbk_eval: Option<f64>,
    pub sbk_id: Option<f64>,
}

#[derive(Clone, PartialEq, Debug)]
pub struct Eval {
    pub evaluation_value: f64,
    pub depth: f64,
    pub sel_depth: f64,
    pub nodes: i64,
    pub variation: Option<String>,
    pub engine_name: Option<String>,
}

#[derive(Clone, Default, PartialEq, Debug)]
pub struct Entry {
    pub patch: bool,
    pub moves: Vec<BookMove>,
    pub min_ply: Option<f64>,
    pub comment: Option<String>,
    pub games: Option<f64>,
    pub won_black: Option<f64>,
    pub won_white: Option<f64>,
    pub sbk_evals: Option<Vec<Eval>>,
}

/// JavaScript の `x || 0` (x が number の場合)
fn or_zero(x: Option<f64>) -> f64 {
    match x {
        Some(v) if v != 0.0 && !v.is_nan() => v,
        _ => 0.0,
    }
}

/// JavaScript の Math.min(a, b)
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == 0.0 && b == 0.0 {
        // -0 を優先する
        return if a.is_sign_negative() { a } else { b };
    }
    if a < b {
        a
    } else {
        b
    }
}

fn sum(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    if a.is_some() || b.is_some() {
        Some(or_zero(a) + or_zero(b))
    } else {
        None
    }
}

/// JavaScript の `a || b` (a, b が string の場合)
fn or_str(a: &Option<String>, b: &Option<String>) -> Option<String> {
    match a {
        Some(s) if !s.is_empty() => Some(s.clone()),
        _ => b.clone(),
    }
}

/// types.ts の mergeBookEntries に相当する
pub fn merge_entries(base: Option<Entry>, patch: Option<&Entry>) -> Option<Entry> {
    if let Some(p) = patch {
        if !p.patch {
            return Some(p.clone());
        }
    }
    let Some(base) = base else {
        let p = patch?;
        let mut e = p.clone();
        e.patch = false;
        return Some(e);
    };
    let Some(patch) = patch else {
        return Some(base);
    };

    // Map.set と同じく、同じ USI が複数ある場合は後のものが優先される
    let find_patch = |usi: &str| patch.moves.iter().rev().find(|m| m.usi == usi);
    let mut moves: Vec<BookMove> = base
        .moves
        .iter()
        .map(|m| match find_patch(&m.usi) {
            Some(p) => BookMove {
                usi: p.usi.clone(),
                usi2: p.usi2.clone().or_else(|| m.usi2.clone()),
                score: p.score.or(m.score),
                depth: p.depth.or(m.depth),
                count: sum(p.count, m.count),
                comment: p.comment.clone().or_else(|| m.comment.clone()),
                sbk_eval: p.sbk_eval.or(m.sbk_eval),
                sbk_id: None,
            },
            None => m.clone(),
        })
        .collect();
    for m in &patch.moves {
        if !base.moves.iter().any(|b| b.usi == m.usi) {
            moves.push(m.clone());
        }
    }

    Some(Entry {
        patch: false,
        comment: or_str(&patch.comment, &base.comment),
        moves,
        games: sum(base.games, patch.games),
        won_black: sum(base.won_black, patch.won_black),
        won_white: sum(base.won_white, patch.won_white),
        sbk_evals: patch.sbk_evals.clone().or_else(|| base.sbk_evals.clone()),
        min_ply: match base.min_ply {
            Some(b) => Some(match patch.min_ply {
                Some(p) => js_min(b, p),
                None => b,
            }),
            None => patch.min_ply,
        },
    })
}
