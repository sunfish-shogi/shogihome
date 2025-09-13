<template>
  <div>
    <div class="full root" :style="style">
      <canvas ref="canvas" class="full"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RectSize } from "@/common/assets/geometry.js";
import { useStore } from "@/renderer/store";
import { RecordCustomData, SearchInfo } from "@/renderer/store/record";
import { computed, onMounted, onUnmounted, PropType, ref, watch } from "vue";
import { ActiveElement, Chart, ChartEvent, Color as ChartColor, ChartDataset } from "chart.js";
import { Color, ImmutableNode, ImmutableRecord } from "tsshogi";
import { scoreToPercentage } from "@/renderer/store/score";
import { Thema } from "@/common/settings/app";
import { t } from "@/common/i18n";
import { Lazy } from "@/renderer/helpers/lazy";
import { EvaluationChartType } from "@/common/settings/layout";

const MATE_SCORE = 1000000;
const MAX_SCORE = 2000;
const MIN_SCORE = -MAX_SCORE;

enum Series {
  BLACK_PLAYER,
  WHITE_PLAYER,
  RESEARCHER,
  RESEARCHER_2,
  RESEARCHER_3,
  RESEARCHER_4,
}

function getSeriesName(series: Series): string {
  switch (series) {
    case Series.BLACK_PLAYER:
      return t.sente;
    case Series.WHITE_PLAYER:
      return t.gote;
    case Series.RESEARCHER:
      return t.research;
    case Series.RESEARCHER_2:
      return t.research + "2";
    case Series.RESEARCHER_3:
      return t.research + "3";
    case Series.RESEARCHER_4:
      return t.research + "4";
  }
}

function getSearchInfo(node: ImmutableNode, series: Series): SearchInfo | undefined {
  const data = node.customData as RecordCustomData;
  if (!data) {
    return;
  }
  switch (series) {
    case Series.BLACK_PLAYER:
      if (node.nextColor === Color.BLACK) {
        return;
      }
      return data.playerSearchInfo;
    case Series.WHITE_PLAYER:
      if (node.nextColor === Color.WHITE) {
        return;
      }
      return data.playerSearchInfo;
    case Series.RESEARCHER:
      return data.researchInfo;
    case Series.RESEARCHER_2:
      return data.researchInfo2;
    case Series.RESEARCHER_3:
      return data.researchInfo3;
    case Series.RESEARCHER_4:
      return data.researchInfo4;
  }
}

function getScore(
  searchInfo: SearchInfo,
  type: EvaluationChartType,
  coefficientInSigmoid: number,
): number | undefined {
  let score = searchInfo.score;
  // mateがある場合はMATE_SCOREを代わりに使用する。
  if (searchInfo.mate !== undefined) {
    score = searchInfo.mate > 0 ? MATE_SCORE : -MATE_SCORE;
  }
  if (score === undefined) {
    return;
  }
  switch (type) {
    case EvaluationChartType.RAW:
      return Math.min(Math.max(score, MIN_SCORE), MAX_SCORE);
    case EvaluationChartType.WIN_RATE:
      return scoreToPercentage(score, coefficientInSigmoid);
  }
}

type ColorPalette = {
  main: string;
  ticks: string;
  grid: string;
  head: string;
  blackPlayer: string;
  whitePlayer: string;
  researcher: string;
  researcher2: string;
  researcher3: string;
  researcher4: string;
};

function getColorPalette(thema: Thema): ColorPalette {
  switch (thema) {
    default:
      return {
        main: "black",
        ticks: "dimgray",
        grid: "lightgray",
        head: "red",
        blackPlayer: "#1480C9",
        whitePlayer: "#FB7D00",
        researcher: "#349393",
        researcher2: "#FF1F4E",
        researcher3: "#6C22FF",
        researcher4: "#FFB912",
      };
    case Thema.DARK_GREEN:
    case Thema.DARK:
      return {
        main: "white",
        ticks: "darkgray",
        grid: "dimgray",
        head: "red",
        blackPlayer: "#36A2EB",
        whitePlayer: "#FF9F40",
        researcher: "#4BC0C0",
        researcher2: "#FF6384",
        researcher3: "#9966FF",
        researcher4: "#FFCD56",
      };
  }
}

type ChartConfig = {
  type: EvaluationChartType;
  palette: ColorPalette;
  coefficientInSigmoid: number;
  showLegend: boolean;
};

const props = defineProps({
  size: {
    type: RectSize,
    required: true,
  },
  type: {
    type: String as PropType<EvaluationChartType>,
    required: true,
  },
  thema: {
    type: String as PropType<Thema>,
    required: true,
  },
  coefficientInSigmoid: {
    type: Number,
    required: true,
  },
  showLegend: {
    type: Boolean,
    required: false,
    default: true,
  },
});

const canvas = ref();
const store = useStore();
let chart: Chart;

const getMaxScore = (type: EvaluationChartType) => {
  return type === EvaluationChartType.RAW ? MAX_SCORE : 100;
};

const getMinScore = (type: EvaluationChartType) => {
  return type === EvaluationChartType.RAW ? MIN_SCORE : 0;
};

