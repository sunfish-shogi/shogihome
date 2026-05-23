<template>
  <div class="canvas" :class="{ dragging: !!dragging }">
    <div
      v-for="(comp, i) in components"
      :key="i"
      class="comp-rect"
      :class="{ active: dragging?.index === i }"
      :style="rectStyle(comp, i)"
      @mousedown.left.prevent="onBodyMouseDown($event, i)"
    >
      <span class="comp-label">{{ labelOf(comp.type) }}</span>
      <div
        class="handle nw"
        @mousedown.left.prevent.stop="onHandleMouseDown($event, i, 'resize-nw')"
      />
      <div
        class="handle ne"
        @mousedown.left.prevent.stop="onHandleMouseDown($event, i, 'resize-ne')"
      />
      <div
        class="handle sw"
        @mousedown.left.prevent.stop="onHandleMouseDown($event, i, 'resize-sw')"
      />
      <div
        class="handle se"
        @mousedown.left.prevent.stop="onHandleMouseDown($event, i, 'resize-se')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { UIComponent } from "@/common/settings/layout";
import { t } from "@/common/i18n";

const SCALE = 0.5;
const MIN_SIZE = 40; // actual coordinates

type DragOp = "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se";

type DragState = {
  op: DragOp;
  index: number;
  startX: number; // clientX at mousedown
  startY: number; // clientY at mousedown
  origLeft: number;
  origTop: number;
  origWidth: number;
  origHeight: number;
};

const props = defineProps<{ components: UIComponent[] }>();
const emit = defineEmits<{
  (
    e: "updateComponent",
    index: number,
    left: number,
    top: number,
    width: number,
    height: number,
  ): void;
}>();

const dragging = ref<DragState | null>(null);

function labelOf(type: UIComponent["type"]): string {
  switch (type) {
    case "Board":
      return t.board;
    case "Record":
      return t.record;
    case "Book":
      return t.book;
    case "Chart":
      return t.chart;
    case "Analytics":
      return t.analytics;
    case "Comment":
      return t.comments;
    case "RecordInfo":
      return t.recordProperties;
    case "ControlGroup1":
      return `${t.controlGroup}1`;
    case "ControlGroup2":
      return `${t.controlGroup}2`;
    case "SimpleBoard":
      return t.bookStyleDiagram;
    case "ElapsedTimeChart":
      return t.elapsedTimeChart;
  }
}

function rectStyle(comp: UIComponent, i: number) {
  // Smaller components get a higher z-index so they naturally appear in front of larger ones.
  // The actively dragged component always wins with a very high z-index.
  const area = Math.max(1, comp.width) * Math.max(1, comp.height);
  const zIndex = dragging.value?.index === i ? 10000 : Math.round(1_000_000 / area);
  return {
    left: `${comp.left * SCALE}px`,
    top: `${comp.top * SCALE}px`,
    width: `${comp.width * SCALE}px`,
    height: `${comp.height * SCALE}px`,
    zIndex,
  };
}

function startDrag(e: MouseEvent, i: number, op: DragOp) {
  const comp = props.components[i];
  dragging.value = {
    op,
    index: i,
    startX: e.clientX,
    startY: e.clientY,
    origLeft: comp.left,
    origTop: comp.top,
    origWidth: comp.width,
    origHeight: comp.height,
  };
  document.addEventListener("mousemove", onDocMouseMove);
  document.addEventListener("mouseup", onDocMouseUp, { once: true });
}

function onBodyMouseDown(e: MouseEvent, i: number) {
  startDrag(e, i, "move");
}

function onHandleMouseDown(e: MouseEvent, i: number, op: DragOp) {
  startDrag(e, i, op);
}

function onDocMouseMove(e: MouseEvent) {
  const d = dragging.value;
  if (!d) {
    return;
  }

  // Mouse delta is in display pixels (SCALE space); divide by SCALE to get actual coordinates.
  const dx = (e.clientX - d.startX) / SCALE;
  const dy = (e.clientY - d.startY) / SCALE;

  let left = d.origLeft;
  let top = d.origTop;
  let width = d.origWidth;
  let height = d.origHeight;

  switch (d.op) {
    case "move":
      left = Math.round(d.origLeft + dx);
      top = Math.round(d.origTop + dy);
      break;
    case "resize-se":
      width = Math.max(MIN_SIZE, Math.round(d.origWidth + dx));
      height = Math.max(MIN_SIZE, Math.round(d.origHeight + dy));
      break;
    case "resize-sw":
      width = Math.max(MIN_SIZE, Math.round(d.origWidth - dx));
      left = Math.round(d.origLeft + d.origWidth - width);
      height = Math.max(MIN_SIZE, Math.round(d.origHeight + dy));
      break;
    case "resize-ne":
      width = Math.max(MIN_SIZE, Math.round(d.origWidth + dx));
      height = Math.max(MIN_SIZE, Math.round(d.origHeight - dy));
      top = Math.round(d.origTop + d.origHeight - height);
      break;
    case "resize-nw":
      width = Math.max(MIN_SIZE, Math.round(d.origWidth - dx));
      left = Math.round(d.origLeft + d.origWidth - width);
      height = Math.max(MIN_SIZE, Math.round(d.origHeight - dy));
      top = Math.round(d.origTop + d.origHeight - height);
      break;
  }

  emit("updateComponent", d.index, left, top, width, height);
}

function onDocMouseUp() {
  dragging.value = null;
  document.removeEventListener("mousemove", onDocMouseMove);
}

onUnmounted(() => {
  document.removeEventListener("mousemove", onDocMouseMove);
  document.removeEventListener("mouseup", onDocMouseUp);
});
</script>

<style scoped>
.canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--dialog-bg-color);
  border: 1px solid var(--dialog-border-color);
  border-radius: 5px;
  user-select: none;
}
.canvas.dragging {
  cursor: grabbing;
}
.canvas.dragging .comp-rect {
  cursor: inherit;
}
.comp-rect {
  position: absolute;
  border: 2px solid #4a9eff;
  background: rgba(74, 158, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  cursor: grab;
}
.comp-rect.active {
  border-color: #ff9f4a;
  background: rgba(255, 159, 74, 0.2);
}
.comp-label {
  color: var(--dialog-color);
  font-size: 11px;
  pointer-events: none;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
}
.handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #4a9eff;
  border: 1px solid var(--dialog-bg-color);
  box-sizing: border-box;
}
.comp-rect.active .handle {
  background: #ff9f4a;
}
.handle.nw {
  top: -5px;
  left: -5px;
  cursor: nw-resize;
}
.handle.ne {
  top: -5px;
  right: -5px;
  cursor: ne-resize;
}
.handle.sw {
  bottom: -5px;
  left: -5px;
  cursor: sw-resize;
}
.handle.se {
  bottom: -5px;
  right: -5px;
  cursor: se-resize;
}
</style>
