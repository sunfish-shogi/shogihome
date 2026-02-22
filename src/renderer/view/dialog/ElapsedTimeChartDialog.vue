<template>
  <DialogFrame limited @cancel="onClose">
    <div class="title">{{ t.elapsedTimeChart }}</div>
    <div class="content">
      <div class="board-area">
        <SimpleBoardView
          :max-size="boardMaxSize"
          :position="selectedPosition"
          :last-move="selectedLastMove"
        />
        <div class="board-info">
          {{ selectedMoveText }}
        </div>
      </div>
      <div class="chart-area">
        <canvas ref="canvas"></canvas>
      </div>
    </div>
    <div class="main-buttons">
      <button :data-hotkey="shortcutKeys.Begin" @click="store.changePly(0)">
        <Icon :icon="IconType.FIRST" />
      </button>
      <button :data-hotkey="shortcutKeys.Back" @click="store.goBack()">
        <Icon :icon="IconType.BACK" />
      </button>
      <button :data-hotkey="shortcutKeys.Forward" @click="store.goForward()">
        <Icon :icon="IconType.NEXT" />
      </button>
      <button :data-hotkey="shortcutKeys.End" @click="store.changePly(Number.MAX_SAFE_INTEGER)">
        <Icon :icon="IconType.LAST" />
      </button>
      <button autofocus data-hotkey="Escape" @click="onClose">{{ t.close }}</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Color, Move, ImmutablePosition, reverseColor } from "tsshogi";
import { Chart, ActiveElement, ChartEvent } from "chart.js";
import { useStore } from "@/renderer/store";
import { useAppSettings } from "@/renderer/store/settings";
import { Thema } from "@/common/settings/app";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry";
import DialogFrame from "./DialogFrame.vue";
import SimpleBoardView from "@/renderer/view/primitive/SimpleBoardView.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { getRecordShortcutKeys } from "@/renderer/view/primitive/board/shortcut";

type ColorPalette = {
  main: string;
  ticks: string;
  grid: string;
  blackPlayer: string;
  whitePlayer: string;
  selected: string;
};

function getColorPalette(thema: Thema): ColorPalette {
  switch (thema) {
    default:
      return {
        main: "black",
        ticks: "dimgray",
        grid: "lightgray",
        blackPlayer: "#1480C9",
        whitePlayer: "#FB7D00",
        selected: "red",
      };
    case Thema.DARK_GREEN:
    case Thema.DARK:
      return {
        main: "white",
        ticks: "darkgray",
        grid: "dimgray",
        blackPlayer: "#36A2EB",
        whitePlayer: "#FF9F40",
        selected: "red",
      };
  }
}

const store = useStore();
const appSettings = useAppSettings();
const canvas = ref<HTMLCanvasElement>();
const boardMaxSize = reactive(new RectSize(200, 500));
let chart: Chart | undefined;

const shortcutKeys = computed(() => getRecordShortcutKeys(appSettings.recordShortcutKeys));

const selectedPly = computed(() => store.record.current.ply);

const selectedPosition = computed<ImmutablePosition>(() => store.record.position);

const selectedLastMove = computed<Move | null>(() => {
  const move = store.record.current.move;
  return move instanceof Move ? move : null;
});

const selectedMoveText = computed(() => {
  const node = store.record.current;
  const plyText = `${t.plyPrefix}${node.ply}${t.plySuffix}`;
  const timeText =
    node.elapsedMs > 0 ? `${(node.elapsedMs / 1000).toFixed(1)}${t.secondsSuffix}` : "";
  return `${plyText} ${node.displayText} ${timeText}`;
});

