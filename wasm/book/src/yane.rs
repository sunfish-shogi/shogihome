//! やねうら王形式 (YANEURAOU-DB2016) の On-the-fly 処理。
//! src/background/book/yaneuraou.ts の On-the-fly モード (validateBookPositionOrdering・
//! searchYaneuraOuBookMovesOnTheFly・mergeYaneuraOuBook) の移植。同じ入力に対して同じ結果
//! (検索結果・書き出したバイト列) を得る。
//!
//! 元のファイルはメモリに読み込まず、Source を通して必要な部分だけを読む。
//! 文字列の比較・数値の解析と書式は JavaScript と同じ規則に従う (js_cmp・parse_int・to_fixed0)。

use crate::entry::{merge_entries, BookMove, Entry};
use std::cmp::Ordering;

pub const HEADER: &str = "#YANEURAOU-DB2016 1.00";
const MOVE_NONE: &str = "none";
const SCORE_NONE: &str = "none";
const DEPTH_NONE: &str = "none";
const SFEN_MARKER: &[u8] = b"sfen ";
const LF: u8 = b'\n';
const CR: u8 = b'\r';

/// 開く時に整列を検査する局面の数
const VALIDATION_POSITIONS: usize = 10000;
/// 順に読み込む場合の読み込みの単位
const LINE_READER_CHUNK: usize = 1024 * 1024;

/// 元のファイル。fs.read と同じく、読み込めたバイト数 (ファイルの末尾では 0) を返す。
pub trait Source {
    fn read_at(&mut self, pos: u64, buf: &mut [u8]) -> Result<usize, String>;
}

/// メモリ上のデータ (テスト用)
impl Source for &[u8] {
    fn read_at(&mut self, pos: u64, buf: &mut [u8]) -> Result<usize, String> {
        let len = self.len() as u64;
        if pos >= len {
            return Ok(0);
        }
        let start = pos as usize;
        let n = buf.len().min(self.len() - start);
        buf[..n].copy_from_slice(&self[start..start + n]);
        Ok(n)
    }
}

// ---------------------------------------------------------------------------
// JavaScript と同じ規則の文字列・数値の処理

/// JavaScript の文字列の比較 (UTF-16 のコード単位の順)
pub fn js_cmp(a: &str, b: &str) -> Ordering {
    if a.is_ascii() && b.is_ascii() {
        return a.as_bytes().cmp(b.as_bytes());
    }
    a.encode_utf16().cmp(b.encode_utf16())
}

/// JavaScript の文字列の長さ (UTF-16 のコード単位の数)
fn utf16_len(s: &str) -> usize {
    if s.is_ascii() {
        s.len()
    } else {
        s.encode_utf16().count()
    }
}

/// parseInt が読み飛ばす空白 (StrWhiteSpaceChar)
fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// JavaScript の parseInt(s, 10)。数字が無い場合は NaN を返す。
pub fn parse_int(s: &str) -> f64 {
    let s = s.trim_start_matches(is_js_whitespace);
    let (negative, rest) = if let Some(r) = s.strip_prefix('-') {
        (true, r)
    } else if let Some(r) = s.strip_prefix('+') {
        (false, r)
    } else {
        (false, s)
    };
    let digits = rest.bytes().take_while(|b| b.is_ascii_digit()).count();
    if digits == 0 {
        return f64::NAN;
    }
    // 15 桁以下の整数は f64 で正確に表せるので、整数として解析する (速い)
    let value: f64 = if digits <= 15 {
        rest[..digits].parse::<u64>().map_or(f64::NAN, |v| v as f64)
    } else {
        rest[..digits].parse().unwrap_or(f64::NAN)
    };
    if negative {
        -value
    } else {
        value
    }
}

