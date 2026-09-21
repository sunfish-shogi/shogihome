// sync-engine-options: engine.json の options を、実際の wasm が申告する内容に合わせる。
//
// Usage:
//   npx tsx scripts/sync-engine-options.ts public/engines/<dir>/engine.json
//   npx tsx scripts/sync-engine-options.ts <engine.json> --check   # 書き換えずに差分だけ出す
//
// マニフェストの options は「エンジンが option で申告する定義の写し」であり
// (specs/wasm-engine-abi.md)、プリセットごとの違いは presets[].values が持つ。
// つまり options は手で調整する場所ではなく、エンジンの出力と一致していればよい。
// ビルドし直して既定値や範囲が変わったときに、この差を埋めるためのスクリプト。
//
// 書き換えるのは options の配列だけで、他の部分の整形には触れない。
import fs from "node:fs";
import path from "node:path";
import { EngineManifestOption, parseEngineManifest } from "@/renderer/wasm-engine/manifest.js";
import { USIEngineOption } from "@/common/settings/usi.js";
import { readEngineOptions } from "./lib/wasm-engine.js";

const out = (text: string) => process.stdout.write(`${text}\n`);
const err = (text: string) => process.stderr.write(`${text}\n`);

function usage(): never {
  err("Usage: sync-engine-options <engine.json> [--check]");
  process.exit(1);
}

// エンジンが申告した定義を、マニフェストに書く形に変換する。
// order (GUI での並び順) は配列の順序で表されるため持たない。
function toManifestOption(option: USIEngineOption): EngineManifestOption {
  const converted: EngineManifestOption = { name: option.name, type: option.type };
  if (option.type === "button") {
    return converted;
  }
  if (option.default !== undefined) {
    converted.default = option.default;
  }
  if (option.type === "spin") {
    if (option.min !== undefined) {
      converted.min = option.min;
    }
    if (option.max !== undefined) {
      converted.max = option.max;
    }
  }
  if (option.type === "combo") {
    converted.vars = option.vars;
  }
  return converted;
}

function show(value: unknown): string {
  return value === undefined ? "(無し)" : JSON.stringify(value);
}

// 書き換えの内容を人が読める形にする。何が変わるのか分からないまま
// 成果物の一部を書き換えてしまわないよう、必ず表示してから書き込む。
function describeChanges(before: EngineManifestOption[], after: EngineManifestOption[]): string[] {
  const changes: string[] = [];
  const beforeByName = new Map(before.map((option) => [option.name, option]));
  for (const option of after) {
    const old = beforeByName.get(option.name);
    if (!old) {
      changes.push(`+ ${option.name} (${option.type}) を追加`);
      continue;
    }
    for (const key of ["type", "default", "min", "max", "vars"] as const) {
      if (JSON.stringify(old[key]) !== JSON.stringify(option[key])) {
        changes.push(`  ${option.name}: ${key} ${show(old[key])} -> ${show(option[key])}`);
      }
    }
  }
  const afterNames = new Set(after.map((option) => option.name));
  for (const option of before) {
    if (!afterNames.has(option.name)) {
      changes.push(`- ${option.name} を削除 (エンジンが申告していない)`);
    }
  }
  // 並び順は GUI での表示順になる。値が同じでも揃えておく。
  if (
    changes.length === 0 &&
    before.map((o) => o.name).join(",") !== after.map((o) => o.name).join(",")
  ) {
    changes.push("  順序をエンジンの申告に合わせる");
  }
  return changes;
}

// プリセットの値が新しい定義と食い違っていないかを見る。
// options を詰めた結果プリセットが壊れていることに気付かないと、
// 起動してから setoption が弾かれる。
function checkPresets(manifest: unknown, options: EngineManifestOption[]): string[] {
  const warnings: string[] = [];
  const byName = new Map(options.map((option) => [option.name, option]));
  const presets = (manifest as { presets?: { id: string; values?: Record<string, unknown> }[] })
    .presets;
  for (const preset of presets || []) {
    for (const [name, value] of Object.entries(preset.values || {})) {
      const option = byName.get(name);
      // USI_Hash と USI_Ponder はエンジンが宣言していなくても補完される。
      if (!option) {
        if (name !== "USI_Hash" && name !== "USI_Ponder") {
          warnings.push(`${preset.id}: ${name} はエンジンが申告していない`);
        }
        continue;
      }
      if (option.type === "spin" && typeof value === "number") {
        if (
          (option.min !== undefined && value < option.min) ||
          (option.max !== undefined && value > option.max)
        ) {
          warnings.push(`${preset.id}: ${name}=${value} が範囲外 (${option.min}..${option.max})`);
        }
      }
      if (option.type === "combo" && !option.vars?.includes(String(value))) {
        warnings.push(`${preset.id}: ${name}=${String(value)} は選択肢に無い`);
      }
    }
  }
  return warnings;
}

