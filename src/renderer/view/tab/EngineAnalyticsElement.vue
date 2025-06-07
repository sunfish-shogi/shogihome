<template>
  <div>
    <div class="full column root" :class="{ paused }">
      <div v-if="showHeader && isResearchSession" class="overlay-control row reverse">
        <button v-if="paused" @click="onUnpause">
          <Icon :icon="IconType.RESUME" />
          <span>{{ t.resume }}</span>
        </button>
        <button v-else @click="onPause">
          <Icon :icon="IconType.PAUSE" />
          <span>{{ t.stop }}</span>
        </button>
      </div>
      <div v-if="showHeader" class="row headers">
        <div class="header">
          <span>{{ t.name }}: </span>
          <span>{{ monitor.name }}</span>
        </div>
        <div class="header">
          <span>{{ t.prediction }}: </span>
          <span>
            {{ monitor.ponderMove ? monitor.ponderMove : "---" }}
          </span>
        </div>
        <div class="header">
          <span>{{ t.best }}: </span>
          <span>{{ monitor.currentMoveText || "---" }}</span>
        </div>
        <div class="header">
          <span>NPS: </span>
          <span>{{ (monitor.nps && formatNodeCount(monitor.nps)) || "---" }}</span>
        </div>
        <div class="header">
          <span>{{ t.nodes }}: </span>
          <span>{{ (monitor.nodes && formatNodeCount(monitor.nodes)) || "---" }}</span>
        </div>
        <div class="header">
          <span>{{ t.hashUsage }}: </span>
          <span>{{ monitor.hashfull ? (monitor.hashfull * 100).toFixed(1) : "---" }} %</span>
        </div>
      </div>
      <div class="list-area" :style="{ height: `${height - (showHeader ? 22 : 0)}px` }">
        <table class="list">
          <thead>
            <tr ref="listHeader" class="list-header">
              <td v-if="showTimeColumn" class="time" :style="columnStyleMap['time']">
                {{ t.elapsed }}
              </td>
              <td
                v-if="showMultiPvColumn"
                class="multipv-index"
                :style="columnStyleMap['multipv-index']"
              >
                {{ t.rank }}
              </td>
              <td v-if="showDepthColumn" class="depth" :style="columnStyleMap['depth']">
                {{ t.depth }}
              </td>
              <td v-if="showNodesColumn" class="nodes" :style="columnStyleMap['nodes']">
                {{ t.nodes }}
              </td>
              <td v-if="showScoreColumn" class="score" :style="columnStyleMap['score']">
                {{ t.score }}
              </td>
              <td
                v-if="showScoreColumn"
                class="score-flag"
                :style="columnStyleMap['score-flag']"
              ></td>
              <td class="text">{{ t.pv }}</td>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="info in historyMode ? monitor.infoList : monitor.latestInfo"
              :key="info.id"
              class="list-item"
              :class="{ highlight: enableHighlight && info.multiPV === 1 }"
            >
              <td v-if="showTimeColumn" class="time">
                {{ info.timeMs ? (info.timeMs / 1e3).toFixed(1) + "s" : "" }}
              </td>
              <td v-if="showMultiPvColumn" class="multipv-index">
                {{ info.multiPV || "" }}
              </td>
              <td v-if="showDepthColumn" class="depth">
                {{ info.depth
                }}{{ info.selectiveDepth !== undefined && info.depth !== undefined ? "/" : ""
                }}{{ info.selectiveDepth }}
              </td>
              <td v-if="showNodesColumn" class="nodes">
                {{ info.nodes && formatNodeCount(info.nodes) }}
              </td>
              <td v-if="showScoreColumn" class="score">
                {{
                  info.scoreMate !== undefined
                    ? getDisplayScore(info.scoreMate, info.color, evaluationViewFrom)
                    : info.score !== undefined
                      ? getDisplayScore(info.score, info.color, evaluationViewFrom)
                      : ""
                }}
              </td>
              <td v-if="showScoreColumn" class="score-flag">
                {{ info.lowerBound ? "++" : "" }}
                {{ info.upperBound ? "--" : "" }}
                {{ info.scoreMate ? t.mateShort : "" }}
              </td>
              <td class="text">
                <button
                  v-if="showPlayButton && info.pv && info.pv.length !== 0 && info.text"
                  @click="showPreview(info)"
                >
                  <Icon :icon="IconType.PLAY" />
                  <span>{{ t.displayPVShort }}</span>
                </button>
                {{ info.text }}
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="showSuggestionsCount && isResearchSession && !historyMode && multiPV"
          class="multi-pv-control"
        >
          <span>{{ t.suggestionsCount }}</span>
          <input
            ref="multiPVInput"
            type="number"
            min="1"
            :value="multiPV"
            @input="updateMultiPV(0)"
          />
          <button @click="updateMultiPV(1)">
            <Icon :icon="IconType.ARROW_DROP" /><span>+1</span>
          </button>
          <button @click="updateMultiPV(-1)">
            <Icon :icon="IconType.ARROW_UP" /><span>-1</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
