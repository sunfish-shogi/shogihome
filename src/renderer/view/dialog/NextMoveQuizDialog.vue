<template>
  <DialogFrame ref="dialogFrame" @cancel="onClose">
    <div class="header">
      <span class="header-item">{{ t.problemNofM(quiz.problemNumber, quiz.problemCount) }}</span>
      <HorizontalSelector
        class="header-item"
        :value="quiz.shuffled ? 'shuffle' : 'sequential'"
        :items="[
          { value: 'sequential', label: t.inOrder },
          { value: 'shuffle', label: t.shuffle },
        ]"
        @update:value="(value: string) => quiz.setShuffled(value === 'shuffle')"
      />
      <span class="header-item">
        {{ t.correct }}: {{ quiz.correctCount }} / {{ quiz.answeredCount }}
        <span v-if="quiz.answeredCount">
          ({{ t.correctRate }}: {{ Math.round((quiz.correctCount / quiz.answeredCount) * 100) }}%)
        </span>
      </span>
    </div>
    <div class="board-view">
      <div class="board-frame" @mousedown.stop>
        <BoardView
          :board-image-type="appSettings.boardImage"
          :custom-board-image-url="
            appSettings.boardImageFileURL && fileURLToCustomSchemeURL(appSettings.boardImageFileURL)
          "
          :board-grid-color="appSettings.boardGridColor || undefined"
          :piece-stand-image-type="appSettings.pieceStandImage"
          :custom-piece-stand-image-url="
            appSettings.pieceStandImageFileURL &&
            fileURLToCustomSchemeURL(appSettings.pieceStandImageFileURL)
          "
          :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
          :king-piece-type="appSettings.kingPieceType"
          :board-label-type="appSettings.boardLabelType"
          :max-size="maxSize"
          :position="boardPosition"
          :last-move="lastMove"
          :flip="flip"
          :allow-move="!quiz.done && !quiz.playedMove"
          :ghost-teleport-target="ghostTeleportTarget"
          :black-player-name="t.sente"
          :white-player-name="t.gote"
          @move="onMove"
        >
          <template #right-control>
            <div class="full column">
              <div class="row control-row">
                <button class="control-item" data-hotkey="Mod+t" @click="doFlip">
                  <Icon :icon="IconType.FLIP" />
                </button>
                <button class="control-item" data-hotkey="Escape" @click="onClose">
                  <Icon :icon="IconType.CLOSE" />
                </button>
              </div>
            </div>
          </template>
          <template #left-control>
            <div class="full column reverse">
              <button class="control-item-wide" :disabled="!quiz.hasNext" @click="quiz.goNext()">
                {{ t.nextProblem }}
              </button>
              <button
                class="control-item-wide"
                :disabled="!quiz.hasPrevious"
                @click="quiz.goPrevious()"
              >
                {{ t.previousProblem }}
              </button>
              <button v-if="!quiz.done" class="control-item-wide" @click="quiz.reveal()">
                {{ t.showAnswer }}
              </button>
            </div>
          </template>
        </BoardView>
      </div>
    </div>
    <div class="informations">
      <div v-if="!quiz.done" class="information">
        <span class="question">{{ t.findTheNextMove }}</span>
      </div>
      <template v-else>
        <div class="information candidates-list">
          <button
            v-for="(row, index) in candidateRows"
            :key="index"
            class="candidate-button"
            @click="showPV(row)"
          >
            {{ index + 1 }}. {{ row.text }} ({{ row.scoreText }}){{ row.accepted ? " ○" : "" }}
          </button>
        </div>
        <div v-if="actualMoveRow" class="information">
          {{ t.actualGameMove }}: {{ actualMoveRow.text }} ({{ actualMoveRow.scoreText }})
        </div>
        <div v-if="sourceText" class="information">
          {{ t.sourceRecord }}: {{ sourceText }}
          <button v-if="canOpenSourceRecord" class="thin" @click="openSourceRecord()">
            {{ t.openRecord }}
          </button>
        </div>
      </template>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Color, Move, Position, formatMove } from "tsshogi";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry.js";
