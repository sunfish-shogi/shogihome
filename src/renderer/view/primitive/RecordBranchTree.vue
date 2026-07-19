<template>
  <div class="branch-tree-root">
    <svg
      class="branch-tree"
      :style="{
        width: `${layout.laneCount * LANE_WIDTH_EM}em`,
        height: `${(layout.maxPly + 1) * ROW_HEIGHT_EM}em`,
      }"
      :viewBox="`0 0 ${layout.laneCount * UNIT} ${(layout.maxPly + 1) * UNIT}`"
      preserveAspectRatio="none"
    >
      <line
        v-for="edge in inactiveEdges"
        :key="edge.id"
        class="arc"
        :x1="centerX(edge.from.lane)"
        :y1="centerY(edge.from.ply)"
        :x2="centerX(edge.to.lane)"
        :y2="centerY(edge.to.ply)"
      />
      <line
        v-for="edge in activeEdges"
        :key="edge.id"
        class="arc active"
        :x1="centerX(edge.from.lane)"
        :y1="centerY(edge.from.ply)"
        :x2="centerX(edge.to.lane)"
        :y2="centerY(edge.to.ply)"
      />
      <circle
        v-for="node in layout.nodes"
        :key="node.id"
        class="node"
        :class="{ active: node.onActiveLine, current: node.current }"
        :cx="centerX(node.lane)"
        :cy="centerY(node.ply)"
        :r="node.current ? 3.2 : 2"
      />
      <!-- コメントがあるノードは右下に小さなダイヤを表示する。 -->
      <polygon
        v-for="node in commentNodes"
        :key="`comment-${node.id}`"
        class="comment-mark"
        :points="diamondPoints(centerX(node.lane) + 3.3, centerY(node.ply) + 3)"
      />
      <!-- しおりがあるノードは右上に星印を表示する。 -->
      <polygon
        v-for="node in bookmarkNodes"
        :key="`bookmark-${node.id}`"
        class="bookmark-mark"
        :points="starPoints(centerX(node.lane) + 3.3, centerY(node.ply) - 3)"
      />
      <circle
        v-for="node in layout.nodes"
        :key="`hit-${node.id}`"
        class="hit-area"
        :cx="centerX(node.lane)"
        :cy="centerY(node.ply)"
        :r="UNIT / 2"
        @click="emit('clickNode', node.node)"
        @mouseenter="(event) => onMouseEnter(event, node.node)"
        @mouseleave="onMouseLeave"
      />
    </svg>
    <div v-if="hovered" class="tooltip" :style="tooltipStyle">
      <div class="tooltip-move">
        <span v-if="hovered.node.ply > 0" class="tooltip-ply">{{ hovered.node.ply }}</span>
        {{ hovered.node.displayText }}
      </div>
      <div v-if="hovered.node.ply > 0" class="tooltip-time">
        {{ t.elapsedTime }}: {{ hovered.node.timeText }}
      </div>
      <div v-if="hovered.node.bookmark" class="tooltip-bookmark-row">
        <span class="tooltip-bookmark">{{ hovered.node.bookmark }}</span>
      </div>
      <div v-if="hovered.node.comment" class="tooltip-comment">{{ hovered.node.comment }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, PropType, ref, watch } from "vue";
import { ImmutableNode, ImmutableRecord } from "tsshogi";
import { buildRecordTreeLayout } from "@/renderer/helpers/recordTreeLayout";
import { t } from "@/common/i18n";

// 1 マスあたりの viewBox 上のサイズ
const UNIT = 10;
// 行の高さは棋譜リストの行 (.move-element の 1.4em / font-size 0.85em) に合わせる。
const ROW_HEIGHT_EM = 1.4;
const LANE_WIDTH_EM = 1.4;

// ツールチップの位置を左右反転させるかどうかの判定に使う概算サイズ
const TOOLTIP_ESTIMATED_WIDTH = 240;

const props = defineProps({
  record: {
    type: Object as PropType<ImmutableRecord>,
    required: true,
  },
});

const emit = defineEmits<{
  clickNode: [node: ImmutableNode];
  hoverNode: [node: ImmutableNode | null];
}>();

const layout = computed(() => buildRecordTreeLayout(props.record));
const activeEdges = computed(() => layout.value.edges.filter((edge) => edge.onActiveLine));
const inactiveEdges = computed(() => layout.value.edges.filter((edge) => !edge.onActiveLine));
const commentNodes = computed(() => layout.value.nodes.filter((node) => node.node.comment));
const bookmarkNodes = computed(() => layout.value.nodes.filter((node) => node.node.bookmark));

const centerX = (lane: number) => lane * UNIT + UNIT / 2;
const centerY = (ply: number) => ply * UNIT + UNIT / 2;

