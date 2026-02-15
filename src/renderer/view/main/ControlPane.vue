<template>
  <div>
    <div ref="root" class="full column" :class="{ compact }">
      <div
        v-if="group === ControlGroup.Group1 || group === ControlGroup.All"
        class="full column control-box"
      >
        <!-- 検討 -->
        <button
          v-show="store.researchState !== ResearchState.RUNNING"
          class="control-item"
          data-hotkey="Mod+r"
          @click="onToggleResearch"
        >
          <Icon :icon="IconType.RESEARCH" />
          <span :class="{ tooltip: compact }">{{ t.research }}</span>
        </button>
        <!-- 検討終了 -->
        <button
          v-show="store.researchState === ResearchState.RUNNING"
          class="control-item close"
          @click="onToggleResearch"
        >
          <Icon :icon="IconType.END" />
          <span :class="{ tooltip: compact }">{{ t.endResearch }}</span>
        </button>
        <!-- 対局 -->
        <button v-show="store.appState === AppState.NORMAL" class="control-item" @click="onGame">
          <Icon :icon="IconType.GAME" />
          <span :class="{ tooltip: compact }">{{ t.game }}</span>
        </button>
        <!-- 対局中断 -->
        <button
          v-show="store.appState === AppState.GAME || store.appState === AppState.CSA_GAME"
          class="control-item close"
          @click="onStop"
        >
          <Icon :icon="IconType.STOP" />
          <span :class="{ tooltip: compact }">{{ t.stopGame }}</span>
        </button>
        <!-- 勝ち宣言 -->
        <button
          v-show="
            store.isMovableByUser &&
            (store.appState === AppState.CSA_GAME ||
              (store.appState === AppState.GAME &&
                DeclarableJishogiRules.includes(store.gameSettings.jishogiRule)))
          "
          class="control-item close"
          @click="onWin"
        >
          <Icon :icon="IconType.CALL" />
          <span :class="{ tooltip: compact }">{{ t.declareWin }}</span>
        </button>
        <!-- 投了 -->
        <button
          v-show="
            (store.appState === AppState.GAME || store.appState === AppState.CSA_GAME) &&
            store.isMovableByUser
          "
          class="control-item close"
          @click="onResign"
        >
          <Icon :icon="IconType.RESIGN" />
          <span :class="{ tooltip: compact }">{{ t.resign }}</span>
        </button>
        <!-- 持将棋の点数 -->
        <button
          v-show="store.appState === AppState.GAME || store.appState === AppState.CSA_GAME"
          class="control-item"
          @click="onJishogiPoints"
        >
          <Icon :icon="IconType.QUESTION" />
          <span :class="{ tooltip: compact }">{{ t.jishogiPoints }}</span>
        </button>
        <!-- 戦績確認 -->
        <button
          v-show="store.appState === AppState.GAME && store.gameSettings.repeat >= 2"
          class="control-item"
          @click="onShowGameResults"
        >
          <Icon :icon="IconType.SCORE" />
          <span :class="{ tooltip: compact }">{{ t.displayGameResults }}</span>
        </button>
        <!-- 解析 -->
        <button
          v-show="store.appState === AppState.NORMAL"
          class="control-item"
          data-hotkey="Mod+a"
          @click="onAnalysis"
        >
          <Icon :icon="IconType.ANALYSIS" />
          <span :class="{ tooltip: compact }">{{ t.analysis }}</span>
        </button>
        <!-- 解析中断 -->
        <button
          v-show="store.appState === AppState.ANALYSIS"
          class="control-item close"
          @click="onEndAnalysis"
        >
          <Icon :icon="IconType.STOP" />
          <span :class="{ tooltip: compact }">{{ t.stopAnalysis }}</span>
        </button>
        <!-- 詰み探索 -->
        <button
          v-show="store.appState === AppState.NORMAL"
          class="control-item"
          data-hotkey="Mod+m"
          @click="onMateSearch"
        >
          <Icon :icon="IconType.MATE_SEARCH" />
          <span :class="{ tooltip: compact }">{{ t.mateSearch }}</span>
        </button>
        <!-- 詰み探索終了 -->
        <button
          v-show="store.appState === AppState.MATE_SEARCH"
          class="control-item close"
          @click="onStopMateSearch"
        >
          <Icon :icon="IconType.END" />
          <span :class="{ tooltip: compact }">{{ t.stopMateSearch }}</span>
        </button>
        <!-- 局面編集 -->
        <button
          v-show="store.appState === AppState.NORMAL"
          class="control-item"
          @click="onStartEditPosition"
        >
          <Icon :icon="IconType.EDIT" />
          <span :class="{ tooltip: compact }">{{ t.setupPosition }}</span>
        </button>
        <!-- 盤面編集終了 -->
        <button
          v-show="store.appState === AppState.POSITION_EDITING"
          class="control-item close"
          @click="onEndEditPosition"
        >
          <Icon :icon="IconType.CHECK" />
          <span :class="{ tooltip: compact }">{{ t.completePositionSetup }}</span>
        </button>
        <!-- 手番変更 -->
        <button
          v-show="store.appState === AppState.POSITION_EDITING"
          class="control-item"
          @click="onChangeTurn"
        >
          <Icon :icon="IconType.SWAP" />
          <span :class="{ tooltip: compact }">{{ t.changeTurn }}</span>
        </button>
        <!-- 局面の初期化 -->
        <button
          v-show="store.appState === AppState.POSITION_EDITING"
          class="control-item"
          @click="onInitPosition"
        >
          <Icon :icon="IconType.REFRESH" />
          <span :class="{ tooltip: compact }">{{ t.initializePosition }}</span>
        </button>
        <!-- 駒の増減 -->
        <button
          v-show="store.appState === AppState.POSITION_EDITING"
          class="control-item"
          @click="onPieceSetChange"
        >
          <Icon :icon="IconType.EQUALIZER" />
          <span :class="{ tooltip: compact }">{{ t.changePieceSet }}</span>
        </button>
      </div>
      <div
        v-if="group === ControlGroup.Group2 || group === ControlGroup.All"
        class="full column control-box"
      >
        <!-- 指し手削除 -->
        <button
          class="control-item"
          data-hotkey="Mod+d"
          :disabled="store.appState !== AppState.NORMAL"
          @click="onRemoveCurrentMove"
        >
          <Icon :icon="IconType.DELETE" />
          <span :class="{ tooltip: compact }">{{ t.deleteMove }}</span>
        </button>
        <!-- ファイル -->
        <button class="control-item" @click="onFileAction">
          <Icon :icon="IconType.FILE" />
          <span :class="{ tooltip: compact }">{{ t.file }}</span>
        </button>
        <!-- 盤面反転 -->
        <button class="control-item" data-hotkey="Mod+t" @click="onFlip">
          <Icon :icon="IconType.FLIP" />
          <span :class="{ tooltip: compact }">{{ t.flipBoard }}</span>
        </button>
        <!-- エンジン設定 -->
        <button
          class="control-item"
          data-hotkey="Mod+."
          :disabled="store.appState !== AppState.NORMAL"
          @click="onOpenEngines"
        >
          <Icon :icon="IconType.ENGINE_SETTINGS" />
          <span :class="{ tooltip: compact }">{{ t.manageEngines }}</span>
        </button>
        <!-- アプリ設定 -->
        <button class="control-item" data-hotkey="Mod+," @click="onOpenAppSettings">
          <Icon :icon="IconType.SETTINGS" />
          <span :class="{ tooltip: compact }">{{ t.appSettings }}</span>
        </button>
      </div>
      <GameMenu v-if="isGameMenuVisible" @close="isGameMenuVisible = false" />
      <FileMenu v-if="isFileMenuVisible" @close="isFileMenuVisible = false" />
      <InitialPositionMenu
        v-if="isInitialPositionMenuVisible"
        @close="isInitialPositionMenuVisible = false"
      />
    </div>
  </div>
