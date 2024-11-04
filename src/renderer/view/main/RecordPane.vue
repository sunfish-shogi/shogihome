<template>
  <div ref="root" class="column record-pane">
    <div class="auto record">
      <RecordView
        :record="store.record"
        :operational="isRecordOperational"
        :show-book="showBook"
        :show-comment="showComment"
        :show-elapsed-time="showElapsedTime"
        :book-toggle-label="'定跡'"
        :elapsed-time-toggle-label="t.elapsedTime"
        :comment-toggle-label="t.commentsAndBookmarks"
        :opacity="appSettings.enableTransparent ? appSettings.recordOpacity : 1"
        :show-top-control="showTopControl"
        :show-bottom-control="showBottomControl"
        :show-branches="showBranches"
        @go-begin="store.changePly(0)"
        @go-back="store.goBack()"
        @go-forward="store.goForward()"
        @go-end="store.changePly(Number.MAX_SAFE_INTEGER)"
        @select-move="(ply) => store.changePly(ply)"
        @select-branch="(index) => store.changeBranch(index)"
        @swap-with-previous-branch="store.swapWithPreviousBranch()"
        @swap-with-next-branch="store.swapWithNextBranch()"
        @toggle-show-book="onToggleBook"
        @toggle-show-elapsed-time="onToggleElapsedTime"
        @toggle-show-comment="onToggleComment"
      >
        <template #book>
          <div class="full column">
            <BookView
              class="book-list"
              :position="store.record.position"
              :moves="bookMoves"
              :playable="store.isMovableByUser"
              :editable="bookEditable"
              @play="playBookMove"
              @edit="editBookMove"
              @remove="removeBookMove"
              @order="updateBookMoveOrder"
            />
            <div class="row control">
              <button @click="onResetBook">{{ t.clear }}</button>
              <button @click="onOpenBook">{{ t.open }}</button>
              <button :disabled="!isBookOperational" @click="onSaveBook">{{ t.saveAs }}</button>
              <button :disabled="!isBookOperational" @click="onAddBookMoves">指し手追加</button>
            </div>
          </div>
        </template>
      </RecordView>
    </div>
    <div v-if="store.remoteRecordFileURL">
      <button class="wide" @click="store.loadRemoteRecordFile()">{{ t.fetchLatestData }}</button>
    </div>
    <BookMoveDialog
      v-if="editingData"
      :move="editingData.move"
      :score="editingData.score"
      :depth="editingData.depth"
      :count="editingData.count"
      :comment="editingData.comment"
      @ok="onEditBookMove"
      @cancel="onCancelEditBookMove"
    />
  </div>
</template>

<script lang="ts">
export const minWidth = 200;
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import RecordView from "@/renderer/view/primitive/RecordView.vue";
import BookView from "@/renderer/view/primitive/BookView.vue";
import { useStore } from "@/renderer/store";
import { AppState } from "@/common/control/state.js";
import {
  installHotKeyForMainWindow,
  uninstallHotKeyForMainWindow,
} from "@/renderer/devices/hotkey";
import { useAppSettings } from "@/renderer/store/settings";
import { humanPlayer } from "@/renderer/players/human";
import { formatMove, Move } from "tsshogi";
import BookMoveDialog, { Result as EditResult } from "@/renderer/view/dialog/BookMoveDialog.vue";
import { useBookStore } from "@/renderer/store/book";
import { BookMove } from "@/common/book";
import { useConfirmationStore } from "@/renderer/store/confirm";

defineProps({
  showElapsedTime: {
    type: Boolean,
    required: false,
  },
  showComment: {
    type: Boolean,
    required: false,
  },
  showTopControl: {
    type: Boolean,
    required: false,
    default: true,
  },
  showBottomControl: {
    type: Boolean,
    required: false,
    default: true,
  },
  showBranches: {
    type: Boolean,
    required: false,
    default: true,
  },
});

const store = useStore();
const bookStore = useBookStore();
const appSettings = useAppSettings();
const root = ref();
const showBook = ref(false);
const bookMoves = computed(() => bookStore.moves);
const bookEditable = computed(() => bookStore.mode === "in-memory");
const editingData = ref<
  BookMove & {
    sfen: string;
    move: string;
  }
>();

onMounted(() => {
  installHotKeyForMainWindow(root.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForMainWindow(root.value);
});

const isRecordOperational = computed(() => store.appState === AppState.NORMAL);
const isBookOperational = computed(
  () => store.appState === AppState.NORMAL && bookStore.mode === "in-memory",
);

const onToggleBook = (enabled: boolean) => {
  showBook.value = enabled;
};

const onToggleElapsedTime = (enabled: boolean) => {
  appSettings.updateAppSettings({
    showElapsedTimeInRecordView: enabled,
  });
};

const onToggleComment = (enabled: boolean) => {
  appSettings.updateAppSettings({
    showCommentInRecordView: enabled,
  });
};

const onResetBook = () => {
  bookStore.reset();
};

const onOpenBook = () => {
  bookStore.openBookFile();
};

const onSaveBook = () => {
  bookStore.saveBookFile();
};

const onAddBookMoves = () => {
  store.showAddBookMovesDialog();
};

const playBookMove = (move: Move) => {
  if (store.appState === AppState.GAME || store.appState === AppState.CSA_GAME) {
    humanPlayer.doMove(move);
  } else {
    store.doMove(move);
  }
};

const editBookMove = (move: Move) => {
  const target = bookMoves.value.find((bm) => bm.usi === move.usi);
  if (!target) {
    return;
  }
  editingData.value = {
    sfen: store.record.position.sfen,
    move: formatMove(store.record.position, move),
    ...target,
  };
};

const removeBookMove = (move: Move) => {
  const sfen = store.record.position.sfen;
  const name = formatMove(store.record.position, move);
  useConfirmationStore().show({
    message: `定跡手 ${name} を削除します。よろしいですか。`, // TODO: i18n
    onOk: () => {
      bookStore.removeMove(sfen, move.usi);
    },
  });
};

const updateBookMoveOrder = (move: Move, order: number) => {
  bookStore.updateMoveOrder(store.record.position.sfen, move.usi, order);
};

const onEditBookMove = (data: EditResult) => {
  if (!editingData.value) {
    return;
  }
  bookStore.updateMove(editingData.value.sfen, {
    usi: editingData.value.usi,
    ...data,
  });
  editingData.value = undefined;
};

const onCancelEditBookMove = () => {
  editingData.value = undefined;
};
</script>

<style scoped>
.record-pane {
  box-sizing: border-box;
}
.record {
  width: 100%;
  min-height: 0;
}
.book-list {
  height: calc(100% - 27px);
  margin-bottom: 2px;
}
.control > button {
  height: 25px;
  font-size: 14px;
  padding: 0 1em;
  white-space: nowrap;
  overflow: hidden;
}
.control > button:not(:first-child) {
  margin-left: 2px;
}
button.wide {
  width: 100%;
}
</style>
