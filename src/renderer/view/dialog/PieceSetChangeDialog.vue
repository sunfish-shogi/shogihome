<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.changePieceSet }}</div>
      <div class="form-group">
        <div class="list row wrap">
          <div v-for="pieceType of pieceTypes" :key="pieceType">
            <span class="piece-name">{{ standardPieceName(pieceType) }}</span>
            <input
              :ref="(el) => (inputs[pieceType] = el as HTMLInputElement)"
              class="number"
              type="number"
              min="0"
              max="18"
              :value="
                counts[pieceType] +
                (isPromotable(pieceType) ? counts[promotedPieceType(pieceType)] : 0)
              "
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
import { readInputAsNumber } from "@/renderer/helpers/form";
import { useStore } from "@/renderer/store";
import { PieceSet } from "@/renderer/store/record";
import {
  PieceType,
  countExistingPieces,
  isPromotable,
  promotedPieceType,
  standardPieceName,
} from "electron-shogi-core";
import { onBeforeUnmount, onMounted, ref } from "vue";

const store = useStore();
const dialog = ref();
const inputs = ref({} as { [key: string]: HTMLInputElement });

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
const counts = countExistingPieces(store.record.position);

onMounted(async () => {
  showModalDialog(dialog.value, cancel);
  installHotKeyForDialog(dialog.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const ok = () => {
  const update = Object.fromEntries(
    pieceTypes.map((pieceType) => {
      const input = inputs.value[pieceType];
      const count = readInputAsNumber(input);
      return [pieceType, count];
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