const suggestionsCountLimit = 10;
let ignoreSuggestionsCountLimit = false;
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { USIInfo, USIPlayerMonitor } from "@/renderer/store/usi";
import { computed, onBeforeUpdate, reactive, ref } from "vue";
import { IconType } from "@/renderer/assets/icons";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { EvaluationViewFrom, NodeCountFormat } from "@/common/settings/app";
import { Color, Move, Position } from "tsshogi";
import { useAppSettings } from "@/renderer/store/settings";
import { useStore } from "@/renderer/store";
import { readInputAsNumber } from "@/renderer/helpers/form";
import { useConfirmationStore } from "@/renderer/store/confirm";

const props = defineProps({
  historyMode: { type: Boolean, required: true },
  monitor: { type: USIPlayerMonitor, required: true },
  height: { type: Number, required: true },
  showHeader: { type: Boolean, default: true },
  showTimeColumn: { type: Boolean, default: true },
  showMultiPvColumn: { type: Boolean, default: true },
  showDepthColumn: { type: Boolean, default: true },
  showNodesColumn: { type: Boolean, default: true },
  showScoreColumn: { type: Boolean, default: true },
  showPlayButton: { type: Boolean, default: true },
  showSuggestionsCount: { type: Boolean, default: true },
});

const store = useStore();
const appSettings = useAppSettings();
const listHeader = ref();
const columnWidthMap = {} as { [key: string]: number };
const columnStyleMap = reactive({} as { [key: string]: { minWidth: string } });
const multiPVInput = ref();

onBeforeUpdate(() => {
  for (const column of (listHeader.value as HTMLElement).childNodes) {
    if (column instanceof HTMLElement) {
      const className = column.className;
      const width = column.offsetWidth;
      const oldWidth = columnWidthMap[className] || 0;
      if (width > oldWidth) {
        columnWidthMap[className] = width;
        columnStyleMap[className] = { minWidth: `${width}px` };
      }
    }
  }
});

const isResearchSession = computed(() => {
  return store.isResearchEngineSessionID(props.monitor.sessionID);
});

const paused = computed(() => {
  return store.isPausedResearchEngine(props.monitor.sessionID);
});

const formatNodeCount = computed(() => {
  switch (appSettings.nodeCountFormat) {
    case NodeCountFormat.COMMA_SEPARATED:
      return (count: number) => count.toLocaleString();
    case NodeCountFormat.COMPACT:
      return Intl.NumberFormat("en-US", { notation: "compact" }).format;
    case NodeCountFormat.JAPANESE:
      return Intl.NumberFormat("ja-JP", { notation: "compact" }).format;
    default:
      return (count: number) => count.toString();
  }
});

const multiPV = computed(() => {
  return store.getResearchMultiPV(props.monitor.sessionID);
});

const enableHighlight = computed(() => {
  if (!props.historyMode) {
    return false;
  }
  return props.monitor.infoList.some((info) => info.multiPV && info.multiPV !== 1);
});

const evaluationViewFrom = computed(() => {
  return appSettings.evaluationViewFrom;
});
const getDisplayScore = (score: number, color: Color, evaluationViewFrom: EvaluationViewFrom) => {
  return evaluationViewFrom === EvaluationViewFrom.EACH || color == Color.BLACK ? score : -score;
};

