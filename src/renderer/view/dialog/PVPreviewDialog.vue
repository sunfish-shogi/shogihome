<template>
  <DialogFrame @cancel="onClose">
    <BoardView
      class="board-view"
      :board-image-type="appSettings.boardImage"
      :custom-board-image-url="appSettings.boardImageFileURL"
      :board-grid-color="appSettings.boardGridColor || undefined"
      :piece-stand-image-type="appSettings.pieceStandImage"
      :custom-piece-stand-image-url="appSettings.pieceStandImageFileURL"
      :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
      :king-piece-type="appSettings.kingPieceType"
      :board-label-type="appSettings.boardLabelType"
      :max-size="maxSize"
      :position="record.position"
      :last-move="lastMove"
      :flip="flip"
      :black-player-name="t.sente"
      :white-player-name="t.gote"
      :allow-move="true"
      @move="onMove"
    >
      <template #right-control>
        <div class="full column">
          <div class="row control-row">
            <button class="control-item" data-hotkey="Mod+t" @click="doFlip">
              <Icon :icon="IconType.FLIP" />
            </button>
            <button class="control-item" autofocus data-hotkey="Escape" @click="onClose">
              <Icon :icon="IconType.CLOSE" />
            </button>
          </div>
          <div class="row control-row">
            <button class="control-item" :data-hotkey="shortcutKeys.Begin" @click="goBegin">
              <Icon :icon="IconType.FIRST" />
            </button>
            <button class="control-item" :data-hotkey="shortcutKeys.End" @click="goEnd">
              <Icon :icon="IconType.LAST" />
            </button>
          </div>
          <div class="row control-row">
            <button class="control-item" :data-hotkey="shortcutKeys.Back" @click="goBack">
              <Icon :icon="IconType.BACK" />
            </button>
            <button class="control-item" :data-hotkey="shortcutKeys.Forward" @click="goForward">
              <Icon :icon="IconType.NEXT" />
            </button>
          </div>
        </div>
      </template>
      <template #left-control>
        <div class="full column reverse">
          <button class="control-item-wide" :disabled="!enableInsertion" @click="insertToRecord">
            <Icon :icon="IconType.TREE" />
            <span>{{ t.insertToRecord }}</span>
          </button>
          <button class="control-item-wide" :disabled="!enableInsertion" @click="insertToComment">
            <Icon :icon="IconType.NOTE" />
            <span>{{ t.insertToComment }}</span>
          </button>
        </div>
      </template>
    </BoardView>
    <div class="informations" v-if="showAnswer">
      <div class="informations">
        <div class="information">
          {{ info }}
        </div>
        <div class="information" v-if="score">
          評価値: {{ score }}
        </div>
        <div class="information">
            <span v-for="(move, index) in displayPV" :key="index">
              <span class="move-element" :class="{ selected: move.selected }">
                &nbsp;{{ move.text }}&nbsp;
              </span>
            </span>
        </div>
      </div>
    </div>
    <div class="options">
      <label>
        <input type="checkbox" v-model="showAnswer" />
          読み筋を表示
      </label>
    </div>
    <div class="bookmarks">
    <div class="bookmark-controls">
      <button @click="goNextBookmark">
      次のブックマークへ 
      </button>
    </div>
</div>

  </DialogFrame>
</template>

<script setup lang="ts">

// @LoveKapibarasan
//onMove, allowMove, buttons
const showAnswer = ref(false);
const successCounter = ref(0);
//=====


import { Color, ImmutablePosition, Move, Record } from "tsshogi";
import { onMounted, PropType, ref, reactive, watch, onBeforeUnmount, computed } from "vue";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { RectSize } from "@/common/assets/geometry.js";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import { EvaluationViewFrom, getPieceImageURLTemplate } from "@/common/settings/app";
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { SearchInfoSenderType } from "@/renderer/store/record";
import { CommentBehavior } from "@/common/settings/comment";
import { AppState } from "@/common/control/state";
import { useMessageStore } from "@/renderer/store/message";
import DialogFrame from "./DialogFrame.vue";
import { getRecordShortcutKeys } from "@/renderer/view/primitive/board/shortcut";

const props = defineProps({
  position: {
    type: Object as PropType<ImmutablePosition>,
    required: true,
  },
  name: {
    type: String,
    required: false,
    default: undefined,
  },
  multiPv: {
    type: Number,
    required: false,
    default: undefined,
  },
  depth: {
    type: Number,
    required: false,
    default: undefined,
  },
  selectiveDepth: {
    type: Number,
    required: false,
    default: undefined,
  },
  score: {
    type: Number,
    required: false,
    default: undefined,
  },
  mate: {
    type: Number,
    required: false,
    default: undefined,
  },
  lowerBound: {
    type: Boolean,
    required: false,
    default: false,
  },
  upperBound: {
    type: Boolean,
    required: false,
    default: false,
  },
  pv: {
    type: Array as PropType<Move[]>,
    required: true,
  },
});

