<template>
  <div>
    <div class="full column">
      <BookView
        class="book-list"
        :position="store.record.position"
        :moves="bookStore.moves"
        :playable="store.isMovableByUser"
        :format="bookStore.format"
        @play="playBookMove"
        @edit="editBookMove"
        @remove="removeBookMove"
        @order="updateBookMoveOrder"
      />
      <div v-if="showPositionInfo && !isCommentEditing" class="row position-info">
        <span v-if="statsLabel" class="position-stats">{{ statsLabel }}</span>
        <span v-if="positionComment" class="position-comment">{{ positionComment }}</span>
        <span v-else class="position-comment empty">{{ t.noComment }}</span>
        <button v-if="isCommentEditable" class="comment-edit-button" @click="startEditComment">
          <Icon :icon="IconType.EDIT" />
        </button>
      </div>
      <div v-if="isCommentEditing" class="row position-comment-editor">
        <textarea v-model="commentDraft" class="comment-edit-area" />
        <div class="column">
          <button @click="savePositionComment">{{ t.ok }}</button>
          <button @click="cancelEditComment">{{ t.cancel }}</button>
        </div>
      </div>
      <div class="row control">
        <button @click="onShowBookProperties">
          <Icon :icon="IconType.INFO" />
          {{ formatLabel }}
        </button>
        <button @click="onResetBook">{{ t.clear }}</button>
        <button @click="onOpenBook">{{ t.open }}</button>
        <button :disabled="!isBookOperational" @click="onSaveBook">{{ t.saveAs }}</button>
        <button :disabled="!isBookOperational" @click="onAddBookMoves">{{ t.addMoves }}</button>
        <ToggleButton
          :value="appSettings.flippedBook"
          :label="t.flippedBook"
          @update:value="onUpdateFlippedBook"
        />
      </div>
      <BookMoveDialog
        v-if="editingData"
        :move="editingData.move"
        :score="editingData.score"
        :depth="editingData.depth"
        :count="editingData.count"
        :comment="editingData.comment"
        :sbk-eval="editingData.sbkEval"
        :format="bookStore.format"
        @ok="onEditBookMove"
        @cancel="onCancelEditBookMove"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { BookMove } from "@/common/book";
import { AppState } from "@/common/control/state";
import { useStore } from "@/renderer/store";
import { useBookStore } from "@/renderer/store/book";
import { computed, ref, watch } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import BookMoveDialog, { Result as EditResult } from "@/renderer/view/dialog/BookMoveDialog.vue";
import { formatMove, Move } from "tsshogi";
import { humanPlayer } from "@/renderer/players/human";
import { t } from "@/common/i18n";
import { useConfirmationStore } from "@/renderer/store/confirm";
import BookView from "@/renderer/view/primitive/BookView.vue";
import { useErrorStore } from "@/renderer/store/error";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { useAppSettings } from "@/renderer/store/settings";

const store = useStore();
const bookStore = useBookStore();
const appSettings = useAppSettings();

const isBookOperational = computed(() => store.appState === AppState.NORMAL);

const formatLabel = computed(() => {
  switch (bookStore.format) {
    case "yane2016":
      return ".db";
    case "ybb":
      return ".ybb";
    case "apery":
      return ".bin";
    case "sbk":
      return ".sbk";
    default:
      return bookStore.format;
  }
});
const editingData = ref<
  BookMove & {
    sfen: string;
    move: string;
  }
>();

const positionComment = computed(() => bookStore.positionProperties.comment || "");
const isCommentSupported = computed(
  () => bookStore.format === "yane2016" || bookStore.format === "sbk",
);
const isCommentEditable = computed(
  () =>
    isCommentSupported.value &&
    isBookOperational.value &&
    (bookStore.moves.length > 0 || !!positionComment.value),
);
const statsLabel = computed(() => {
  const props = bookStore.positionProperties;
  if (props.games === undefined && props.wonBlack === undefined && props.wonWhite === undefined) {
    return "";
  }
  return (
    `${t.gameCount}: ${props.games ?? 0} / ` +
    `${t.blackWin}: ${props.wonBlack ?? 0} / ` +
    `${t.whiteWin}: ${props.wonWhite ?? 0}`
  );
});
const showPositionInfo = computed(
  () => !!statsLabel.value || !!positionComment.value || isCommentEditable.value,
);