const buildChart = () => {
  if (!canvas.value) {
    return;
  }
  const palette = getColorPalette(appSettings.thema);

  // Build label and data arrays, always showing at least up to ply 30
  const labels: string[] = [];
  const blackData: (number | null)[] = [];
  const whiteData: (number | null)[] = [];

  const nodes = store.record.moves;
  const nodeMap = new Map<number, (typeof nodes)[0]>();
  for (const node of nodes) {
    if (node.ply > 0) {
      nodeMap.set(node.ply, node);
    }
  }
  const lastPly = nodes.length > 1 ? nodes[nodes.length - 1].ply : 0;
  const maxPly = Math.max(30, lastPly);

  for (let ply = 1; ply <= maxPly; ply++) {
    labels.push(String(ply));
    const node = nodeMap.get(ply);
    if (node) {
      // 通常の指し手は nextColor が次手番（指した人の反対色）なので reverseColor が必要。
      // 投了等のスペシャルムーブは局面が更新されず nextColor が指した人自身の色になる。
      const moverColor = node.move instanceof Move ? reverseColor(node.nextColor) : node.nextColor;
      const isBlack = moverColor === Color.BLACK;
      const seconds = node.elapsedMs > 0 ? node.elapsedMs / 1000 : null;
      if (isBlack) {
        blackData.push(seconds);
        whiteData.push(null);
      } else {
        blackData.push(null);
        whiteData.push(seconds);
      }
    } else {
      blackData.push(null);
      whiteData.push(null);
    }
  }

  const plyIndicatorPlugin = {
    id: "plyIndicator",
    afterDraw(ch: Chart) {
      const ply = selectedPly.value;
      if (ply <= 0) return;
      const index = ply - 1;
      let barX: number | null = null;
      let barTopY: number | null = null;
      for (let di = 0; di < ch.data.datasets.length; di++) {
        const value = ch.data.datasets[di].data[index];
        if (value === null || value === undefined) continue;
        const bar = ch.getDatasetMeta(di).data[index];
        if (!bar) continue;
        barX = bar.x;
        barTopY = bar.y;
        break;
      }
      if (barX === null || barTopY === null) return;
      const size = 7;
      const ctx = ch.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(barX - size, barTopY - size * 2 - 2);
      ctx.lineTo(barX + size, barTopY - size * 2 - 2);
      ctx.lineTo(barX, barTopY - 2);
      ctx.closePath();
      ctx.fillStyle = palette.selected;
      ctx.fill();
      ctx.restore();
    },
  };

  const context = canvas.value.getContext("2d", {
    desynchronized: true,
  }) as CanvasRenderingContext2D;
  chart = new Chart(context, {
    type: "bar",
    plugins: [plyIndicatorPlugin],
    data: {
      labels,
      datasets: [
        {
          label: t.sente,
          data: blackData,
          backgroundColor: palette.blackPlayer,
        },
        {
          label: t.gote,
          data: whiteData,
          backgroundColor: palette.whitePlayer,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      color: palette.main,
      scales: {
        x: {
          stacked: true,
          ticks: { color: palette.ticks },
          grid: { color: palette.grid },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: palette.ticks },
          grid: { color: palette.grid },
        },
      },
      plugins: {
        legend: { display: true },
        tooltip: { enabled: false },
      },
      events: ["click"],
      onClick: onChartClick,
    },
  });
};

const updateChartSelection = () => {
  chart?.update();
};

const onChartClick = (event: ChartEvent, elements: ActiveElement[]) => {
  let index: number;
  if (elements.length > 0) {
    index = elements[0].index;
  } else if (chart && event.x !== null) {
    const xScale = chart.scales.x;
    if (!xScale) return;
    const value = xScale.getValueForPixel(event.x);
    if (value === undefined || value === null) return;
    index = Math.round(value);
    const maxIndex = (chart.data.labels?.length ?? 1) - 1;
    if (index < 0 || index > maxIndex) return;
  } else {
    return;
  }
  const ply = index + 1;
  store.changePly(ply);
};

const updateBoardSize = () => {
  boardMaxSize.width = Math.min(window.innerWidth * 0.2, 220);
  boardMaxSize.height = Math.min(window.innerHeight * 0.8, 550);
};

const onClose = () => {
  store.closeModalDialog();
};

onMounted(() => {
  updateBoardSize();
  buildChart();
  window.addEventListener("resize", updateBoardSize);
});

onBeforeUnmount(() => {
  if (chart) {
    chart.destroy();
  }
  window.removeEventListener("resize", updateBoardSize);
});

watch(selectedPly, () => {
  updateChartSelection();
});
</script>

<style scoped>
:deep(.frame) {
  width: 90vw;
  height: 90vh;
}
.title {
  font-size: 1.2em;
  font-weight: bold;
  text-align: center;
  margin-bottom: 10px;
}
.content {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 15px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.chart-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  background-color: var(--chart-bg-color);
}
.board-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.board-info {
  margin-top: 5px;
  font-size: 0.9em;
  text-align: center;
  white-space: nowrap;
}
</style>
