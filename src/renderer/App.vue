<template>
  <div class="root full" :class="appSetting.thema" :style="style">
    <StandardLayout class="full" />
    <GameDialog v-if="dialogVisibilities.game" />
    <CSAGameDialog v-if="dialogVisibilities.csaGame" />
    <ResearchDialog v-if="dialogVisibilities.research" />
    <AnalysisDialog v-if="dialogVisibilities.analysis" />
    <USIEngineManagementDialog v-if="dialogVisibilities.usiEngineSetting" />
    <ExportPositionImageDialog v-if="dialogVisibilities.exportPositionImage" />
    <AppSettingDialog v-if="dialogVisibilities.appSetting" />
    <PasteDialog v-if="dialogVisibilities.paste" />
    <BussyMessage v-if="dialogVisibilities.bussy" />
    <ConfirmDialog v-if="dialogVisibilities.confirm" />
    <CSAGameReadyDialog v-if="dialogVisibilities.csaGameReady" />
    <InfoMessage v-if="store.hasMessage" />
    <ErrorMessage v-if="store.hasError" />
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, onMounted } from "vue";
import StandardLayout from "@/renderer/view/main/StandardLayout.vue";
import GameDialog from "@/renderer/view/dialog/GameDialog.vue";
import CSAGameDialog from "@/renderer/view/dialog/CSAGameDialog.vue";
import ResearchDialog from "@/renderer/view/dialog/ResearchDialog.vue";
import USIEngineManagementDialog from "@/renderer/view/dialog/USIEngineManagementDialog.vue";
import ExportPositionImageDialog from "@/renderer/view/dialog/ExportPositionImageDialog.vue";
import AppSettingDialog from "@/renderer/view/dialog/AppSettingDialog.vue";
import PasteDialog from "@/renderer/view/dialog/PasteDialog.vue";
import BussyMessage from "@/renderer/view/dialog/BussyMessage.vue";
import ConfirmDialog from "@/renderer/view/dialog/ConfirmDialog.vue";
import InfoMessage from "@/renderer/view/dialog/InfoMessage.vue";
import ErrorMessage from "@/renderer/view/dialog/ErrorMessage.vue";
import { useStore } from "@/renderer/store";
import { AppState } from "@/common/control/state.js";
import AnalysisDialog from "@/renderer/view/dialog/AnalysisDialog.vue";
import CSAGameReadyDialog from "@/renderer/view/dialog/CSAGameReadyDialog.vue";
import { CSAGameState } from "@/renderer/store/csa";
import { useAppSetting } from "./store/setting";
import { BackgroundImageType } from "@/common/settings/app";

export default defineComponent({
  name: "App",
  components: {
    StandardLayout,
    GameDialog,
    CSAGameDialog,
    ResearchDialog,
    USIEngineManagementDialog,
    ExportPositionImageDialog,
    AppSettingDialog,
    PasteDialog,
    BussyMessage,
    ConfirmDialog,
    InfoMessage,
    ErrorMessage,
    AnalysisDialog,
    CSAGameReadyDialog,
  },
  setup() {
    const appSetting = useAppSetting();
    const store = useStore();

    const dialogVisibilities = computed(() => {
      return {
        game: store.appState === AppState.GAME_DIALOG,
        csaGame: store.appState === AppState.CSA_GAME_DIALOG,
        research: store.appState === AppState.RESEARCH_DIALOG,
        analysis: store.appState === AppState.ANALYSIS_DIALOG,
        usiEngineSetting: store.appState === AppState.USI_ENGINE_SETTING_DIALOG,
        exportPositionImage:
          store.appState === AppState.EXPORT_POSITION_IMAGE_DIALOG,
        appSetting: store.isAppSettingDialogVisible,
        paste: store.appState === AppState.PASTE_DIALOG,
        bussy: store.isBussy,
        confirm: store.confirmation !== undefined,
        csaGameReady:
          store.csaGameState === CSAGameState.WAITING_LOGIN ||
          store.csaGameState === CSAGameState.READY ||
          store.csaGameState === CSAGameState.LOGIN_RETRY_INTERVAL,
      };
    });

    onMounted(() => {
      const body = document.getElementsByTagName("body")[0];
      body.addEventListener("copy", (event) => {
        store.copyRecordKIF();
        event.preventDefault();
      });
      body.addEventListener("paste", (event) => {
        store.showPasteDialog();
        event.preventDefault();
      });
      body.addEventListener("dragover", (event: DragEvent) => {
        event.preventDefault();
      });
      body.addEventListener("drop", (event: DragEvent) => {
        if (event.dataTransfer && event.dataTransfer.files[0]) {
          const path = event.dataTransfer.files[0].path;
          store.openRecord(path);
        }
        event.preventDefault();
      });
    });

    const style = computed(() => {
      if (
        appSetting.backgroundImageType == BackgroundImageType.NONE ||
        !appSetting.backgroundImageFileURL
      ) {
        return {};
      }
      let size = "";
      switch (appSetting.backgroundImageType) {
        case BackgroundImageType.COVER:
          size = "cover";
          break;
        case BackgroundImageType.CONTAIN:
          size = "contain";
          break;
        case BackgroundImageType.TILE:
          size = "auto";
          break;
      }
      return {
        "background-image": `url("${appSetting.backgroundImageFileURL}")`,
        "background-size": size,
      };
    });

    return {
      style,
      appSetting,
      store,
      dialogVisibilities,
    };
  },
});
</script>

<style>
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-size: 17px;
  margin: 0;
}
body::-webkit-scrollbar {
  display: none;
}
#app {
  text-align: center;
  height: 100vh;
  width: 100vw;
}
</style>

<style scoped>
.root {
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
</style>