/// to_fixed0 の結果を out に書き込む
fn write_fixed0(out: &mut Vec<u8>, x: f64) {
    use std::io::Write;
    let n = x.abs().round();
    if !x.is_nan() && n < 9.2e18 {
        // 2^63 未満の整数は u64 で正確に表せるので、整数として書式化する (速い)
        if x < 0.0 {
            out.push(b'-');
        }
        let _ = write!(out, "{}", n as u64);
    } else {
        out.extend_from_slice(to_fixed0(x).as_bytes());
    }
}

/// JavaScript の Number.prototype.toFixed(0)
pub fn to_fixed0(x: f64) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    if x.abs() >= 1e21 {
        // Number.prototype.toString と同じ書式になる
        if x.is_infinite() {
            return if x > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
        }
        return format!("{:e}", x).replace('e', "e+");
    }
    // 0.5 は絶対値の大きい方に丸める。-0 は負の数として扱わないが、-0.4 などは "-0" になる。
    let sign = if x < 0.0 { "-" } else { "" };
    let n = x.abs().round();
    // 2^63 未満の整数は u64 で正確に表せるので、整数として書式化する (速い)
    if n < 9.2e18 {
        return format!("{}{}", sign, n as u64);
    }
    format!("{}{:.0}", sign, n)
}

/// JavaScript の `x || 0` (x が number の場合)
fn or_zero(x: f64) -> f64 {
    if x == 0.0 || x.is_nan() {
        0.0
    } else {
        x
    }
}

fn decode(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// 行の文字列。正しい UTF-8 の場合はコピーしない。
fn decode_line(bytes: Vec<u8>) -> String {
    match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
    }
}

/// JavaScript の `text.split(/\r\n|\n|\r/)`
fn split_lines(text: &str) -> Vec<&str> {
    let b = text.as_bytes();
    let mut lines = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            LF => {
                lines.push(&text[start..i]);
                i += 1;
                start = i;
            }
            CR => {
                lines.push(&text[start..i]);
                i += if b.get(i + 1) == Some(&LF) { 2 } else { 1 };
                start = i;
            }
            _ => i += 1,
        }
    }
    lines.push(&text[start..]);
    lines
}

// ---------------------------------------------------------------------------
// 行の解析 (parseLine)

#[derive(Debug, PartialEq)]
pub enum Line {
    Comment(String),
    Position(String, f64),
    Move(BookMove),
}

/// normalizeSFEN: 手数を 1 にした SFEN と元の手数を返す
fn normalize_sfen(line: &str) -> (String, f64) {
    let b = line.as_bytes();
    let begin = 5;
    let mut end = begin;
    let mut columns = 0;
    while end < b.len() {
        if b[end] == b' ' {
            columns += 1;
            if columns == 3 {
                break;
            }
        }
        end += 1;
    }
    let ply_text = if end < b.len() { &line[end + 1..] } else { "" };
    (format!("{} 1", &line[begin..end]), or_zero(parse_int(ply_text)))
}

fn is_move_line(b: &[u8]) -> bool {
    let file = |c: u8| (b'1'..=b'9').contains(&c);
    let rank = |c: u8| (b'a'..=b'i').contains(&c);
    // /^[1-9][a-i][1-9][a-i]\+? /
    if b.len() >= 5 && file(b[0]) && rank(b[1]) && file(b[2]) && rank(b[3]) {
        if b[4] == b' ' || (b[4] == b'+' && b.get(5) == Some(&b' ')) {
            return true;
        }
    }
    // /^[RBGSNLP]\*[1-9][a-i] /
    b.len() >= 5 && b"RBGSNLP".contains(&b[0]) && b[1] == b'*' && file(b[2]) && rank(b[3]) && b[4] == b' '
}