const isCommentEditing = ref(false);
const commentDraft = ref("");

watch(
  () => store.record.position.sfen,
  () => {
    isCommentEditing.value = false;
  },
);

const startEditComment = () => {
  commentDraft.value = positionComment.value;
  isCommentEditing.value = true;
};

const cancelEditComment = () => {
  isCommentEditing.value = false;
};

const savePositionComment = async () => {
  try {
    await bookStore.updatePositionComment(commentDraft.value);
    isCommentEditing.value = false;
  } catch (e) {
    useErrorStore().add(e);
  }
};

const onResetBook = () => {
  store.showResetBookDialog();
};

const onShowBookProperties = () => {
  store.showBookPropertiesDialog();
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

const onUpdateFlippedBook = (value: boolean) => {
  appSettings.updateAppSettings({ flippedBook: value }).then(() => {
    bookStore.reloadBookMoves();
  });
};

const playBookMove = (move: Move) => {
  if (store.appState === AppState.GAME || store.appState === AppState.CSA_GAME) {
    humanPlayer.doMove(move);
  } else {
    store.doMove(move);
  }
};

const editBookMove = (move: Move) => {
  const target = bookStore.moves.find((bm) => bm.usi === move.usi);
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
    message: t.doYouReallyWantToRemoveBookMove(name),
    onOk: () => {
      bookStore.removeMove(sfen, move.usi);
    },
  });
};

const updateBookMoveOrder = (move: Move, order: number) => {
  bookStore.updateMoveOrder(store.record.position.sfen, move.usi, order);
};

const onEditBookMove = async (data: EditResult) => {
  if (!editingData.value) {
    return;
  }
  try {
    await bookStore.updateMove(editingData.value.sfen, {
      usi: editingData.value.usi,
      usi2: editingData.value.usi2,
      sbkId: editingData.value.sbkId,
      ...data,
    });
    editingData.value = undefined;
  } catch (e) {
    useErrorStore().add(e);
  }
};

const onCancelEditBookMove = () => {
  editingData.value = undefined;
};
</script>

<style scoped>
.control > button {
  height: 25px;
  font-size: 14px;
  padding: 0 0.5em;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
}
.control > button:not(:first-child) {
  margin-left: 2px;
}
.control > :not(:first-child) {
  margin-left: 8px;
}
.control .icon {
  height: 1.2em;
  vertical-align: middle;
}
.format-label {
  display: inline-block;
  color: var(--control-button-color);
  background-color: var(--control-button-bg-color);
  padding: 0 5px;
  box-sizing: border-box;
  border: 1px solid var(--control-button-border-color);
  border-radius: 5px;
  font-size: 14px;
  white-space: nowrap;
  line-height: 23px;
}
.book-list {
  flex: 1;
  min-height: 0;
  margin-bottom: 2px;
}
.position-info {
  font-size: 12px;
  align-items: center;
  text-align: left;
  margin-bottom: 2px;
}
.position-stats {
  white-space: nowrap;
  margin-right: 8px;
}
.position-comment {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.position-comment.empty {
  font-style: italic;
}
.comment-edit-button {
  padding: 0 4px;
}
.comment-edit-button > .icon {
  height: 1.2em;
  vertical-align: middle;
}
.position-comment-editor {
  margin-bottom: 2px;
}
.position-comment-editor > textarea {
  flex: 1;
  height: 48px;
  resize: vertical;
}
.position-comment-editor button {
  font-size: 0.7em;
  height: 24px;
}
</style>
