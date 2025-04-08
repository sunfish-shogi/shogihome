<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.changePieceSet }}</div>
      <div class="form-group">
        <div class="list row wrap">
          <div v-for="pieceType of pieceTypes" :key="pieceType">
            <span class="piece-name">{{ standardPieceName(pieceType) }}</span>
            <input
              v-model.number="counts[pieceType]"
              class="number"
              type="number"
              min="0"
              max="18"
            />
          </div>
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="ok()">
          {{ t.ok }}
        </button>
        <button data-hotkey="Escape" @click="cancel()">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { useStore } from "@/renderer/store";
import { PieceSet } from "@/renderer/store/record";
import {
  PieceType,
  countExistingPieces,
  isPromotable,
  promotedPieceType,
  standardPieceName,
} from "tsshogi";
import { onBeforeUnmount, onMounted, ref } from "vue";

const store = useStore();
const dialog = ref();

const pieceTypes = [
  PieceType.KING,
  PieceType.ROOK,
  PieceType.BISHOP,
  PieceType.GOLD,
  PieceType.SILVER,
  PieceType.KNIGHT,
  PieceType.LANCE,
  PieceType.PAWN,
];
const rawCounts = countExistingPieces(store.record.position);
const counts = ref(
  Object.fromEntries(
    pieceTypes.map((pieceType) => [
      pieceType,
      rawCounts[pieceType] +
        (isPromotable(pieceType) ? rawCounts[promotedPieceType(pieceType)] : 0),
    ]),
  ),
);

onMounted(() => {
  showModalDialog(dialog.value, cancel);
  installHotKeyForDialog(dialog.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const ok = () => {
  const update = Object.fromEntries(
    pieceTypes.map((pieceType) => {
      return [pieceType, counts.value[pieceType]];
    }),
  ) as PieceSet;
  store.closePieceSetChangeDialog(update);
};

const cancel = () => {
  store.closePieceSetChangeDialog();
};
</script>

<style scoped>
.root {
  width: 350px;
}
.list > * {
  margin-right: 0.5em;
}
.piece-name {
  width: 2em;
  display: inline-block;
  text-align: right;
  margin-right: 0.5em;
}
.number {
  width: 3em;
}
</style>