import { EvaluationViewFrom, getPieceImageURLTemplate } from "@/common/settings/app";
import { fileURLToCustomSchemeURL } from "@/common/url";
import { parseUSIPV } from "@/common/game/usi";
import { NextMoveCandidate } from "@/common/nextmove/collection";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useStore } from "@/renderer/store";
import { useAppSettings } from "@/renderer/store/settings";
import { useMessageStore } from "@/renderer/store/message";
import { useConfirmationStore } from "@/renderer/store/confirm";
import { useNextMoveQuizStore } from "@/renderer/store/nextmove";
import { isNative } from "@/renderer/ipc/api";
import DialogFrame from "./DialogFrame.vue";

const emit = defineEmits<{
  close: [];
}>();

const store = useStore();
const appSettings = useAppSettings();
const quiz = useNextMoveQuizStore();
const dialogFrame = ref<InstanceType<typeof DialogFrame>>();
const maxSize = reactive(new RectSize(0, 0));
const flip = ref(false);

const position = computed(() => (quiz.position as Position) || new Position());
const boardPosition = computed(() => (quiz.displayPosition as Position) || new Position());
// 解答の手が指されていればその手を、出題局面では問題に至る直前の指し手を強調表示する。
const lastMove = computed(() => (quiz.playedMove as Move) || (quiz.previousMove as Move) || null);
// ドラッグ中の駒ゴーストをダイアログ (トップレイヤー) 内に描画し、
// ダイアログより手前に表示されるようにする。
const ghostTeleportTarget = computed(() => dialogFrame.value?.dialog ?? "body");

const updateSize = () => {
  maxSize.width = window.innerWidth * 0.8;
  maxSize.height = window.innerHeight * 0.8 - 80;
};

// 解答側の手番が手前に来るように盤面を自動で反転する。
const updateFlip = () => {
  flip.value = position.value.color === Color.WHITE;
};

onMounted(() => {
  updateSize();
  window.addEventListener("resize", updateSize);
  updateFlip();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSize);
});

// 出題局面が変わったら (問題の移動・出題順の切り替え) 盤面の向きを再計算する。
watch(
  () => quiz.position?.sfen,
  () => {
    updateFlip();
  },
);

const onClose = () => {
  emit("close");
};

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

type MoveRow = {
  text: string;
  scoreText: string;
  accepted: boolean;
  usi: string;
  pv?: string[];
  score?: number;
  mate?: number;
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
}): MoveRow | undefined => {
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
    .filter((row): row is MoveRow => !!row);
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

const showPV = (row: MoveRow) => {
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
</script>

<style scoped>
.header {
  margin-bottom: 5px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}
.header-item {
  margin: 0 10px;
}
.board-view {
  display: flex;
  justify-content: center;
}
/* ドラッグ無効化 (mousedown.stop) を盤の領域に限定し、
   盤の左右の余白ではダイアログをドラッグできるようにする。 */
.board-frame {
  width: fit-content;
}
.control-row {
  width: 100%;
  height: 25%;
  margin: 0px;
}
.control-item {
  width: 50%;
  height: 100%;
  margin: 0px;
  font-size: 100%;
  padding: 0 5% 0 5%;
}
.control-item .icon {
  height: 80%;
  width: auto;
}
.control-item-wide {
  width: 100%;
  height: 19%;
  margin: 0px;
  font-size: 90%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  line-height: 200%;
  padding: 0 5% 0 5%;
}
.control-item-wide:not(:last-child) {
  margin-top: 1%;
}
.informations {
  height: 120px;
  width: 80vw;
  overflow-y: scroll;
  margin-left: auto;
  margin-right: auto;
  margin-top: 5px;
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
.information {
  font-size: 14px;
  margin: 2px;
  text-align: left;
}
.question {
  font-weight: bold;
  margin-right: 10px;
}
.move-element {
  margin-right: 5px;
}
.candidates-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.candidate-button {
  white-space: nowrap;
  margin: 0;
  padding: 2px 8px;
}
</style>
