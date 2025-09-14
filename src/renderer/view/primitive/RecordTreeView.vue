<template>
  <div class="root">
    <div class="content">
      <svg class="edges" :style="graph.edgesStyle">
        <g style="stroke: var(--text-separator-color); stroke-width: 2; stroke-dasharray: 4">
          <line
            v-for="(edge, index) of graph.edges"
            :key="index"
            :x1="edge.x1"
            :y1="edge.y1"
            :x2="edge.x2"
            :y2="edge.y2"
          />
        </g>
      </svg>
      <div class="nodes">
        <div v-for="(node, index) of graph.nodes" :key="index" :style="node.style">
          {{ node.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
const gridWidth = 200;
const gridHeight = 40;
const edgeWidth = 150;
const edgeHeight = 20;
</script>

<script setup lang="ts">
import { ImmutableRecord } from "tsshogi";
import { computed, PropType } from "vue";

const props = defineProps({
  record: {
    type: Object as PropType<ImmutableRecord>,
    required: true,
  },
});

const graph = computed(() => {
  const nodes: {
    text: string;
    style: {
      left: string;
      top: string;
      width: string;
      height: string;
    };
  }[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let x = gridWidth / 2;
  const firstBranchXMap = new Map<number, number>();
  let branchTopY = gridHeight / 2;
  let width = gridWidth;
  let height = 0;
  props.record.forEach((node) => {
    const y = node.ply * gridHeight + gridHeight / 2;
    height = Math.max(height, y + gridHeight / 2);
    if (node.isFirstBranch) {
      firstBranchXMap.set(node.ply, x);
    } else {
      x += gridWidth;
      branchTopY = y;
      width = x + gridWidth / 2;
    }
    nodes.push({
      text: node.displayText,
      style: { left: x + "px", top: y + "px", width: edgeWidth + "px", height: edgeHeight + "px" },
    });
    if (node.isFirstBranch) {
      if (node.prev && !node.next) {
        const y1 = branchTopY;
        edges.push({ x1: x, y1, x2: x, y2: y });
      }
    } else if (!node.branch) {
      const x1 = firstBranchXMap.get(node.ply) ?? x;
      edges.push({ x1, y1: y, x2: x, y2: y });
    }
  });
  const edgesStyle = {
    width: width + "px",
    height: height + "px",
  };
  return { nodes, edges, edgesStyle };
});
</script>

<style scoped>
.root {
  background-color: var(--text-bg-color);
  overflow: auto;
}
.content {
  position: relative;
}
.edges {
  position: absolute;
  top: 0;
  left: 0;
}
.nodes {
  position: absolute;
  inset: 0;
}
.nodes > div {
  position: absolute;
  transform: translate(-50%, -50%);
  color: var(--text-color);
  border: 1px solid var(--text-separator-color);
  border-radius: 4px;
  background-color: var(--text-bg-color);
  white-space: nowrap;
}
</style>
