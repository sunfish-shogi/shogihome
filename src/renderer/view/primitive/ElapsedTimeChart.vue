<template>
  <div class="root" :style="style">
    <canvas ref="canvas" class="full"></canvas>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Chart, ActiveElement, ChartEvent } from "chart.js";
import { Color, ImmutableNode, ImmutableRecord, Move, reverseColor } from "tsshogi";
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
  record: ImmutableRecord;
  showLegend?: boolean;
}>();

const emit = defineEmits<{
  clickPly: [ply: number];
}>();

const canvas = ref<HTMLCanvasElement>();
let chart: Chart;

const style = computed(() =>
  props.size ? { width: `${props.size.width}px`, height: `${props.size.height}px` } : {},
);

const chartData = computed(() => {
  const nodeMap = new Map<number, ImmutableNode>();
  for (const node of props.record.moves) {
    if (node.ply > 0) {
      nodeMap.set(node.ply, node);
    }
  }
  const lastPly =
    props.record.moves.length > 1 ? props.record.moves[props.record.moves.length - 1].ply : 0;
  const maxPly = Math.max(30, lastPly);
  const labels: string[] = [];
  const blackData: (number | null)[] = [];
  const whiteData: (number | null)[] = [];
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
  return { labels, blackData, whiteData };
});

const updateChart = () => {
  const palette = getColorPalette(props.thema);
  const { labels, blackData, whiteData } = chartData.value;
  chart.data.labels = labels;
  chart.data.datasets[0].data = blackData;
  chart.data.datasets[0].backgroundColor = palette.blackPlayer;
  chart.data.datasets[1].data = whiteData;
  chart.data.datasets[1].backgroundColor = palette.whitePlayer;
  chart.options.color = palette.main;
  if (chart.options.scales?.x?.ticks) {
    chart.options.scales.x.ticks.color = palette.ticks;
  }
  if (chart.options.scales?.x?.grid) {
    chart.options.scales.x.grid.color = palette.grid;
  }
  if (chart.options.scales?.y?.ticks) {
    chart.options.scales.y.ticks.color = palette.ticks;
  }
  if (chart.options.scales?.y?.grid) {
    chart.options.scales.y.grid.color = palette.grid;
  }
  if (chart.options.plugins?.legend) {
    chart.options.plugins.legend.display = !!props.showLegend;
  }
  chart.update();
};

const onChartClick = (event: ChartEvent, elements: ActiveElement[]) => {
  let index: number;
  if (elements.length > 0) {
    index = elements[0].index;
  } else if (event.x !== null) {
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
  const palette = getColorPalette(props.thema);

  const plyIndicatorPlugin = {
    id: "plyIndicator",
    afterDraw(ch: Chart) {
      const ply = props.record.current.ply;
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
      ctx.fillStyle = getColorPalette(props.thema).selected;
      ctx.fill();
      ctx.restore();
    },
  };

  const context = canvas.value!.getContext("2d", {
    desynchronized: true,
  }) as CanvasRenderingContext2D;
  chart = new Chart(context, {
    type: "bar",
    plugins: [plyIndicatorPlugin],
    data: {
      labels: [],
      datasets: [
        { label: t.sente, data: [], backgroundColor: palette.blackPlayer },
        { label: t.gote, data: [], backgroundColor: palette.whitePlayer },
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

  updateChart();

  watch(
    () => props.record.current.ply,
    () => chart.update(),
  );

  watch(
    () => [chartData.value, props.thema, props.showLegend] as const,
    () => updateChart(),
  );
});

onBeforeUnmount(() => {
  chart?.destroy();
});
</script>

<style scoped>
.root {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--chart-bg-color);
}
</style>