// --- engine.json の書き換え ------------------------------------------------
//
// engine.json はエンジンのビルドが出力する成果物で、整形はそれぞれの流儀に従う。
// JSON.stringify で書き直すと関係の無い行まで動くため、options の配列の範囲だけを
// 差し替える。

const INDENT = "  ";
const PRINT_WIDTH = 100;

function inline(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length ? `[${value.map(inline).join(", ")}]` : "[]";
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.length
      ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")} }`
      : "{}";
  }
  return JSON.stringify(value);
}

// 1 要素 1 行の配列として書く。既存の engine.json の options と同じ形。
function renderOptions(options: EngineManifestOption[], indent: string): string {
  if (options.length === 0) {
    return "[]";
  }
  const itemIndent = indent + INDENT;
  const items = options.map((option) => {
    const line = inline(option);
    if (itemIndent.length + line.length <= PRINT_WIDTH) {
      return itemIndent + line;
    }
    // 1 行に収まらないものだけ展開する (選択肢の多い combo など)。
    const entries = Object.entries(option).filter(([, v]) => v !== undefined);
    const body = entries
      .map(([k, v]) => `${itemIndent}${INDENT}${JSON.stringify(k)}: ${inline(v)}`)
      .join(",\n");
    return `${itemIndent}{\n${body}\n${itemIndent}}`;
  });
  return `[\n${items.join(",\n")}\n${indent}]`;
}

// text の start 位置から始まる配列 / オブジェクトの終端 (閉じ括弧の次) を返す。
// 文字列の中の括弧を数えないよう、エスケープと引用符を追う。
function findValueEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === "[" || c === "{") {
      depth++;
    } else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  throw new Error("JSON の括弧が閉じていません");
}

// options の配列が書かれている範囲を探す。
// 入れ子に同名のキーがあっても取り違えないよう、中身が一致することまで確かめる。
function findOptionsSpan(
  text: string,
  current: EngineManifestOption[],
): { start: number; end: number; indent: string } | undefined {
  const matches: { start: number; end: number; indent: string }[] = [];
  const pattern = /(^|\n)([ \t]*)"options"[ \t]*:[ \t]*\[/g;
  for (let matched = pattern.exec(text); matched; matched = pattern.exec(text)) {
    const start = matched.index + matched[0].length - 1;
    const end = findValueEnd(text, start);
    if (JSON.stringify(JSON.parse(text.substring(start, end))) === JSON.stringify(current)) {
      matches.push({ start, end, indent: matched[2] });
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function replaceOptions(
  text: string,
  current: EngineManifestOption[],
  options: EngineManifestOption[],
): string {
  const span = findOptionsSpan(text, current);
  if (span) {
    const rendered = renderOptions(options, span.indent);
    return text.substring(0, span.start) + rendered + text.substring(span.end);
  }
  // options を持たないマニフェストには presets の手前に足す
  // (specs/wasm-engine-abi.md のフィールドの並びに合わせる)。
  const matched = /(^|\n)([ \t]*)"presets"[ \t]*:/.exec(text);
  if (!matched) {
    throw new Error("options を書き込む位置を特定できませんでした");
  }
  const indent = matched[2];
  const at = matched.index + matched[1].length;
  const rendered = renderOptions(options, indent);
  return `${text.substring(0, at)}${indent}"options": ${rendered},\n${text.substring(at)}`;
}

// --- 本体 ------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const targets = args.filter((arg) => !arg.startsWith("--"));
  if (targets.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--check")) {
    usage();
  }

  const file = path.resolve(targets[0]);
  if (!fs.existsSync(file)) {
    err(`ファイルがありません: ${file}`);
    process.exit(1);
  }
  const text = fs.readFileSync(file, "utf8");
  const raw = JSON.parse(text) as { options?: EngineManifestOption[] };
  // 壊れたマニフェストを書き換えて更に壊さないよう、先に検証する。
  parseEngineManifest(raw);
  const current = raw.options || [];

  const engineDir = path.dirname(file);
  out(`エンジンを起動しています: ${engineDir}`);
  const next = (await readEngineOptions(engineDir)).map(toManifestOption);
  out(`エンジンが申告したオプション: ${next.length} 件`);

  for (const warning of checkPresets(raw, next)) {
    err(`警告: ${warning}`);
  }

  const changes = describeChanges(current, next);
  if (changes.length === 0) {
    out("options はエンジンの申告と一致しています。");
    return;
  }
  out("次の差があります。");
  for (const change of changes) {
    out(`  ${change}`);
  }
  if (check) {
    err("--check が指定されたため書き換えていません。");
    process.exit(1);
  }
  fs.writeFileSync(file, replaceOptions(text, current, next));
  out(`更新しました: ${file}`);
}

main()
  .then(() => {
    // エンジンのスレッドがイベントループに残ることがあるため、明示的に終える。
    process.exit(0);
  })
  .catch((e: unknown) => {
    err(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
