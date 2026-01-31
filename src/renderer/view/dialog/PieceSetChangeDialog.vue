<template>
  <DialogFrame @cancel="cancel">
    <div class="root">
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
        <button class="bulk thin" @click="setStandardCounts">
          {{ t.setAllPiecesToStandardCounts }}
        </button>
        <button class="bulk thin" @click="setAllZero">{{ t.setAllPiecesToZero }}</button>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="ok()">
          {{ t.ok }}
        </button>
        <button data-hotkey="Escape" @click="cancel()">
          {{ t.cancel }}
        </button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { PieceSet } from "@/renderer/record/manager";
import {
  PieceType,
  countExistingPieces,
  isPromotable,
  promotedPieceType,
  standardPieceName,
} from "tsshogi";
import { ref } from "vue";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();

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

// 平手の駒数
const standardCounts: Record<PieceType, number> = {
  [PieceType.KING]: 2,
  [PieceType.ROOK]: 2,
  [PieceType.BISHOP]: 2,
  [PieceType.GOLD]: 4,
  [PieceType.SILVER]: 4,
  [PieceType.KNIGHT]: 4,
  [PieceType.LANCE]: 4,
  [PieceType.PAWN]: 18,
} as Record<PieceType, number>;

const setStandardCounts = () => {
  for (const pieceType of pieceTypes) {
    counts.value[pieceType] = standardCounts[pieceType];
  }
};

const setAllZero = () => {
  for (const pieceType of pieceTypes) {
    counts.value[pieceType] = 0;
  }
};

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
button.bulk {
  width: 100%;
  margin-top: 0.5em;
}
</style>
