<template>
  <div>
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
  </div>
</template>

<script setup lang="ts">
import { BookMove } from "@/common/book";
import { AppState } from "@/common/control/state";
import { useStore } from "@/renderer/store";
import { useBookStore } from "@/renderer/store/book";
import { computed, ref } from "vue";
import BookMoveDialog, { Result as EditResult } from "@/renderer/view/dialog/BookMoveDialog.vue";
import { formatMove, Move } from "tsshogi";
import { humanPlayer } from "@/renderer/players/human";
import { t } from "@/common/i18n";
import { useConfirmationStore } from "@/renderer/store/confirm";
import BookView from "@/renderer/view/primitive/BookView.vue";
import { useErrorStore } from "@/renderer/store/error";

const store = useStore();
const bookStore = useBookStore();

const isBookOperational = computed(
  () => store.appState === AppState.NORMAL && bookStore.mode === "in-memory",
);
const bookMoves = computed(() => bookStore.moves);
const bookEditable = computed(() => bookStore.mode === "in-memory");
const editingData = ref<
  BookMove & {
    sfen: string;
    move: string;
  }
>();

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
  padding: 0 1em;
  white-space: nowrap;
  overflow: hidden;
}
.control > button:not(:first-child) {
  margin-left: 2px;
}
.book-list {
  height: calc(100% - 27px);
  margin-bottom: 2px;
}
</style>