const emit = defineEmits<{
  close: [];
}>();

const store = useStore();
const messageStore = useMessageStore();
const appSettings = useAppSettings();
const maxSize = reactive(new RectSize(0, 0));
//@LoveKapibarasan
const record = reactive(new Record()) as unknown as Record;
//=====
const flip = ref(appSettings.boardFlipping);

const updateSize = () => {
  maxSize.width = window.innerWidth * 0.8;
  maxSize.height = window.innerHeight * 0.8 - 80;
};

const updateRecord = () => {
  record.clear(props.position);
  for (const move of props.pv) {
    record.append(move, { ignoreValidation: true });
  }
  //@LoveKapibarasan
  record.goto(0);
  //=====
};

onMounted(() => {
  updateSize();
  updateRecord();
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSize);
});

watch([() => props.position, () => props.pv], () => {
  updateRecord();
});

const onClose = () => {
  emit("close");
};

const goBegin = () => {
  record.goto(0);
};

const goEnd = () => {
  record.goto(Number.MAX_SAFE_INTEGER);
};

const goBack = () => {
  record.goBack();
};

const goForward = () => {
  record.goForward();
};

const doFlip = () => {
  flip.value = !flip.value;
};

const getDisplayScore = (score: number, color: Color, evaluationViewFrom: EvaluationViewFrom) => {
  return evaluationViewFrom === EvaluationViewFrom.EACH || color == Color.BLACK ? score : -score;
};

const info = computed(() => {
  const elements = [];
  if (props.name) {
    elements.push(`${props.name}`);
  }
  if (props.depth !== undefined) {
    elements.push(`深さ=${props.depth}`);
  }
  if (props.selectiveDepth !== undefined) {
    elements.push(`選択的深さ=${props.selectiveDepth}`);
  }
  if (props.score !== undefined) {
    elements.push(
      `評価値=${getDisplayScore(props.score, props.position.color, appSettings.evaluationViewFrom)}`,
    );
    if (props.lowerBound) {
      elements.push("（下界値）");
    }
    if (props.upperBound) {
      elements.push("（上界値）");
    }
  }
  if (props.mate !== undefined) {
    elements.push(
      `詰み手数=${getDisplayScore(
        props.mate,
        props.position.color,
        appSettings.evaluationViewFrom,
      )}`,
    );
  }
  if (props.multiPv) {
    elements.push(`順位=${props.multiPv}`);
  }
  return elements.join(" / ");
});

const lastMove = computed(() => (record.current.move instanceof Move ? record.current.move : null));

const displayPV = computed(() => {
  return record.moves.slice(1).map((move) => {
    return {
      text: move.displayText,
      selected: move.ply === record.current.ply,
    };
  });
});

const enableInsertion = computed(() => {
  return store.appState === AppState.NORMAL && store.record.position.sfen === props.position.sfen;
});

const shortcutKeys = computed(() => getRecordShortcutKeys(appSettings.recordShortcutKeys));

const insertToRecord = () => {
  const n = store.appendMovesSilently(props.pv, {
    ignoreValidation: true,
  });
  messageStore.enqueue({
    text: t.insertedNMovesToRecord(n),
  });
};

const insertToComment = () => {
  store.appendSearchComment(
    SearchInfoSenderType.RESEARCHER,
    {
      depth: props.depth,
      score: props.score && props.score * (props.position.color == Color.BLACK ? 1 : -1),
      mate: props.mate,
      pv: props.pv,
    },
    CommentBehavior.APPEND,
    { engineName: props.name },
  );
  messageStore.enqueue({
    text: t.insertedComment,
  });
};
//@LoveKapibarasan

const onMove = async (move: Move) => {
  const expectedMove =
  record.moves[record.current.ply]?.move instanceof Move
      ? (record.moves[record.current.ply].move as Move)
      : null;

  if (!expectedMove) return;
  successCounter.value = await store.doQuizMove(
    move,
    expectedMove,
    successCounter.value,
    record
  );
};
const goNextBookmark = () => {
  const bookmarks = store.record.bookmarks;
  if (!bookmarks.length) return;

  const current = store.record.current.bookmark;
  const idx = bookmarks.indexOf(current);
  const next = bookmarks[idx + 1] ?? bookmarks[0];

  if (next) {
    store.jumpToBookmark(next);
    updateRecord();
  }
};
//=====
</script>
<style scoped>
.board-view {
  margin-left: auto;
  margin-right: auto;
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
.control-row:not(:last-child) {
  margin-bottom: 2%;
}
.control-item:not(:last-child) {
  margin-right: 2%;
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
.control-item-wide .icon {
  height: 68%;
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
.move-element.selected {
  background-color: var(--text-bg-color-selected);
}
</style>
