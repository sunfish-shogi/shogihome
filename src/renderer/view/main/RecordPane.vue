<template>
  <div ref="root" class="column record-pane">
    <div class="auto record">
      <RecordView
        :record="store.record"
        :position-counts="positionCounts"
        :operational="isRecordOperational"
        :show-comment="showComment"
        :show-elapsed-time="showElapsedTime"
        :sub-area-toggle-label="t.book"
        :opacity="appSettings.enableTransparent ? appSettings.recordOpacity : 1"
        :show-top-control="showTopControl"
        :show-bottom-control="showBottomControl"
        :show-branches="showBranches"
        :shortcut-keys="getRecordShortcutKeys(appSettings.recordShortcutKeys)"
        @go-begin="store.changePly(0)"
        @go-back="store.goBack()"
        @go-forward="store.goForward()"
        @go-end="store.changePly(Number.MAX_SAFE_INTEGER)"
        @select-move="(ply) => store.changePly(ply)"
        @select-branch="(index) => store.changeBranch(index)"
        @back-to-main-branch="store.backToMainBranch()"
        @swap-with-previous-branch="store.swapWithPreviousBranch()"
        @swap-with-next-branch="store.swapWithNextBranch()"
        @show-duplicate-positions="showDuplicatePositions"
        @toggle-show-elapsed-time="onToggleElapsedTime"
        @toggle-show-comment="onToggleComment"
      >
        <template #sub-area>
          <BookPanel class="full" />
        </template>
      </RecordView>
    </div>
    <div v-if="store.remoteRecordFileURL">
      <button class="wide" @click="store.loadRemoteRecordFile()">{{ t.fetchLatestData }}</button>
    </div>
    <DuplicatePositionsDialog
      v-if="store.appState === AppState.NORMAL && duplicatePositionsDialog"
      :sfen="duplicatePositionsDialog"
      @select="changeNode"
      @close="duplicatePositionsDialog = ''"
    />
  </div>
</template>

<script lang="ts">
export const minWidth = 200;
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import RecordView from "@/renderer/view/primitive/RecordView.vue";
import { useStore } from "@/renderer/store";
import { AppState } from "@/common/control/state.js";
import {
  installHotKeyForMainWindow,
  uninstallHotKeyForMainWindow,
} from "@/renderer/devices/hotkey";
import { useAppSettings } from "@/renderer/store/settings";
import BookPanel from "./BookPanel.vue";
import { getRecordShortcutKeys } from "@/renderer/view/primitive/board/shortcut";
import DuplicatePositionsDialog from "@/renderer/view/dialog/DuplicatePositionsDialog.vue";
import { ImmutableNode } from "tsshogi";

defineProps({
  showElapsedTime: {
    type: Boolean,
    required: false,
  },
  showComment: {
    type: Boolean,
    required: false,
  },
  showTopControl: {
    type: Boolean,
    required: false,
    default: true,
  },
  showBottomControl: {
    type: Boolean,
    required: false,
    default: true,
  },
  showBranches: {
    type: Boolean,
    required: false,
    default: true,
  },
});

const store = useStore();
const appSettings = useAppSettings();
const root = ref();
const duplicatePositionsDialog = ref("");

onMounted(() => {
  installHotKeyForMainWindow(root.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForMainWindow(root.value);
});

const positionCounts = computed(() =>
  appSettings.liveDuplicatePositionDetection ? store.positionCounts : undefined,
);
const isRecordOperational = computed(() => store.appState === AppState.NORMAL);

const showDuplicatePositions = (sfen: string) => {
  duplicatePositionsDialog.value = sfen;
};

const changeNode = (node: ImmutableNode) => {
  store.changeNode(node);
  duplicatePositionsDialog.value = "";
};

const onToggleElapsedTime = (enabled: boolean) => {
  appSettings.updateAppSettings({
    showElapsedTimeInRecordView: enabled,
  });
};

const onToggleComment = (enabled: boolean) => {
  appSettings.updateAppSettings({
    showCommentInRecordView: enabled,
  });
};
</script>

<style scoped>
.record-pane {
  box-sizing: border-box;
}
.record {
  width: 100%;
  min-height: 0;
}
button.wide {
  width: 100%;
}
</style>
