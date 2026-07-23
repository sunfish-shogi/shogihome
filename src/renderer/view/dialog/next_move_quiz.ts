import { computed, onMounted, ref, watch } from "vue";
import { Color, Move, Position, formatMove } from "tsshogi";
import { t } from "@/common/i18n";
import { EvaluationViewFrom } from "@/common/settings/app";
import { parseUSIPV } from "@/common/game/usi";
import { NextMoveCandidate } from "@/common/nextmove/collection";
import { useStore } from "@/renderer/store";
import { useAppSettings } from "@/renderer/store/settings";
import { useMessageStore } from "@/renderer/store/message";
import { useConfirmationStore } from "@/renderer/store/confirm";
import { useNextMoveQuizStore } from "@/renderer/store/nextmove";
import { isNative } from "@/renderer/ipc/api";

export type NextMoveQuizMoveRow = {
  text: string;
  scoreText: string;
  accepted: boolean;
  usi: string;
  pv?: string[];
  score?: number;
  mate?: number;
};

/**
 * 次の一手出題ダイアログの共通ロジック (デスクトップ版・モバイル版で共有)。
 * setup() 内で呼び出すこと。
 */
export function useNextMoveQuizController() {
  const store = useStore();
  const appSettings = useAppSettings();
  const quiz = useNextMoveQuizStore();
  const flip = ref(false);

  const position = computed(() => (quiz.position as Position) || new Position());
  const boardPosition = computed(() => (quiz.displayPosition as Position) || new Position());
  // 解答の手が指されていればその手を、出題局面では問題に至る直前の指し手を強調表示する。
  const lastMove = computed(() => (quiz.playedMove as Move) || (quiz.previousMove as Move) || null);

  // 解答側の手番が手前に来るように盤面を自動で反転する。
  const updateFlip = () => {
    flip.value = position.value.color === Color.WHITE;
  };

  onMounted(() => {
    updateFlip();
  });

  // 出題局面が変わったら (問題の移動・出題順の切り替え) 盤面の向きを再計算する。
  watch(
    () => quiz.position?.sfen,
    () => {
      updateFlip();
    },
  );

  const doFlip = () => {
    flip.value = !flip.value;
  };

  const onMove = (move: Move) => {
    const judgement = quiz.answer(move);
    switch (judgement) {
      case "best":
      case "accepted":
        useMessageStore().enqueue({ text: t.correct });
        break;
      case "actual":
        useConfirmationStore().show({
          message: `${t.incorrect} - ${t.thisMoveWasPlayedInTheGame} ${t.doYouWantToTryAgain}`,
          buttonType: "yesNo",
          onOk: () => quiz.retry(),
          onCancel: () => quiz.reveal(),
        });
        break;
      case "incorrect":
        useConfirmationStore().show({
          message: `${t.incorrect} - ${t.doYouWantToTryAgain}`,
          buttonType: "yesNo",
          onOk: () => quiz.retry(),
          onCancel: () => quiz.reveal(),
        });
        break;
    }
  };

  const formatScore = (entry: { score?: number; mate?: number }): string => {
    const sign =
      appSettings.evaluationViewFrom === EvaluationViewFrom.EACH &&
      position.value.color === Color.WHITE
        ? -1
        : 1;
    if (entry.mate !== undefined) {
      return `${t.mateShort}${entry.mate * sign}`;
    }
    if (entry.score !== undefined) {
      return `${entry.score * sign}`;
    }
    return "-";
  };

  const buildMoveRow = (entry: {
    usi: string;
    score?: number;
    mate?: number;
    accepted?: boolean;
    pv?: string[];
  }): NextMoveQuizMoveRow | undefined => {
    const move = position.value.createMoveByUSI(entry.usi);
    if (!move) {
      return;
    }
    return {
      text: formatMove(position.value, move),
      scoreText: formatScore(entry),
      accepted: entry.accepted || false,
      usi: entry.usi,
      pv: entry.pv,
      score: entry.score,
      mate: entry.mate,
    };
  };

  const candidateRows = computed(() => {
    const problem = quiz.problem;
    if (!problem) {
      return [];
    }
    return problem.candidates
      .map((candidate: NextMoveCandidate) => buildMoveRow(candidate))
      .filter((row): row is NextMoveQuizMoveRow => !!row);
  });

  const actualMoveRow = computed(() => {
    const problem = quiz.problem;
    return problem && buildMoveRow(problem.actualMove);
  });

  const sourceText = computed(() => {
    const source = quiz.problem?.source;
    if (!source) {
      return "";
    }
    const elements = [];
    if (source.path) {
      elements.push(source.path);
    }
    if (source.ply) {
      elements.push(`${source.ply}${t.plySuffix}`);
    }
    if (source.blackPlayer || source.whitePlayer) {
      elements.push(`${source.blackPlayer || "?"} - ${source.whitePlayer || "?"}`);
    }
    return elements.join(" / ");
  });

  const canOpenSourceRecord = computed(() => isNative() && !!quiz.problem?.source?.path);

  const openSourceRecord = () => {
    const source = quiz.problem?.source;
    if (!source?.path) {
      return;
    }
    const path = source.path;
    const ply = source.ply;
    // セッションは保持したままダイアログを閉じる。メニューの「問題集を開く」から再開できる。
    quiz.hide();
    store.openRecord(path, { ply });
  };

  const showPV = (row: NextMoveQuizMoveRow) => {
    const sign = position.value.color === Color.BLACK ? 1 : -1;
    store.showPVPreviewDialog({
      position: position.value,
      engineName: quiz.collection?.metadata?.engine?.name,
      score: row.score !== undefined ? row.score * sign : undefined,
      mate: row.mate !== undefined ? row.mate * sign : undefined,
      pv: parseUSIPV(position.value, row.pv?.length ? row.pv : [row.usi]),
      flip: flip.value,
    });
  };

  return {
    quiz,
    position,
    boardPosition,
    lastMove,
    flip,
    doFlip,
    onMove,
    candidateRows,
    actualMoveRow,
    sourceText,
    canOpenSourceRecord,
    openSourceRecord,
    showPV,
  };
}
