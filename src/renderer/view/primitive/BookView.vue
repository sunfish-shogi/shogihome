<template>
  <div class="full">
    <!-- NOTE: 背景だけを透過させるために背景専用の要素を作る。 -->
    <div class="background" :style="{ opacity }"></div>
    <div class="full main">
      <table class="list">
        <thead>
          <tr>
            <td class="text">定跡手</td>
            <td class="number">評価値</td>
            <td class="number">深さ</td>
            <td class="number">出現回数</td>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, index) of moveList" :key="index">
            <td class="text">{{ formatMove(position, entry.move) }}</td>
            <td class="number">{{ entry.score }}</td>
            <td class="number">{{ entry.depth }}</td>
            <td class="number">{{ entry.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BookMove } from "@/common/book";
import { formatMove, ImmutablePosition } from "tsshogi";
import { computed, PropType } from "vue";

const props = defineProps({
  position: {
    type: Object as PropType<ImmutablePosition>,
    required: true,
  },
  moves: {
    type: Array as PropType<BookMove[]>,
    required: true,
  },
  opacity: {
    type: Number,
    required: false,
    default: 1.0,
  },
});

const moveList = computed(() => {
  const list = [];
  for (const entry of props.moves) {
    const move = props.position.createMoveByUSI(entry.usi);
    if (move !== null) {
      list.push({ move, score: entry.score, depth: entry.depth, count: entry.count });
    }
  }
  return list;
});
</script>

<style scoped>
.background {
  position: absolute;
  z-index: -1;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--text-bg-color);
}
.main {
  margin-top: 1px;
  overflow-y: scroll;
  color: var(--text-color);
  font-size: 0.85em;
}
table.list {
  max-width: 100%;
  border-collapse: collapse;
}
table.list > thead > tr > td {
  height: 1.2em;
  background-color: var(--text-bg-color);
  position: sticky;
  top: 0;
  left: 0;
}
table.list > tbody > tr > td {
  height: 1.2em;
}
td.text {
  text-align: left;
}
td.number {
  text-align: right;
}
</style>
