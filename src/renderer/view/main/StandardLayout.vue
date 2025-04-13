<template>
  <div>
    <Splitpanes
      class="main-frame"
      horizontal
      :maximize-panes="false"
      :dbl-click-splitter="false"
      @resize="onResizeMain"
      @resized="onResizedMain"
    >
      <Pane :size="topPaneHeightPercentage">
        <div class="full column">
          <div class="row">
            <ControlPane
              v-if="appSettings.boardLayoutType !== BoardLayoutType.STANDARD"
              class="compact-control"
              :group="ControlGroup.All"
              :compact="true"
            />
            <BoardPane
              :style="boardPaneStyle"
              :max-size="boardPaneMaxSize"
              :left-control-type="appSettings.leftSideControlType"
              :right-control-type="appSettings.rightSideControlType"
              @resize="onBoardPaneResize"
            />
            <RecordPane
              :style="recordPaneStyle"
              :show-comment="appSettings.showCommentInRecordView"
              :show-elapsed-time="appSettings.showElapsedTimeInRecordView"
            />
          </div>
          <button
            v-if="!isBottomPaneVisible"
            class="unhide-tabview-button"
            @click="onUnhideTabView"
          >
            <Icon :icon="IconType.ARROW_UP" />
            <span>{{ t.expandTabView }}</span>
          </button>
        </div>
      </Pane>
      <Pane :size="bottomPaneHeightPercentage">
        <TabPane
          v-if="appSettings.tabPaneType === TabPaneType.SINGLE"
          class="full"
          :size="tabPaneSize"
          :visible-tabs="[
            Tab.RECORD_INFO,
            Tab.COMMENT,
            Tab.SEARCH,
            Tab.PV,
            Tab.CHART,
            Tab.PERCENTAGE_CHART,
            Tab.MONITOR,
          ]"
          :active-tab="appSettings.tab"
          :display-minimize-toggle="true"
          @on-change-tab="onChangeTab"
          @on-minimize="onMinimizeTab"
        />
        <Splitpanes
          v-else
          class="bottom-frame"
          vertical
          :maximize-panes="false"
          :dbl-click-splitter="false"
          @resize="onResizeBottom"
          @resized="onResizedBottom"
        >
          <Pane :size="bottomLeftPaneWidthPercentage">
            <TabPane
              class="full"
              :size="tabPaneSize"
              :visible-tabs="[Tab.RECORD_INFO, Tab.SEARCH, Tab.PV, Tab.MONITOR]"
              :active-tab="appSettings.tab"
              @on-change-tab="onChangeTab"
            />
          </Pane>
          <Pane>
            <TabPane
              v-if="appSettings.tabPaneType === TabPaneType.DOUBLE"
              class="full"
              :size="tabPaneSize2"
              :visible-tabs="[Tab.COMMENT, Tab.CHART, Tab.PERCENTAGE_CHART]"
              :active-tab="appSettings.tab2"
              :display-minimize-toggle="true"
              @on-change-tab="onChangeTab2"
              @on-minimize="onMinimizeTab"
            />
            <div v-else class="full column">
              <TabPane
                class="shadow-bottom margin-bottom"
                :size="tabPaneSize2a"
                :visible-tabs="[Tab.CHART, Tab.PERCENTAGE_CHART]"
                :active-tab="appSettings.tab2"
                :display-minimize-toggle="true"
                @on-change-tab="onChangeTab2"
                @on-minimize="onMinimizeTab"
              />
              <RecordComment class="full" />
            </div>
          </Pane>
        </Splitpanes>
      </Pane>
    </Splitpanes>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { reactive, onMounted, onUnmounted, computed, ref } from "vue";
import BoardPane from "./BoardPane.vue";
import RecordPane, { minWidth as minRecordWidth } from "./RecordPane.vue";
import TabPane, { headerHeight as tabHeaderHeight } from "./TabPane.vue";
import RecordComment from "@/renderer/view/tab/RecordComment.vue";
import ControlPane, { ControlGroup } from "./ControlPane.vue";
import { RectSize } from "@/common/assets/geometry";
import { AppSettingsUpdate, Tab, TabPaneType } from "@/common/settings/app";
import { BoardLayoutType } from "@/common/settings/layout";
import api from "@/renderer/ipc/api";
import { LogLevel } from "@/common/log";
import { toString } from "@/common/helpers/string";
import { Lazy } from "@/renderer/helpers/lazy";
import { Splitpanes, Pane } from "splitpanes";
import "splitpanes/dist/splitpanes.css";
import { IconType } from "@/renderer/assets/icons";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { useAppSettings } from "@/renderer/store/settings";

const splitterWidth = 8;
const margin = 10;
const lazyUpdateDelay = 100;

const appSettings = useAppSettings();
const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));
const topPaneHeightPercentage = ref(appSettings.topPaneHeightPercentage);
const bottomLeftPaneWidthPercentage = ref(appSettings.bottomLeftPaneWidthPercentage);
const boardPaneSize = reactive(new RectSize(0, 0));

const windowLazyUpdate = new Lazy();
const updateSize = () => {
  windowLazyUpdate.after(() => {
    windowSize.width = window.innerWidth;
    windowSize.height = window.innerHeight;
  }, lazyUpdateDelay);
};

onMounted(() => {
  window.addEventListener("resize", updateSize);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateSize);
});

const onBoardPaneResize = (size: RectSize) => {
  boardPaneSize.width = size.width;
  boardPaneSize.height = size.height;
};

