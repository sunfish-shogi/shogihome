import * as path from "node:path";
import * as fs from "node:fs/promises";
import { loadUSIEngines } from "@/background/settings.js";
import { getUSIEngineStatsMap } from "./persistence.js";
import { getAppPath } from "@/background/proc/path-electron.js";
import { openPath } from "@/background/helpers/electron.js";
import { t } from "@/common/i18n/translation_table.js";
import { USIEngineStatsEntry } from "./types.js";

export async function outputStatsHTML() {
  const html = await generateUSIEngineStatsHTML();
  const filePath = path.join(getAppPath("userData"), "stats.html");
  await fs.writeFile(filePath, html, "utf-8");
  await openPath(filePath);
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const tableBegin = "<table border='1'>\n";
const tableEnd = "</table>\n";
function formatRow(label: string, value: string | number): string {
  return `<tr><td>${label}</td><td>${value}</td></tr>\n`;
}

async function generateUSIEngineStatsHTML(): Promise<string> {
  let html = "<html>\n";
  html += "<head><title>ShogiHome Statistics</title></head>\n";
  html += "<body>\n";

  html += `<h1>${t.usiEngine}</h1>\n`;
  const usiEngines = await loadUSIEngines();
  const usiEngineStatsMap = await getUSIEngineStatsMap();
  const usiEngineStatsEntries = Object.entries(usiEngineStatsMap).sort((a, b) => {
    return b[1].latestDate.localeCompare(a[1].latestDate);
  });
  for (const [uri, stats] of usiEngineStatsEntries) {
    const engine = usiEngines.getEngine(uri);
    if (!engine) {
      continue;
    }
    html += `<h2>${escapeHTML(engine.name)} (${uri})</h2>\n`;
    html += tableBegin;
    html += formatRow("最初の起動日", stats.earliestDate);
    html += formatRow("最新の起動日", stats.latestDate);
    html += tableEnd;
    html += `<h3>全期間</h3>\n`;
    html += formatUSIEngineStatsAsHTMLTable(stats.allTime);
    if (stats.daily.length === 0) {
      continue;
    }
    for (const [date, daily] of stats.daily) {
      html += `<h3>${date}</h3>\n`;
      html += formatUSIEngineStatsAsHTMLTable(daily);
    }
  }

  html += "</body>\n";
  html += "</html>\n";
  return html;
}

function formatUSIEngineStatsAsHTMLTable(stats: USIEngineStatsEntry): string {
  let html = tableBegin;
  html += formatRow("起動回数", stats.runCount);
  if (stats.runCount > 0) {
    const mean = stats.totalUptimeMs / stats.runCount / 1e3;
    html += formatRow("稼働時間", `${stats.totalUptimeMs / 1e3} 秒 (平均 ${mean.toFixed(3)} 秒)`);
  }
  html += formatRow("ゲーム数", stats.gameCount);
  if (stats.gameCount > 0) {
    const mean = stats.totalReadyTimeMs / stats.gameCount / 1e3;
    html += formatRow("平均準備時間", `${mean.toFixed(3)} 秒`);
  }
  html += formatRow(
    "勝 - 引き分け - 負",
    `${stats.winCount} - ${stats.drawCount} - ${stats.loseCount}`,
  );
  html += formatRow(
    "探索回数",
    `標準 ${stats.goCount} / Ponder ${stats.goPonderCount} / Infinite ${stats.goInfiniteCount} / Mate ${stats.goMateCount}`,
  );
  if (stats.goPonderCount > 0) {
    const percentage = (stats.ponderHitCount / stats.goPonderCount) * 100;
    html += formatRow("Ponder ヒット", `${stats.ponderHitCount} (${percentage.toFixed(2)}%)`);
  }
  if (stats.goCount + stats.goPonderCount + stats.goInfiniteCount > 0) {
    const mean =
      stats.totalGoTimeMs / (stats.goCount + stats.goPonderCount + stats.goInfiniteCount) / 1e3;
    html += formatRow("平均探索時間", `${mean.toFixed(2)} 秒`);
  }
  if (stats.goMateCount > 0) {
    const mean = stats.totalMateTimeMs / stats.goMateCount / 1e3;
    html += formatRow("平均詰み探索時間", `${mean.toFixed(2)} 秒`);
  }
  if (stats.totalNodeCount > 0) {
    const mean =
      stats.totalNodeCount /
      (stats.goCount + stats.goPonderCount + stats.goInfiniteCount + stats.goMateCount);
    html += formatRow("平均ノード数", `${mean.toFixed(0)}`);
  }
  if (stats.npsSampleCount > 0) {
    html += formatRow(
      "平均 NPS",
      `${stats.meanNPS.toFixed(0)} (最大 ${stats.maxNPS} / ${stats.npsSampleCount} サンプル)`,
    );
  }
  if (stats.maxDepth > 0) {
    html += formatRow(
      "最大深さ",
      `${stats.maxDepth} (${(stats.maxDepthTimeMs / 1e3).toFixed(2)} 秒 / 延長時 ${stats.maxSelDepth})`,
    );
  }
  if (stats.depth20Count > 0) {
    const mean = stats.depth20TotalTimeMs / stats.depth20Count / 1e3;
    html += formatRow("深さ 20 到達", `${stats.depth20Count} 回 / 平均 ${mean.toFixed(2)} 秒`);
  }
  if (stats.depth30Count > 0) {
    const mean = stats.depth30TotalTimeMs / stats.depth30Count / 1e3;
    html += formatRow("深さ 30 到達", `${stats.depth30Count} 回 / 平均 ${mean.toFixed(2)} 秒`);
  }
  if (stats.depth40Count > 0) {
    const mean = stats.depth40TotalTimeMs / stats.depth40Count / 1e3;
    html += formatRow("深さ 40 到達", `${stats.depth40Count} 回 / 平均 ${mean.toFixed(2)} 秒`);
  }
  if (stats.depth50Count > 0) {
    const mean = stats.depth50TotalTimeMs / stats.depth50Count / 1e3;
    html += formatRow("深さ 50 到達", `${stats.depth50Count} 回 / 平均 ${mean.toFixed(2)} 秒`);
  }
  if (stats.hashUsageSampleCount > 0) {
    html += formatRow(
      "平均ハッシュ使用率",
      `${stats.meanHashUsagePercent.toFixed(2)}% (最大 ${stats.maxHashUsagePercent.toFixed(2)}%)`,
    );
    html += formatRow("ハッシュ使用率 50%以上", `${stats.hashUsageOver50PercentCount} 回`);
    html += formatRow("ハッシュ使用率 70%以上", `${stats.hashUsageOver70PercentCount} 回`);
    html += formatRow("ハッシュ使用率 90%以上", `${stats.hashUsageOver90PercentCount} 回`);
  }
  html += tableEnd;
  return html;
}