pub fn parse_line(line: &str) -> Line {
    if let Some(c) = line.strip_prefix('#') {
        return Line::Comment(c.to_string());
    }
    if let Some(c) = line.strip_prefix("//") {
        return Line::Comment(c.to_string());
    }
    if line.as_bytes().starts_with(SFEN_MARKER) {
        let (sfen, ply) = normalize_sfen(line);
        return Line::Position(sfen, ply);
    }
    if is_move_line(line.as_bytes()) {
        // line.split(" ", 5)
        let mut columns: [&str; 5] = [""; 5];
        let mut column_count = 0;
        for c in line.split(' ').take(5) {
            columns[column_count] = c;
            column_count += 1;
        }
        let columns = &columns[..column_count];
        let comment_index: usize = columns.iter().map(|c| c.len() + 1).sum();
        let column = |i: usize| columns.get(i).copied();
        // columns[i] が無い場合、parseInt(undefined) は NaN になる
        let number = |c: Option<&str>, none: &str| match c {
            Some(c) if c == none || c.is_empty() => None,
            Some(c) => Some(parse_int(c)),
            None => Some(f64::NAN),
        };
        let comment = if comment_index < line.len() {
            let rest = &line[comment_index..];
            rest.strip_prefix('#')
                .or_else(|| rest.strip_prefix("//"))
                .unwrap_or(rest)
                .to_string()
        } else {
            String::new()
        };
        return Line::Move(BookMove {
            usi: columns[0].to_string(),
            usi2: match column(1) {
                Some(MOVE_NONE) => None,
                c => c.map(|c| c.to_string()),
            },
            score: number(column(2), SCORE_NONE),
            depth: number(column(3), DEPTH_NONE),
            count: match column(4) {
                Some(c) if !c.is_empty() => Some(parse_int(c)),
                _ => None,
            },
            comment: Some(comment),
            ..Default::default()
        });
    }
    Line::Comment(line.to_string())
}

fn append_comment_line(base: &str, next: &str) -> String {
    if base.is_empty() {
        next.to_string()
    } else {
        format!("{}\n{}", base, next)
    }
}

fn new_entry(ply: f64) -> Entry {
    Entry {
        comment: Some(String::new()),
        min_ply: Some(ply),
        ..Default::default()
    }
}

/// appendLineToEntry: コメント行は、指し手より前であれば局面のコメント、後ろであれば直前の指し手のコメントとする
fn append_line_to_entry(entry: &mut Entry, line: Line) {
    match line {
        Line::Move(m) => entry.moves.push(m),
        Line::Comment(c) => {
            if let Some(last) = entry.moves.last_mut() {
                last.comment = Some(append_comment_line(
                    last.comment.as_deref().unwrap_or(""),
                    &c,
                ));
            } else {
                entry.comment = Some(append_comment_line(
                    entry.comment.as_deref().unwrap_or(""),
                    &c,
                ));
            }
        }
        Line::Position(..) => {}
    }
}

// ---------------------------------------------------------------------------
// 行単位の読み込み (readline と同じく LF・CRLF・CR を改行とみなす)

struct LineReader {
    pos: u64,
    buf: Vec<u8>,
    start: usize,
    end: usize,
    skip_lf: bool,
    eof: bool,
}

impl LineReader {
    fn new() -> LineReader {
        LineReader {
            pos: 0,
            buf: Vec::new(),
            start: 0,
            end: 0,
            skip_lf: false,
            eof: false,
        }
    }

    /// 読み終えたバイト数
    fn consumed(&self) -> u64 {
        self.pos - (self.end - self.start) as u64
    }

