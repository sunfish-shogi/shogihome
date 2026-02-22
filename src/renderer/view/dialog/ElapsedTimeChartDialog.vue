<template>
  <DialogFrame limited @cancel="onClose">
    <div class="title">{{ t.elapsedTimeChart }}</div>
    <div class="content">
      <div v-if="selectedPosition" class="board-area">
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
      <button autofocus data-hotkey="Escape" @click="onClose">{{ t.close }}</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Color, Move, Record, exportKIF, importKIF, ImmutablePosition } from "tsshogi";
import { Chart, ActiveElement, ChartEvent } from "chart.js";
import { useStore } from "@/renderer/store";
import { useAppSettings } from "@/renderer/store/settings";
import { Thema } from "@/common/settings/app";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry";
import DialogFrame from "./DialogFrame.vue";
import SimpleBoardView from "@/renderer/view/primitive/SimpleBoardView.vue";

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
const selectedPly = ref(1);
const boardMaxSize = reactive(new RectSize(200, 300));
let chart: Chart | undefined;

// Create a local mutable record for position navigation
const localRecord = ref<Record>();

const initLocalRecord = () => {
  const kif = exportKIF(store.record);
  const result = importKIF(kif);
  if (result instanceof Error) {
    return;
  }
  localRecord.value = result;
  localRecord.value.goto(selectedPly.value);
};

const selectedPosition = computed<ImmutablePosition | undefined>(() => {
  if (!localRecord.value) {
    return undefined;
  }
  return localRecord.value.position;
});

const selectedLastMove = computed<Move | null>(() => {
  if (!localRecord.value) {
    return null;
  }
  const move = localRecord.value.current.move;
  return move instanceof Move ? move : null;
});

const selectedMoveText = computed(() => {
  if (!localRecord.value) {
    return "";
  }
  const node = localRecord.value.current;
  const plyText = `${t.plyPrefix}${node.ply}${t.plySuffix}`;
  const timeText =
    node.elapsedMs > 0 ? `${(node.elapsedMs / 1000).toFixed(1)}${t.secondsSuffix}` : "";
  return `${plyText} ${node.displayText} ${timeText}`;
});

type BarData = {
  ply: number;
  seconds: number;
  isBlack: boolean;
};

const buildBarData = (): BarData[] => {
  const nodes = store.record.moves;
  const data: BarData[] = [];
  for (const node of nodes) {
    if (node.ply === 0) {
      continue;
    }
    if (node.elapsedMs <= 0) {
      continue;
    }
    const isBlack = node.nextColor === Color.WHITE;
    data.push({
      ply: node.ply,
      seconds: node.elapsedMs / 1000,
      isBlack,
    });
  }
  return data;
};

const buildChart = () => {
  if (!canvas.value) {
    return;
  }
  const palette = getColorPalette(appSettings.thema);
  const barData = buildBarData();

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
      const isBlack = node.nextColor === Color.WHITE;
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

  // Set initial selectedPly to first move with elapsed time
  if (barData.length > 0 && selectedPly.value === 1) {
    selectedPly.value = barData[0].ply;
  }

  const selectedBorderColor = (dataArray: (number | null)[]) => {
    return dataArray.map((_, index) => {
      const ply = index + 1;
      return ply === selectedPly.value ? palette.selected : "transparent";
    });
  };

  const selectedBorderWidth = (dataArray: (number | null)[]) => {
    return dataArray.map((_, index) => {
      const ply = index + 1;
      return ply === selectedPly.value ? 3 : 0;
    });
  };

  const context = canvas.value.getContext("2d", {
    desynchronized: true,
  }) as CanvasRenderingContext2D;
  chart = new Chart(context, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: t.sente,
          data: blackData,
          backgroundColor: palette.blackPlayer,
          borderColor: selectedBorderColor(blackData),
          borderWidth: selectedBorderWidth(blackData),
        },
        {
          label: t.gote,
          data: whiteData,
          backgroundColor: palette.whitePlayer,
          borderColor: selectedBorderColor(whiteData),
          borderWidth: selectedBorderWidth(whiteData),
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
  if (!chart) {
    return;
  }
  const palette = getColorPalette(appSettings.thema);
  const totalLabels = chart.data.labels?.length ?? 0;

  for (const dataset of chart.data.datasets) {
    const borderColors: string[] = [];
    const borderWidths: number[] = [];
    for (let i = 0; i < totalLabels; i++) {
      const ply = i + 1;
      borderColors.push(ply === selectedPly.value ? palette.selected : "transparent");
      borderWidths.push(ply === selectedPly.value ? 3 : 0);
    }
    dataset.borderColor = borderColors;
    dataset.borderWidth = borderWidths;
  }
  chart.update();
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
  selectedPly.value = ply;
};

const updateBoardSize = () => {
  boardMaxSize.width = Math.min(window.innerWidth * 0.25, 250);
  boardMaxSize.height = Math.min(window.innerHeight * 0.6, 350);
};

const onClose = () => {
  store.closeModalDialog();
};

onMounted(() => {
  updateBoardSize();
  initLocalRecord();
  buildChart();
  window.addEventListener("resize", updateBoardSize);
});

onBeforeUnmount(() => {
  if (chart) {
    chart.destroy();
  }
  window.removeEventListener("resize", updateBoardSize);
});

watch(selectedPly, (ply) => {
  if (localRecord.value) {
    localRecord.value.goto(ply);
  }
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