// 中心 (cx, cy) のダイヤ(45 度回転した正方形)の頂点列を返す。
const diamondPoints = (cx: number, cy: number): string => {
  const r = 1.5;
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
};

// 中心 (cx, cy) の 5 角星の頂点列を返す。
const starPoints = (cx: number, cy: number): string => {
  const outer = 1.7;
  const inner = 0.75;
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return points.join(" ");
};

const hovered = ref<{ node: ImmutableNode; rect: DOMRect; areaRect: DOMRect } | null>(null);

// ツリーを内包する縦スクロールのコンテナ(棋譜表示エリア)を探す。
// ツールチップの上下反転判定は「表示中の範囲」を基準にする必要があるため、
// 縦スクロールを担うコンテナ(overflow-y: auto/scroll)だけを対象にする。
// 横スクロール専用の .tree-scroll(overflow-y: hidden)はツリー全体の高さに
// 広がってしまい表示範囲を表さないので、overflow-x は判定に含めない。
const findScrollArea = (el: Element): Element | null => {
  for (let e = el.parentElement; e; e = e.parentElement) {
    const style = window.getComputedStyle(e);
    if (/auto|scroll/.test(style.overflowY)) {
      return e;
    }
  }
  return null;
};

const onMouseEnter = (event: Event, node: ImmutableNode) => {
  const target = event.currentTarget as Element;
  const area = findScrollArea(target);
  const areaRect = area
    ? area.getBoundingClientRect()
    : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  hovered.value = { node, rect: target.getBoundingClientRect(), areaRect };
  emit("hoverNode", node);
};

const onMouseLeave = () => {
  hovered.value = null;
  emit("hoverNode", null);
};

// ツリーが更新されたらホバー中のノードが無効になっている可能性があるため閉じる。
watch(layout, () => {
  hovered.value = null;
});

// スクロールコンテナにクリップされないように position: fixed で表示する。
// 左右は画面端ではみ出す場合にノードの反対側へ反転する。
// 上下はノードが表示エリアの上半分なら下側、下半分なら上側に表示する。
const tooltipStyle = computed(() => {
  if (!hovered.value) {
    return {};
  }
  const { rect, areaRect } = hovered.value;
  const style: Record<string, string> = {};
  if (rect.right + TOOLTIP_ESTIMATED_WIDTH < window.innerWidth) {
    style.left = `${rect.right + 4}px`;
  } else {
    style.right = `${window.innerWidth - rect.left + 4}px`;
  }
  const nodeCenterY = (rect.top + rect.bottom) / 2;
  const areaCenterY = areaRect.top + areaRect.height / 2;
  if (nodeCenterY <= areaCenterY) {
    style.top = `${rect.bottom + 2}px`;
  } else {
    style.bottom = `${window.innerHeight - rect.top + 2}px`;
  }
  return style;
});
</script>

<style scoped>
.branch-tree-root {
  flex: none;
}
.branch-tree {
  display: block;
  font-size: 0.85em;
}
.arc {
  stroke: var(--text-separator-color);
  stroke-width: 1;
  fill: none;
}
.arc.active {
  stroke: var(--text-color);
  stroke-width: 2;
}
.node {
  fill: var(--text-separator-color);
}
.node.active {
  fill: var(--text-color);
}
.node.current {
  fill: var(--text-bg-color-selected);
  stroke: var(--text-color);
  stroke-width: 1.5;
}
.comment-mark {
  fill: var(--text-bg-color-selected);
  stroke: var(--text-color);
  stroke-width: 0.4;
}
.bookmark-mark {
  fill: var(--text-bg-color-warning);
  stroke: var(--text-color);
  stroke-width: 0.4;
}
.hit-area {
  fill: transparent;
  stroke: none;
  cursor: pointer;
}
.tooltip {
  position: fixed;
  z-index: 10;
  max-width: 18em;
  padding: 2px 6px;
  font-size: 0.75em;
  text-align: left;
  color: var(--text-color);
  background-color: var(--text-bg-color);
  border: 1px solid var(--text-separator-color);
  border-radius: 4px;
  box-shadow: 0 1px 4px var(--shadow-color);
  pointer-events: none;
}
.tooltip-move,
.tooltip-time {
  white-space: nowrap;
}
.tooltip-ply {
  margin-right: 0.25em;
}
.tooltip-time {
  color: var(--text-separator-color);
}
.tooltip-bookmark-row {
  margin-top: 1px;
}
.tooltip-bookmark {
  display: inline-block;
  padding: 0 5px;
  color: var(--main-color);
  background-color: var(--main-bg-color);
  border: 1px solid var(--text-separator-color);
  border-radius: 5px;
  overflow-wrap: anywhere;
}
.tooltip-comment {
  margin-top: 1px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}
</style>
