import * as path from "node:path";
import * as fs from "node:fs/promises";
import { loadUSIEngines } from "@/background/settings.js";
import { getUSIEngineStatsMap } from "./usi.js";
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
    html += `<h2>${engine.name} (${uri})</h2>\n`;
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
  html += formatRow(
    "稼働時間",
    `${stats.totalUptimeMs / 1e3} 秒 (平均 ${stats.totalUptimeMs / stats.runCount / 1e3} 秒)`,
  );
  html += formatRow("ゲーム数", stats.gameCount);
  html += formatRow("平均準備時間 [秒]", stats.totalReadyTimeMs / stats.gameCount / 1e3);
  html += formatRow(
    "勝 / 負 / 引き分け",
    `${stats.winCount} / ${stats.loseCount} / ${stats.drawCount}`,
  );
  html += formatRow(
    "探索回数",
    `標準 ${stats.goCount} / Ponder ${stats.goPonderCount} / Infinite ${stats.goInfiniteCount} / Mate ${stats.goMateCount}`,
  );
  if (stats.goPonderCount > 0) {
    html += formatRow(
      "Ponder ヒット",
      `${stats.ponderHitCount} (${stats.goPonderCount > 0 ? (stats.ponderHitCount / stats.goPonderCount) * 100 : 0}%)`,
    );
  }
  if (stats.goCount + stats.goPonderCount + stats.goInfiniteCount > 0) {
    html += formatRow(
      "平均探索時間",
      `${stats.totalGoTimeMs / (stats.goCount + stats.goPonderCount + stats.goInfiniteCount) / 1e3} 秒`,
    );
  }
  if (stats.goMateCount > 0) {
    html += formatRow(
      "平均詰み探索時間",
      `${stats.goMateCount > 0 ? stats.totalMateTimeMs / stats.goMateCount / 1e3 : 0} 秒`,
    );
  }
  html += tableEnd;
  return html;
}