const buildDataset = (
  borderColor: ChartColor,
  series: Series,
  record: ImmutableRecord,
  config: ChartConfig,
) => {
  const dataPoints: { x: number; y: number }[] = [];
  const nodes = record.moves;
  for (const node of nodes) {
    const searchInfo = getSearchInfo(node, series);
    if (!searchInfo) {
      continue;
    }
    const score = getScore(searchInfo, config.type, config.coefficientInSigmoid);
    if (score !== undefined) {
      dataPoints.push({
        x: node.ply,
        y: score,
      });
    }
  }
  const lastNode = nodes[nodes.length - 1];
  if (
    (series === Series.BLACK_PLAYER && lastNode.nextColor === Color.BLACK) ||
    (series === Series.WHITE_PLAYER && lastNode.nextColor === Color.WHITE)
  ) {
    const data = lastNode.customData as RecordCustomData;
    if (data && data.opponentSearchInfo) {
      const score = getScore(data.opponentSearchInfo, config.type, config.coefficientInSigmoid);
      if (score !== undefined) {
        dataPoints.push({
          x: lastNode.ply + 1,
          y: score,
        });
      }
    }
  }
  return {
    label: getSeriesName(series),
    borderColor,
    data: dataPoints,
    showLine: true,
  };
};

const verticalLine = (
  type: EvaluationChartType,
  record: ImmutableRecord,
  palette: ColorPalette,
) => {
  return {
    label: t.currentPosition,
    borderColor: palette.head,
    data: [
      { x: record.current.ply, y: getMaxScore(type) },
      { x: record.current.ply, y: getMinScore(type) },
    ],
    showLine: true,
    pointBorderWidth: 0,
    pointRadius: 0,
  };
};

const buildDatasets = (record: ImmutableRecord, config: ChartConfig) => {
  const series = [
    { borderColor: config.palette.blackPlayer, type: Series.BLACK_PLAYER },
    { borderColor: config.palette.whitePlayer, type: Series.WHITE_PLAYER },
    { borderColor: config.palette.researcher, type: Series.RESEARCHER },
    { borderColor: config.palette.researcher2, type: Series.RESEARCHER_2 },
    { borderColor: config.palette.researcher3, type: Series.RESEARCHER_3 },
    { borderColor: config.palette.researcher4, type: Series.RESEARCHER_4 },
  ];
  const datasets: ChartDataset[] = [verticalLine(config.type, record, config.palette)];
  for (const s of series) {
    const dataset = buildDataset(s.borderColor, s.type, record, config);
    if (dataset.data.length > 0) {
      datasets.push(dataset);
    }
  }
  return datasets;
};

const buildScalesOption = (record: ImmutableRecord, config: ChartConfig) => {
  const stepSize = config.type === EvaluationChartType.RAW ? MAX_SCORE / 2 : 25;
  return {
    x: {
      min: 0,
      max: record.length + 10,
      ticks: { color: config.palette.ticks },
      grid: { color: config.palette.grid },
    },
    y: {
      min: getMinScore(config.type),
      max: getMaxScore(config.type),
      ticks: { color: config.palette.ticks, stepSize },
      grid: { color: config.palette.grid },
    },
  };
};

const updateChart = (config: ChartConfig) => {
  chart.data.datasets = buildDatasets(store.record, config);
  chart.options.color = config.palette.main;
  chart.options.scales = buildScalesOption(store.record, config);
  chart.options.plugins = {
    legend: { display: config.showLegend },
    title: { display: false },
    tooltip: { enabled: false },
  };
  chart.update();
};

const onClick = (event: ChartEvent, _: ActiveElement[], chart: Chart) => {
  if (event.x === null) {
    return;
  }
  const width = chart.scales.x.max - chart.scales.x.min;
  const displayWidth = chart.scales.x.right - chart.scales.x.left;
  const x = ((event.x - chart.scales.x.left) / displayWidth) * width + chart.scales.x.min;
  const ply = Math.round(x);
  store.changePly(ply);
};

const config = computed(() => {
  return {
    type: props.type,
    palette: getColorPalette(props.thema),
    coefficientInSigmoid: props.coefficientInSigmoid,
    showLegend: props.showLegend,
  };
});

const lazy = new Lazy();
const updateChartLazy = () => {
  lazy.after(() => {
    updateChart(config.value);
  }, 100);
};

onMounted(() => {
  const element = canvas.value as HTMLCanvasElement;
  const context = element.getContext("2d", { desynchronized: true }) as CanvasRenderingContext2D;
  chart = new Chart(context, {
    type: "scatter",
    data: {
      datasets: [],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 100,
      parsing: false,
      normalized: true,
      interaction: {
        mode: "nearest",
      },
      elements: {
        point: {
          hitRadius: 0,
          hoverRadius: 0,
        },
      },
      events: ["click"],
      onClick,
    },
  });
  chart.draw();
  updateChart(config.value);

  watch(
    config,
    (config) => {
      updateChart(config);
    },
    { deep: true },
  );
  store.addEventListener("changePosition", updateChartLazy);
  store.addEventListener("updateRecordTree", updateChartLazy);
  store.addEventListener("updateCustomData", updateChartLazy);
});

onUnmounted(() => {
  chart.destroy();
  lazy.clear();
  store.removeEventListener("changePosition", updateChartLazy);
  store.removeEventListener("updateRecordTree", updateChartLazy);
  store.removeEventListener("updateCustomData", updateChartLazy);
});

const style = computed(() => {
  return {
    height: `${props.size.height}px`,
    width: `${props.size.width}px`,
  };
});
</script>

<style scoped>
.root {
  background-color: var(--chart-bg-color);
}
</style>
