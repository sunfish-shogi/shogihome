import { exportBOD, formatPV, ImmutableRecord } from "tsshogi";
import { parseUSIPV, SCORE_MATE_INFINITE } from "@/common/game/usi.js";
import { t } from "@/common/i18n/index.js";
import type { USIInfo, USIPlayerMonitor } from "@/renderer/store/usi.js";

function formatScore(info: USIInfo): string {
  const bound = info.lowerBound ? ">= " : info.upperBound ? "<= " : "";
  if (info.scoreMate !== undefined) {
    const mate =
      Math.abs(info.scoreMate) >= SCORE_MATE_INFINITE
        ? info.scoreMate > 0
          ? "+"
          : "-"
        : info.scoreMate;
    return `mate ${bound}${mate}`;
  }
  return info.score !== undefined ? `cp ${bound}${info.score}` : t.unknown;
}

// Read all data synchronously so the board and PVs belong to the same snapshot.
export function formatAnalysisClipboard(
  record: ImmutableRecord,
  monitors: readonly Pick<USIPlayerMonitor, "name" | "latestInfo" | "ponderMove">[],
  prompt: string,
): string | undefined {
  const position = record.position;
  const engines: string[] = [];
  for (const monitor of monitors) {
    if (monitor.ponderMove) {
      continue;
    }
    const candidates: string[] = [];
    for (const info of monitor.latestInfo) {
      if (info.position !== position.sfen || !info.pv?.length) {
        continue;
      }
      const pv = parseUSIPV(position, info.pv);
      if (!pv.length) {
        continue;
      }
      const details = [`MultiPV: ${info.multiPV || 1}`, `${t.score}: ${formatScore(info)}`];
      if (info.depth !== undefined) {
        details.push(`${t.depth}: ${info.depth}`);
      }
      if (info.selectiveDepth !== undefined) {
        details.push(`seldepth: ${info.selectiveDepth}`);
      }
      if (info.nodes !== undefined) {
        details.push(`${t.nodes}: ${info.nodes}`);
      }
      const suffix = pv.length < info.pv.length ? ` (${t.analysisCopyTruncatedPV})` : "";
      candidates.push(`${details.join(" | ")}\n${t.pv}: ${formatPV(position, pv)}${suffix}`);
    }
    if (candidates.length) {
      engines.push(`### ${t.engineName}: ${monitor.name}\n${candidates.join("\n\n")}`);
    }
  }
  if (!engines.length) {
    return;
  }
  return [
    ...(prompt.trim() ? [prompt.trim()] : []),
    `## BOD\n${exportBOD(record).trimEnd()}`,
    `## ${t.pv}\n${t.analysisCopyScoreNote}`,
    ...engines,
  ].join("\n\n");
}
