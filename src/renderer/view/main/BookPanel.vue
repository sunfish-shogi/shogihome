<template>
  <div>
    <div class="full column">
      <BookView
        class="book-list"
        :position="store.record.position"
        :moves="bookStore.moves"
        :playable="store.isMovableByUser"
        @play="playBookMove"
        @edit="editBookMove"
        @remove="removeBookMove"
        @order="updateBookMoveOrder"
      />
      <div class="row control">
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
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { useAppSettings } from "@/renderer/store/settings";

const store = useStore();
const bookStore = useBookStore();
const appSettings = useAppSettings();

const isBookOperational = computed(() => store.appState === AppState.NORMAL);
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
.control > :not(:first-child) {
  margin-left: 8px;
}
.book-list {
  height: calc(100% - 27px);
  margin-bottom: 2px;
}
</style>