    /// 次の行を返す。ファイルの末尾では None を返す (最後の改行の後ろの空の行は返さない)。
    fn next_line(&mut self, src: &mut dyn Source) -> Result<Option<Vec<u8>>, String> {
        let mut line = Vec::new();
        loop {
            if self.start == self.end {
                if self.eof {
                    return Ok(if line.is_empty() { None } else { Some(line) });
                }
                if self.buf.len() < LINE_READER_CHUNK {
                    self.buf.resize(LINE_READER_CHUNK, 0);
                }
                let n = src.read_at(self.pos, &mut self.buf)?;
                self.pos += n as u64;
                self.start = 0;
                self.end = n;
                if n == 0 {
                    self.eof = true;
                }
                continue;
            }
            if self.skip_lf {
                self.skip_lf = false;
                if self.buf[self.start] == LF {
                    self.start += 1;
                    continue;
                }
            }
            let chunk = &self.buf[self.start..self.end];
            match chunk.iter().position(|&b| b == LF || b == CR) {
                Some(i) => {
                    line.extend_from_slice(&chunk[..i]);
                    self.skip_lf = chunk[i] == CR;
                    self.start += i + 1;
                    return Ok(Some(line));
                }
                None => {
                    line.extend_from_slice(chunk);
                    self.start = self.end;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 開く (validateBookPositionOrdering)

/// 先頭の局面が整列されているかどうかを検査する
pub fn validate_ordering(src: &mut dyn Source) -> Result<bool, String> {
    let mut reader = LineReader::new();
    let mut prev = String::new();
    let mut count = 0;
    while let Some(bytes) = reader.next_line(src)? {
        if !bytes.starts_with(SFEN_MARKER) {
            continue;
        }
        let line = decode(&bytes);
        if !prev.is_empty() && js_cmp(&prev, &line) != Ordering::Less {
            return Ok(false);
        }
        count += 1;
        if count >= VALIDATION_POSITIONS {
            break;
        }
        prev = line;
    }
    Ok(true)
}

// ---------------------------------------------------------------------------
// 検索 (searchYaneuraOuBookMovesOnTheFly)

/// buffer[offset..] が "sfen " で始まるかどうか (バッファーの外は一致しない)
fn check_sfen_marker(buffer: &[u8], offset: usize) -> bool {
    buffer.get(offset..offset + SFEN_MARKER.len()) == Some(SFEN_MARKER)
}

/// findSFENMarker。buffer は読み込みに使ったバッファー全体、size は読み込めたバイト数
fn find_sfen_marker(buffer: &[u8], size: usize, is_file_head: bool) -> Option<usize> {
    if is_file_head {
        if check_sfen_marker(buffer, 0) {
            return Some(0);
        } else if buffer.starts_with(&[0xef, 0xbb, 0xbf]) && check_sfen_marker(buffer, 3) {
            return Some(3);
        }
    }
    let limit = size.saturating_sub(SFEN_MARKER.len() + 1);
    (0..limit).find(|&i| (buffer[i] == LF || buffer[i] == CR) && check_sfen_marker(buffer, i + 1))
        .map(|i| i + 1)
}

/// binarySearch: 局面の行の次の行の位置と元の手数を返す
fn binary_search(src: &mut dyn Source, size: u64, sfen: &str) -> Result<Option<(u64, f64)>, String> {
    const BUFFER_SIZE: usize = 1024;
    let mut buffer = vec![0u8; BUFFER_SIZE];
    let mut begin: u64 = 0;
    let mut end: u64 = size;
    while begin < end {
        let mid = (begin + end) / 2;

        // mid 以降で最初の SFEN の開始位置を探す (mid がちょうど行頭の場合も見つけられるように、直前の改行から探す)
        let mut head = mid.saturating_sub(1);
        let mut found: Option<(u64, u64)> = None; // (sfenOffset, lineStart)
        while head < end {
            let n = src.read_at(head, &mut buffer)?;
            if n == 0 {
                break;
            }
            if let Some(offset) = find_sfen_marker(&buffer, n, head == 0) {
                let sfen_offset = head + offset as u64;
                // ファイル先頭の BOM の後ろにある場合は、行の先頭はファイルの先頭とみなす
                let line_start = if head == 0 && offset == 3 && buffer[0] == 0xef {
                    0
                } else {
                    sfen_offset
                };
                found = Some((sfen_offset, line_start));
                break;
            }
            head += (BUFFER_SIZE - (SFEN_MARKER.len() + 1)) as u64;
        }
        let Some((sfen_offset, _)) = found.filter(|&(_, line_start)| line_start < end) else {
            // [mid, end) に SFEN が無いので、探している局面があるとすれば [begin, mid) にある
            end = mid;
            continue;
        };

        // SFEN を読み込む
        let n = src.read_at(sfen_offset, &mut buffer)?;
        let line_end = buffer[..n]
            .iter()
            .position(|&b| b == LF || b == CR)
            .unwrap_or(n);
        let sfen_line = decode(&buffer[..line_end]);
        let (current, ply) = normalize_sfen(&sfen_line);
        // 次の行の開始位置 (改行が CRLF の場合は 2 バイト進める)。
        // JavaScript 版と同じく、行の長さは文字列の長さ (UTF-16) で数える。
        let len16 = utf16_len(&sfen_line);
        let mut next_line = sfen_offset + len16 as u64 + 1;
        if buffer.get(len16) == Some(&CR) && buffer.get(len16 + 1) == Some(&LF) {
            next_line += 1;
        }
        match js_cmp(sfen, &current) {
            Ordering::Equal => return Ok(Some((next_line, ply))),
            Ordering::Less => end = mid,
            Ordering::Greater => begin = next_line,
        }
    }
    Ok(None)
}

/// findPositionLine: data の中で局面の行の開始位置を探す
fn find_position_line(data: &[u8], is_line_head: bool) -> Option<usize> {
    let mut i = 0;
    while i + SFEN_MARKER.len() <= data.len() {
        let line_head = if i == 0 {
            is_line_head
        } else {
            data[i - 1] == LF || data[i - 1] == CR
        };
        if line_head && check_sfen_marker(data, i) {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// readEntryLines: offset から次の局面の行の手前 (またはファイルの末尾) までの文字列
fn read_entry_text(src: &mut dyn Source, size: u64, offset: u64) -> Result<String, String> {
    const CHUNK_SIZE: u64 = 8 * 1024;
    let mut data: Vec<u8> = Vec::new();
    let mut entry_end: Option<usize> = None;
    let mut tail_len = 0usize;
    let mut position = offset;
    while position < size {
        let mut buffer = vec![0u8; CHUNK_SIZE.min(size - position) as usize];
        let n = src.read_at(position, &mut buffer)?;
        if n == 0 {
            break;
        }
        position += n as u64;
        let length = data.len();
        data.extend_from_slice(&buffer[..n]);
        // 前のチャンクの末尾から始まる局面の行は前回見つかっているので、先頭が行頭になるのは最初だけ
        let scan = &data[length - tail_len..];
        if let Some(found) = find_position_line(scan, length == 0) {
            entry_end = Some(length - tail_len + found);
            break;
        }
        tail_len = (tail_len + n).min(SFEN_MARKER.len());
    }
    Ok(decode(&data[..entry_end.unwrap_or(data.len())]))
}

/// 局面を検索する
pub fn search(src: &mut dyn Source, size: u64, sfen: &str) -> Result<Option<Entry>, String> {
    let Some((offset, ply)) = binary_search(src, size, sfen)? else {
        return Ok(None);
    };
    let text = read_entry_text(src, size, offset)?;
    let mut entry = new_entry(ply);
    if !text.is_empty() {
        let mut lines = split_lines(&text);
        if lines.last() == Some(&"") {
            lines.pop(); // 最後の改行の後ろは行ではない
        }
        for line in lines {
            let parsed = parse_line(line);
            if matches!(parsed, Line::Position(..)) {
                break;
            }
            append_line_to_entry(&mut entry, parsed);
        }
    }
    Ok(Some(entry))
}

// ---------------------------------------------------------------------------
// 書き出し (mergeYaneuraOuBook)

/// writeEntry
pub fn write_entry(out: &mut Vec<u8>, sfen: &str, entry: &Entry) {
    if entry.moves.is_empty() {
        return;
    }
    fn push(out: &mut Vec<u8>, parts: &[&str]) {
        for p in parts {
            out.extend_from_slice(p.as_bytes());
        }
        out.push(LF);
    }
    fn push_comment(out: &mut Vec<u8>, comment: Option<&str>) {
        if let Some(comment) = comment.filter(|c| !c.is_empty()) {
            for line in comment.split('\n') {
                push(out, &["#", line]);
            }
        }
    }
    fn push_number(out: &mut Vec<u8>, x: Option<f64>, none: &str) {
        match x {
            Some(x) => write_fixed0(out, x),
            None => out.extend_from_slice(none.as_bytes()),
        }
    }
    push(out, &["sfen ", sfen]);
    push_comment(out, entry.comment.as_deref());
    for m in &entry.moves {
        // やねうら王や BookConv は連続するスペースをまとめて読み込むので、値の省略時には 1 文字以上を出力する
        let usi2 = m.usi2.as_deref().filter(|s| !s.is_empty()).unwrap_or(MOVE_NONE);
        out.extend_from_slice(m.usi.as_bytes());
        out.push(b' ');
        out.extend_from_slice(usi2.as_bytes());
        out.push(b' ');
        push_number(out, m.score, SCORE_NONE);
        out.push(b' ');
        push_number(out, m.depth, DEPTH_NONE);
        out.push(b' ');
        push_number(out, m.count, "");
        out.push(LF);
        push_comment(out, m.comment.as_deref());
    }
}

/// 元のファイルに in-memory のエントリーを統合して書き出す
pub struct YaneMerger {
    reader: LineReader,
    patches: Vec<(String, Entry)>,
    patch_index: usize,
    last_patch_key: String,
    current: Option<(String, Entry)>,
    line_no: u64,
    header_written: bool,
    done: bool,
}

impl YaneMerger {
    /// patches は in-memory のエントリー (キーは手数を 1 にした SFEN)
    pub fn new(mut patches: Vec<(String, Entry)>) -> YaneMerger {
        patches.sort_by(|a, b| js_cmp(&a.0, &b.0));
        YaneMerger {
            reader: LineReader::new(),
            patches,
            patch_index: 0,
            last_patch_key: String::new(),
            current: None,
            line_no: 0,
            header_written: false,
            done: false,
        }
    }

    /// 読み終えた元のファイルのバイト数
    pub fn consumed(&self) -> u64 {
        self.reader.consumed()
    }

    /// 元のファイルのエントリーを、それ以前のパッチと共に書き出す
    fn emit(&mut self, sfen: &str, entry: Entry, out: &mut Vec<u8>) {
        while self.patch_index < self.patches.len() {
            let (key, patch) = &self.patches[self.patch_index];
            if js_cmp(key, sfen) == Ordering::Greater {
                break;
            }
            if key == sfen {
                let merged = merge_entries(Some(entry.clone()), Some(patch)).unwrap_or_default();
                write_entry(out, key, &merged);
            } else {
                write_entry(out, key, patch);
            }
            self.last_patch_key = key.clone();
            self.patch_index += 1;
        }
        if sfen != self.last_patch_key {
            write_entry(out, sfen, &entry);
        }
    }

    fn process_line(&mut self, bytes: Vec<u8>, out: &mut Vec<u8>) -> Result<(), String> {
        let mut line = decode_line(bytes);
        if self.line_no == 0 {
            if let Some(rest) = line.strip_prefix('\u{feff}') {
                line = rest.to_string();
            }
        }
        match parse_line(&line) {
            Line::Comment(c) => {
                if self.line_no == 0 && line != HEADER {
                    return Err(format!("Unsupported book header: {}", line));
                }
                if let Some((_, entry)) = &mut self.current {
                    append_line_to_entry(entry, Line::Comment(c));
                }
            }
            Line::Position(sfen, ply) => {
                if let Some((s, e)) = self.current.take() {
                    self.emit(&s, e, out);
                }
                self.current = Some((sfen, new_entry(ply)));
            }
            Line::Move(m) => {
                // 局面の行が無い指し手の行は無視する
                if let Some((_, entry)) = &mut self.current {
                    append_line_to_entry(entry, Line::Move(m));
                }
            }
        }
        self.line_no += 1;
        Ok(())
    }

    /// 続きを書き出す。この呼び出しで max_out バイト以上を書き出すか、最後まで書き出すと戻る。
    /// 最後まで書き出した場合は true を返す。
    pub fn write_next(
        &mut self,
        src: &mut dyn Source,
        max_out: usize,
        out: &mut Vec<u8>,
    ) -> Result<bool, String> {
        if self.done {
            return Ok(true);
        }
        let start = out.len();
        if !self.header_written {
            out.extend_from_slice(HEADER.as_bytes());
            out.push(LF);
            self.header_written = true;
        }
        while out.len() - start < max_out {
            match self.reader.next_line(src)? {
                Some(bytes) => self.process_line(bytes, out)?,
                None => {
                    if let Some((s, e)) = self.current.take() {
                        self.emit(&s, e, out);
                    }
                    while self.patch_index < self.patches.len() {
                        let (key, patch) = &self.patches[self.patch_index];
                        write_entry(out, key, patch);
                        self.patch_index += 1;
                    }
                    self.done = true;
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_int() {
        assert_eq!(parse_int("123"), 123.0);
        assert_eq!(parse_int("  -45abc"), -45.0);
        assert_eq!(parse_int("+7"), 7.0);
        assert!(parse_int("").is_nan());
        assert!(parse_int("none").is_nan());
        assert!(parse_int("-").is_nan());
        assert!(parse_int("-0").is_sign_negative());
        assert_eq!(parse_int("\u{3000}12"), 12.0);
        assert_eq!(parse_int("1e3"), 1.0);
    }

    #[test]
    fn test_to_fixed0() {
        assert_eq!(to_fixed0(12.0), "12");
        assert_eq!(to_fixed0(-12.0), "-12");
        assert_eq!(to_fixed0(2.5), "3");
        assert_eq!(to_fixed0(-2.5), "-3");
        assert_eq!(to_fixed0(-0.0), "0");
        assert_eq!(to_fixed0(-0.4), "-0");
        assert_eq!(to_fixed0(f64::NAN), "NaN");
        assert_eq!(to_fixed0(f64::INFINITY), "Infinity");
        assert_eq!(to_fixed0(1e21), "1e+21");
        assert_eq!(to_fixed0(1.5e22), "1.5e+22");
        assert_eq!(to_fixed0(1e20), "100000000000000000000");
    }

    #[test]
    fn test_fast_paths() {
        // write_fixed0 は to_fixed0 と同じ結果になる
        for x in [
            0.0, -0.0, 1.0, -1.0, 2.5, -2.5, -0.4, 0.5, 123456789.0, 9.1e18, 9.3e18, -9.3e18, 1e20,
            1e21, f64::NAN, f64::INFINITY, f64::NEG_INFINITY,
        ] {
            let mut out = Vec::new();
            write_fixed0(&mut out, x);
            assert_eq!(String::from_utf8(out).unwrap(), to_fixed0(x), "{}", x);
        }
        // 16 桁以上は f64 として解析する
        assert_eq!(parse_int("123456789012345"), 123456789012345.0);
        assert_eq!(parse_int("12345678901234567890"), 12345678901234567890.0);
        assert_eq!(parse_int("9007199254740993"), 9007199254740992.0);
    }

    #[test]
    fn test_js_cmp() {
        assert_eq!(js_cmp("a", "b"), Ordering::Less);
        assert_eq!(js_cmp("ab", "a"), Ordering::Greater);
        // UTF-16 では U+10000 (サロゲート) は U+FF00 より前になる
        assert_eq!(js_cmp("\u{10000}", "\u{FF00}"), Ordering::Less);
    }

    #[test]
    fn test_parse_line() {
        assert_eq!(parse_line("#abc"), Line::Comment("abc".into()));
        assert_eq!(parse_line("//abc"), Line::Comment("abc".into()));
        assert_eq!(parse_line("xyz"), Line::Comment("xyz".into()));
        assert_eq!(
            parse_line("sfen lnsgkgsnl/9/9/9/9/9/9/9/9 b - 23"),
            Line::Position("lnsgkgsnl/9/9/9/9/9/9/9/9 b - 1".into(), 23.0)
        );
        assert_eq!(
            parse_line("sfen 9/9/9/9/9/9/9/9/9 b -"),
            Line::Position("9/9/9/9/9/9/9/9/9 b - 1".into(), 0.0)
        );
        let Line::Move(m) = parse_line("7g7f 3c3d 10 20 30 #comment") else {
            panic!();
        };
        assert_eq!(m.usi, "7g7f");
        assert_eq!(m.usi2.as_deref(), Some("3c3d"));
        assert_eq!((m.score, m.depth, m.count), (Some(10.0), Some(20.0), Some(30.0)));
        assert_eq!(m.comment.as_deref(), Some("comment"));
        let Line::Move(m) = parse_line("P*5e none none none ") else {
            panic!();
        };
        assert_eq!((m.usi2, m.score, m.depth, m.count), (None, None, None, None));
        assert_eq!(m.comment.as_deref(), Some(""));
        // 列が足りない場合は NaN になる
        let Line::Move(m) = parse_line("2b8h+ none") else {
            panic!();
        };
        assert!(m.score.unwrap().is_nan() && m.depth.unwrap().is_nan());
        assert_eq!(m.count, None);
    }

    #[test]
    fn test_search_and_merge() {
        let data = b"#YANEURAOU-DB2016 1.00\r\nsfen A b - 1\r\n#pc\r\n7g7f none 1 2 3\r\n#mc\r\nsfen B b - 5\r\n2g2f none 4 5 6";
        let mut src: &[u8] = data;
        let size = data.len() as u64;
        assert!(validate_ordering(&mut src).unwrap());
        let a = search(&mut src, size, "A b - 1").unwrap().unwrap();
        assert_eq!(a.comment.as_deref(), Some("pc"));
        assert_eq!(a.moves[0].comment.as_deref(), Some("mc"));
        let b = search(&mut src, size, "B b - 1").unwrap().unwrap();
        assert_eq!(b.min_ply, Some(5.0));
        assert_eq!(b.moves[0].usi, "2g2f");
        assert!(search(&mut src, size, "C b - 1").unwrap().is_none());

        let mut patch = new_entry(0.0);
        patch.moves.push(BookMove {
            usi: "1g1f".into(),
            ..Default::default()
        });
        let mut merger = YaneMerger::new(vec![("AA b - 1".into(), patch)]);
        let mut out = Vec::new();
        while !merger.write_next(&mut src, 8, &mut out).unwrap() {}
        assert_eq!(
            String::from_utf8(out).unwrap(),
            "#YANEURAOU-DB2016 1.00\nsfen A b - 1\n#pc\n7g7f none 1 2 3\n#mc\nsfen AA b - 1\n1g1f none none none \nsfen B b - 1\n2g2f none 4 5 6\n"
        );
    }

    #[test]
    fn test_line_reader_crlf_across_chunks() {
        let mut data = vec![b'x'; LINE_READER_CHUNK - 1];
        data.extend_from_slice(b"\r\nabc\rdef\n\nghi");
        let mut src: &[u8] = &data;
        let mut reader = LineReader::new();
        let mut lines = Vec::new();
        while let Some(l) = reader.next_line(&mut src).unwrap() {
            lines.push(decode(&l));
        }
        assert_eq!(lines.len(), 5);
        assert_eq!(&lines[1..], ["abc", "def", "", "ghi"]);
    }
}