const showPreview = (ite: USIInfo) => {
  const position = Position.newBySFEN(ite.position);
  if (!position) {
    return;
  }
  const pos = position.clone();
  const pv: Move[] = [];
  for (const usiMove of ite.pv || []) {
    const move = pos.createMoveByUSI(usiMove);
    if (!move || !pos.doMove(move)) {
      break;
    }
    pv.push(move);
  }
  useStore().showPVPreviewDialog({
    position,
    engineName: props.monitor.name,
    multiPV: ite.multiPV,
    depth: ite.depth,
    selectiveDepth: ite.selectiveDepth,
    score: ite.score,
    mate: ite.scoreMate,
    lowerBound: ite.lowerBound,
    upperBound: ite.upperBound,
    pv,
  });
};

const onPause = () => {
  store.pauseResearchEngine(props.monitor.sessionID);
};

const onUnpause = () => {
  store.unpauseResearchEngine(props.monitor.sessionID);
};

const updateMultiPV = (add: number) => {
  const value = readInputAsNumber(multiPVInput.value);
  if (!value) {
    return;
  }
  const newValue = value + add;

  // Confirm if the suggestions count is too large
  if (
    !ignoreSuggestionsCountLimit &&
    multiPV.value &&
    newValue > multiPV.value &&
    newValue > suggestionsCountLimit
  ) {
    useConfirmationStore().show({
      message: `${t.largeSuggestionsCountMayCausePerformanceDegradation} ${t.doYouReallyWantToIncreaseTheSuggestionsCount}`,
      onOk: () => {
        // Ignore the limit and update the value
        ignoreSuggestionsCountLimit = true;
        store.setResearchMultiPV(props.monitor.sessionID, newValue);
      },
      onCancel: () => {
        // Restore the value
        multiPVInput.value.value = multiPV.value?.toFixed(0) || "";
      },
    });
    return;
  }

  // Otherwise, update the value
  store.setResearchMultiPV(props.monitor.sessionID, newValue);
};
</script>

<style scoped>
.root {
  position: relative;
  padding-bottom: 2px;
  background-color: var(--active-tab-bg-color);
}
.overlay-control {
  position: absolute;
  width: 100%;
  margin: 0px 0px 0px 0px;
}
.headers {
  width: 100%;
  height: 22px;
  text-align: left;
}
.header {
  margin: 0px 5px 0px 0px;
  padding: 0px 5px 0px 5px;
  background-color: var(--text-bg-color);
}
.paused .header {
  background-color: var(--text-bg-color-disabled);
}
.header span {
  font-size: 12px;
  white-space: nowrap;
}
.list-area {
  width: 100%;
  overflow-y: scroll;
  background-color: var(--text-bg-color);
}
.paused .list-area {
  background-color: var(--text-bg-color-disabled);
}
table.list {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
}
tr.list-header > td {
  height: 16px;
  width: 100%;
  font-size: 12px;
  background-color: var(--text-bg-color);
  position: sticky;
  top: 0;
  left: 0;
}
.paused tr.list-header > td {
  background-color: var(--text-bg-color-disabled);
}
tr.list-item > td {
  height: 24px;
  font-size: 12px;
}
tr.list-item.highlight > td {
  background: var(--text-bg-color-warning);
  border-bottom: dashed var(--text-separator-color) 1px;
}
table.list td {
  box-sizing: border-box;
  border: 0;
  padding: 0;
  height: 100%;
  white-space: nowrap;
  overflow: hidden;
  padding-left: 4px;
}
table.list td.time {
  width: 0;
  text-align: right;
}
table.list td.multipv-index {
  width: 0;
  text-align: right;
}
table.list td.depth {
  width: 0;
  text-align: right;
}
table.list td.nodes {
  width: 0;
  text-align: right;
}
table.list td.score {
  width: 0;
  text-align: right;
}
table.list td.score-flag {
  width: 0;
  text-align: left;
}
table.list td.text {
  max-width: 0;
  text-align: left;
  text-overflow: ellipsis;
  overflow: hidden;
}
button {
  margin: 0px 0px 1px 0px;
  padding: 1px 5px 1px 2px;
  height: 22px;
  vertical-align: middle;
}
.icon {
  height: 18px;
}
button span {
  line-height: 19px;
}
.multi-pv-control {
  font-size: 12px;
  text-align: left;
}
.multi-pv-control > * {
  margin: 0px 0px 0px 5px;
}
.multi-pv-control input {
  width: 40px;
  font-size: 12px;
  text-align: right;
}
</style>