</template>

<script lang="ts">
export enum ControlGroup {
  Group1,
  Group2,
  All,
}
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, PropType, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { AppState, ResearchState } from "@/common/control/state.js";
import { IconType } from "@/renderer/assets/icons";
import GameMenu from "@/renderer/view/menu/GameMenu.vue";
import FileMenu from "@/renderer/view/menu/FileMenu.vue";
import { DeclarableJishogiRules } from "@/common/settings/game";
import InitialPositionMenu from "@/renderer/view/menu/InitialPositionMenu.vue";
import { humanPlayer } from "@/renderer/players/human";
import { useAppSettings } from "@/renderer/store/settings";
import {
  installHotKeyForMainWindow,
  uninstallHotKeyForMainWindow,
} from "@/renderer/devices/hotkey";
import { useConfirmationStore } from "@/renderer/store/confirm";

defineProps({
  group: {
    type: Number as PropType<ControlGroup>,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const store = useStore();
const appSettings = useAppSettings();
const root = ref();
const isGameMenuVisible = ref(false);
const isFileMenuVisible = ref(false);
const isInitialPositionMenuVisible = ref(false);

onMounted(() => {
  installHotKeyForMainWindow(root.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForMainWindow(root.value);
});

const onGame = () => {
  isGameMenuVisible.value = true;
};

const onShowGameResults = () => {
  store.showGameResults();
};

const onStop = () => {
  store.stopGame();
};

const onWin = () => {
  useConfirmationStore().show({
    message: t.areYouSureWantToDoDeclaration,
    onOk: () => {
      humanPlayer.win();
    },
  });
};

const onResign = () => {
  useConfirmationStore().show({
    message: t.areYouSureWantToResign,
    onOk: () => {
      humanPlayer.resign();
    },
  });
};

const onJishogiPoints = () => {
  store.showJishogiPoints();
};

const onToggleResearch = () => {
  if (store.researchState === ResearchState.RUNNING) {
    store.stopResearch();
  } else {
    store.showResearchDialog();
  }
};

const onAnalysis = () => {
  store.showAnalysisDialog();
};

const onEndAnalysis = () => {
  store.stopAnalysis();
};

const onMateSearch = () => {
  store.showMateSearchDialog();
};

const onStopMateSearch = () => {
  store.stopMateSearch();
};

const onStartEditPosition = () => {
  store.startPositionEditing();
};

const onEndEditPosition = () => {
  store.endPositionEditing();
};

const onInitPosition = () => {
  isInitialPositionMenuVisible.value = true;
};

const onChangeTurn = () => {
  store.changeTurn();
};

const onPieceSetChange = () => {
  store.showPieceSetChangeDialog();
};

const onOpenAppSettings = () => {
  store.showAppSettingsDialog();
};

const onOpenEngines = () => {
  store.showUsiEngineManagementDialog();
};

const onFlip = () => {
  appSettings.flipBoard();
};

const onFileAction = () => {
  isFileMenuVisible.value = true;
};

const onRemoveCurrentMove = () => {
  store.removeCurrentMove();
};
</script>

<style scoped>
.control-item {
  width: 100%;
  height: 20%;
  font-size: 80%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  line-height: 200%;
  padding: 0 5% 0 5%;
}
.compact .control-item {
  text-align: center;
}
.control-item .icon {
  height: 68%;
}
.compact .control-item .icon {
  height: 48%;
}
.tooltip {
  display: none;
  position: absolute;
  color: var(--main-color);
  background-color: var(--main-bg-color);
  border: 1px solid var(--main-color);
  border-radius: 5px;
  padding: 5px;
  z-index: 100;
}
*:hover > .tooltip {
  display: block;
}
</style>
