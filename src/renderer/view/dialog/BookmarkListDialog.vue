<template>
  <DialogFrame @cancel="onClose">
    <div class="title">{{ t.bookmarkList }}</div>
    <div>
      <div v-for="bookmark of bookmarks" :key="bookmark" class="bookmark">
        <button :disabled="isJumpDisabled" @click="onSelectBookmark(bookmark)">
          {{ bookmark }}
        </button>
      </div>
    </div>
    <div class="main-buttons">
      <button autofocus data-hotkey="Escape" @click="onClose()">
        {{ t.close }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { AppState } from "@/common/control/state";
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { computed } from "vue";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const emit = defineEmits<{
  close: [];
}>();
const bookmarks = store.record.bookmarks;
const isJumpDisabled = computed(() => store.appState !== AppState.NORMAL);

const onClose = () => {
  emit("close");
};

const onSelectBookmark = (bookmark: string) => {
  onClose();
  store.jumpToBookmark(bookmark);
};
</script>

<style scoped>
.bookmark {
  text-align: left;
  margin: 10px 0;
}
.bookmark > button {
  width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
