<template>
  <div ref="root" class="column record-pane">
    <div class="auto record">
      <RecordView
        :record="store.record"
        :operational="isRecordOperational"
        :show-book="showBook"
        :show-comment="showComment"
        :show-elapsed-time="showElapsedTime"
        :book-toggle-label="'定跡'"
        :elapsed-time-toggle-label="t.elapsedTime"
        :comment-toggle-label="t.commentsAndBookmarks"
        :opacity="appSettings.enableTransparent ? appSettings.recordOpacity : 1"
        :show-top-control="showTopControl"
        :show-bottom-control="showBottomControl"
        :show-branches="showBranches"
        @go-begin="store.changePly(0)"
        @go-back="store.goBack()"
        @go-forward="store.goForward()"
        @go-end="store.changePly(Number.MAX_SAFE_INTEGER)"
        @select-move="(ply) => store.changePly(ply)"
        @select-branch="(index) => store.changeBranch(index)"
        @swap-with-previous-branch="store.swapWithPreviousBranch()"
        @swap-with-next-branch="store.swapWithNextBranch()"
        @toggle-show-book="onToggleBook"
        @toggle-show-elapsed-time="onToggleElapsedTime"
        @toggle-show-comment="onToggleComment"
      >
        <template #book>
          <div class="full column">
            <BookView class="book-list" :position="store.record.position" :moves="bookMoves" />
            <div class="row control">
              <button @click="onOpenBook">定跡を開く</button>
            </div>
          </div>
        </template>
      </RecordView>
    </div>
    <div v-if="store.remoteRecordFileURL">
      <button class="wide" @click="store.loadRemoteRecordFile()">{{ t.fetchLatestData }}</button>
    </div>
  </div>
</template>

<script lang="ts">
export const minWidth = 200;
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import RecordView from "@/renderer/view/primitive/RecordView.vue";
import BookView from "@/renderer/view/primitive/BookView.vue";
import { useStore } from "@/renderer/store";
import { AppState } from "@/common/control/state.js";
import {
  installHotKeyForMainWindow,
  uninstallHotKeyForMainWindow,
} from "@/renderer/devices/hotkey";
import { useAppSettings } from "@/renderer/store/settings";
import api from "@/renderer/ipc/api";
import { BookMove } from "@/common/book";
import { useErrorStore } from "@/renderer/store/error";

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
const showBook = ref(false);
const bookMoves = ref([] as BookMove[]);

onMounted(() => {
  installHotKeyForMainWindow(root.value);
  store.addEventListener("changePosition", reloadBookMoves);
  store.addEventListener("openBook", reloadBookMoves);
});

onBeforeUnmount(() => {
  uninstallHotKeyForMainWindow(root.value);
  store.removeEventListener("changePosition", reloadBookMoves);
  store.removeEventListener("openBook", reloadBookMoves);
});

const onToggleBook = (enabled: boolean) => {
  showBook.value = enabled;
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

const onOpenBook = () => {
  store.openBook();
};

const reloadBookMoves = async () => {
  try {
    const sfen = store.record.position.sfen;
    bookMoves.value = await api.searchBookMoves(sfen);
  } catch (e) {
    useErrorStore().add(e);
  }
};

const isRecordOperational = computed(() => {
  return store.appState === AppState.NORMAL;
});
</script>

<style scoped>
.record-pane {
  box-sizing: border-box;
}
.record {
  width: 100%;
  min-height: 0;
}
.book-list {
  height: calc(100% - 25px);
}
.control > button {
  height: 25px;
  font-size: 14px;
}
button.wide {
  width: 100%;
}
</style>
