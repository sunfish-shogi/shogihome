<template>
  <DialogFrame limited @cancel="onCancel">
    <div class="title">{{ t.duplicatePositionSearch }}</div>
    <div class="form-group scroll">
      <div v-if="positions.length === 0">{{ t.noDuplicatePositions }}</div>
      <div v-else>{{ t.nDuplicatePositionsFound(positions.length) }}</div>
      <div class="row wrap space-evenly">
        <div v-for="entry of positions" :key="entry.sfen" class="row entry">
          <SimpleBoardView
            :max-size="new RectSize(280, 280)"
            :position="entry.position"
            :header="entry.turn"
          />
          <div class="column">
            <div>{{ entry.turn }}</div>
            <div v-if="entry.minPly === entry.maxPly">
              {{ t.plyPrefix }}{{ entry.minPly }}{{ t.plySuffix }}
            </div>
            <div v-else>
              {{ t.fromPrefix }}
              {{ t.plyPrefix }}{{ entry.minPly }}{{ t.plySuffix }}
              {{ t.fromSuffix }}
              {{ t.toPrefix }}
              {{ t.plyPrefix }}{{ entry.maxPly }}{{ t.plySuffix }}
              {{ t.toSuffix }}
            </div>
            <div>{{ t.appearanceCount }}: {{ entry.count }}</div>
            <div>
              <button @click="showList(entry.sfen)">{{ t.showList }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Escape" @click="onCancel">
        {{ t.cancel }}
      </button>
    </div>
    <DuplicatePositionsDialog
      v-if="duplicatePositionsDialog"
      :sfen="duplicatePositionsDialog"
      @select="changeNode"
      @close="duplicatePositionsDialog = ''"
    />
  </DialogFrame>
</template>

<script setup lang="ts">
import { useStore } from "@/renderer/store";
import DialogFrame from "@/renderer/view/dialog/DialogFrame.vue";
import { computed, ref } from "vue";
import { Color, ImmutableNode, ImmutablePosition, Position } from "tsshogi";
import { RectSize } from "@/common/assets/geometry";
import { t } from "@/common/i18n";
import DuplicatePositionsDialog from "./DuplicatePositionsDialog.vue";
import SimpleBoardView from "@/renderer/view/primitive/SimpleBoardView.vue";

const store = useStore();
const duplicatePositionsDialog = ref("");

const positions = computed(() => {
  const minPlyMap = new Map<string, number>();
  const maxPlyMap = new Map<string, number>();
  store.record.forEach((node) => {
    minPlyMap.set(node.sfen, Math.min(node.ply + 1, minPlyMap.get(node.sfen) || Infinity));
    maxPlyMap.set(node.sfen, Math.max(node.ply + 1, maxPlyMap.get(node.sfen) || 0));
  });
  return Array.from(store.positionCounts.entries())
    .map(([sfen, count]) => {
      const position = Position.newBySFEN(sfen);
      const minPly = minPlyMap.get(sfen) || 1;
      const maxPly = maxPlyMap.get(sfen) || 1;
      const turn = position?.color === Color.BLACK ? "先手番" : "後手番";
      return { position: position as ImmutablePosition, minPly, maxPly, sfen, count, turn };
    })
    .filter(({ position, count }) => position && count >= 2)
    .sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      if (a.minPly !== b.minPly) {
        return a.minPly - b.minPly;
      }
      return a.sfen.localeCompare(b.sfen);
    });
});

function showList(sfen: string) {
  duplicatePositionsDialog.value = sfen;
}

function changeNode(node: ImmutableNode) {
  store.destroyModalDialog();
  store.changeNode(node);
}

function onCancel() {
  store.destroyModalDialog();
}
</script>

<style scoped>
.entry {
  align-items: start;
  margin: 20px 10px;
}
.entry > * {
  margin-right: 10px;
}
.entry > .column > * {
  align-items: start;
  text-align: left;
}
</style>
