<template>
  <div class="root" :style="style">
    <canvas ref="canvas" class="full"></canvas>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Chart, ActiveElement, ChartEvent } from "chart.js";
import { Color, ImmutableNode, Move, reverseColor } from "tsshogi";
import { Thema } from "@/common/settings/app";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry";

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

const props = defineProps<{
  size?: RectSize;
  thema: Thema;
  moves: ImmutableNode[];
  selectedPly: number;
  showLegend?: boolean;
}>();

const emit = defineEmits<{
  clickPly: [ply: number];
}>();

const canvas = ref<HTMLCanvasElement>();
let chart: Chart | undefined;

const style = computed(() =>
  props.size ? { width: `${props.size.width}px`, height: `${props.size.height}px` } : {},
);

const buildChart = () => {
  if (!canvas.value) {
    return;
  }
  const palette = getColorPalette(props.thema);

  const labels: string[] = [];
  const blackData: (number | null)[] = [];
  const whiteData: (number | null)[] = [];

  const nodeMap = new Map<number, ImmutableNode>();
  for (const node of props.moves) {
    if (node.ply > 0) {
      nodeMap.set(node.ply, node);
    }
  }
  const lastPly = props.moves.length > 1 ? props.moves[props.moves.length - 1].ply : 0;
  const maxPly = Math.max(30, lastPly);

  for (let ply = 1; ply <= maxPly; ply++) {
    labels.push(String(ply));
    const node = nodeMap.get(ply);
    if (node) {
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
      const ply = props.selectedPly;
      if (ply <= 0) {
        return;
      }
      const index = ply - 1;
      let barX: number | null = null;
      let barTopY: number | null = null;
      for (let di = 0; di < ch.data.datasets.length; di++) {
        const value = ch.data.datasets[di].data[index];
        if (value === null || value === undefined) {
          continue;
        }
        const bar = ch.getDatasetMeta(di).data[index];
        if (!bar) {
          continue;
        }
        barX = bar.x;
        barTopY = bar.y;
        break;
      }
      if (barX === null) {
        const xScale = ch.scales.x;
        if (!xScale) {
          return;
        }
        barX = xScale.getPixelForValue(index);
        barTopY = ch.chartArea.bottom;
      }
      if (barX === null || barTopY === null) {
        return;
      }
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
        legend: { display: !!props.showLegend },
        tooltip: { enabled: false },
      },
      events: ["click"],
      onClick: onChartClick,
    },
  });
};

const onChartClick = (event: ChartEvent, elements: ActiveElement[]) => {
  let index: number;
  if (elements.length > 0) {
    index = elements[0].index;
  } else if (chart && event.x !== null) {
    const xScale = chart.scales.x;
    if (!xScale) {
      return;
    }
    const value = xScale.getValueForPixel(event.x);
    if (value === undefined || value === null) {
      return;
    }
    index = Math.round(value);
    const maxIndex = (chart.data.labels?.length ?? 1) - 1;
    if (index < 0 || index > maxIndex) {
      return;
    }
  } else {
    return;
  }
  emit("clickPly", index + 1);
};

onMounted(() => {
  buildChart();
});

onBeforeUnmount(() => {
  chart?.destroy();
});

watch(
  () => props.selectedPly,
  () => {
    chart?.update();
  },
);

watch(
  () => props.thema,
  () => {
    chart?.destroy();
    chart = undefined;
    buildChart();
  },
);

watch(
  () => props.moves,
  () => {
    chart?.destroy();
    chart = undefined;
    buildChart();
  },
);

watch(
  () => props.showLegend,
  (value) => {
    if (chart?.options.plugins?.legend) {
      chart.options.plugins.legend.display = !!value;
      chart.update();
    }
  },
);
</script>

<style scoped>
.root {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--chart-bg-color);
}
</style>