const updateAppSettings = (update: AppSettingsUpdate) => {
  appSettings.updateAppSettings(update).catch((e) => {
    api.log(LogLevel.WARN, "StandardLayout: failed to update app settings: " + toString(e));
  });
};

const onChangeTab = (tab: Tab) => {
  updateAppSettings({ tab });
};
const onChangeTab2 = (tab2: Tab) => {
  updateAppSettings({ tab2 });
};

const onMinimizeTab = () => {
  topPaneHeightPercentage.value = 100;
  updateAppSettings({ topPaneHeightPercentage: 100 });
};

const onUnhideTabView = () => {
  const newValue = Math.min(
    appSettings.topPanePreviousHeightPercentage,
    ((windowSize.height - tabHeaderHeight * 2 - splitterWidth) / windowSize.height) * 100,
  );
  topPaneHeightPercentage.value = newValue;
  updateAppSettings({ topPaneHeightPercentage: newValue });
};

const mainLazyUpdate = new Lazy();
const onResizeMain = (args: { panes: { size: number }[] }) => {
  const newValue = args.panes[0].size;
  mainLazyUpdate.after(() => {
    topPaneHeightPercentage.value = newValue;
  }, lazyUpdateDelay);
};
const onResizedMain = (args: { panes: { size: number }[] }) => {
  mainLazyUpdate.clear();
  const newValue = args.panes[0].size;
  topPaneHeightPercentage.value = newValue;
  updateAppSettings({ topPaneHeightPercentage: newValue });
};

const bottomLazyUpdate = new Lazy();
const onResizeBottom = (args: { panes: { size: number }[] }) => {
  const newValue = args.panes[0].size;
  bottomLazyUpdate.after(() => {
    bottomLeftPaneWidthPercentage.value = newValue;
  }, lazyUpdateDelay);
};
const onResizedBottom = (args: { panes: { size: number }[] }) => {
  bottomLazyUpdate.clear();
  const newValue = args.panes[0].size;
  bottomLeftPaneWidthPercentage.value = newValue;
  updateAppSettings({ bottomLeftPaneWidthPercentage: newValue });
};

const isBottomPaneVisible = computed(() => {
  return (windowSize.height * bottomPaneHeightPercentage.value) / 100 >= tabHeaderHeight;
});

const boardPaneMaxSize = computed(() => {
  return new RectSize(
    Math.max(
      (windowSize.width - minRecordWidth - margin * 2) *
        (appSettings.boardLayoutType === BoardLayoutType.STANDARD ? 1.0 : 0.9),
      0,
    ),
    Math.max(
      (windowSize.height - splitterWidth) * (topPaneHeightPercentage.value / 100) -
        margin * 2 -
        (isBottomPaneVisible.value ? 0 : tabHeaderHeight),
      0,
    ),
  );
});

const boardPaneStyle = computed(() => {
  return {
    margin: `${margin}px`,
  };
});

const recordPaneStyle = computed(() => {
  const width =
    windowSize.width -
    boardPaneSize.width -
    margin * 3 -
    (appSettings.boardLayoutType === BoardLayoutType.STANDARD ? 0 : boardPaneSize.height * 0.1);
  const height = boardPaneSize.height;
  return {
    margin: `${margin}px ${margin}px ${margin}px 0`,
    width: `${width}px`,
    height: `${height}px`,
  };
});

const bottomPaneHeightPercentage = computed(() => {
  return 100 - topPaneHeightPercentage.value;
});

const tabPaneSize = computed(() => {
  return new RectSize(
    appSettings.tabPaneType === TabPaneType.SINGLE
      ? windowSize.width
      : (windowSize.width - splitterWidth) * (bottomLeftPaneWidthPercentage.value / 100),
    (windowSize.height - splitterWidth) * (bottomPaneHeightPercentage.value / 100),
  );
});

const tabPaneSize2 = computed(() => {
  return new RectSize(
    (windowSize.width - splitterWidth) * (1.0 - bottomLeftPaneWidthPercentage.value / 100),
    (windowSize.height - splitterWidth) * (bottomPaneHeightPercentage.value / 100),
  );
});

const tabPaneSize2a = computed(
  () =>
    new RectSize(
      tabPaneSize2.value.width,
      Math.min(
        Math.max(tabPaneSize2.value.width * 0.5, 150),
        tabPaneSize2.value.height * 0.2 + 100,
      ),
    ),
);
</script>

<style>
.main-frame.splitpanes--horizontal > .splitpanes__splitter {
  height: 8px;
  cursor: ns-resize;
}
.bottom-frame.splitpanes--vertical > .splitpanes__splitter {
  width: 8px;
  cursor: ew-resize;
}
.main-frame .splitpanes__splitter {
  background-color: transparent;
}
.main-frame .splitpanes__splitter:hover {
  background-color: #1e90ff;
}
.bottom-frame.splitpanes--vertical > .splitpanes__pane {
  box-shadow: 6px 0px 6px -3px var(--shadow-color);
}
</style>

<style scoped>
.shadow-bottom {
  box-shadow: 0px 6px 6px -3px var(--shadow-color);
}
.margin-bottom {
  margin-bottom: 8px;
}
.compact-control {
  margin-top: 10px;
  margin-bottom: 10px;
}
.unhide-tabview-button {
  width: 100%;
  height: 30px;
  font-size: 100%;
  text-align: center;
  line-height: 180%;
  padding: 0 5% 0 5%;
}
</style>
