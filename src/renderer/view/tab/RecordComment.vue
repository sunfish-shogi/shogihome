<template>
  <div>
    <div ref="root" class="full column root" @copy.stop @paste.stop>
      <textarea class="auto text" :value="comment" :readonly="readonly" @input="change"> </textarea>
      <div class="row wrap-reverse">
        <div v-if="showBookmark" class="bookmark-area">
          <input
            type="text"
            class="bookmark"
            :value="bookmark"
            :readonly="readonly"
            :placeholder="t.bookmark"
            @input="changeBookmark"
          />
          <button class="list" @click="openBookmarkList">
            <span>{{ t.bookmarkList }}</span>
          </button>
        </div>
        <div v-if="pvs.length !== 0" class="row play-buttons">
          <button v-for="(pv, index) of pvs" :key="index" class="play" @click="play(pv)">
            <Icon :icon="IconType.PLAY" />
            <span>{{ t.pv }}{{ pvs.length >= 2 ? " " + (index + 1) : "" }}</span>
          </button>
        </div>
      </div>
    </div>
    <BookmarkListDialog
      v-if="bookmarkListDialogVisible"
      @close="bookmarkListDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { AppState } from "@/common/control/state.js";
import { computed, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { Move } from "tsshogi";
import BookmarkListDialog from "@/renderer/view/dialog/BookmarkListDialog.vue";

defineProps({
  showBookmark: {
    type: Boolean,
    default: true,
  },
});

const store = useStore();
const readonly = computed(() => store.appState != AppState.NORMAL);
const comment = computed(() => store.record.current.comment);
const pvs = computed(() => store.inCommentPVs);
const bookmark = computed(() => store.record.current.bookmark);
const bookmarkListDialogVisible = ref(false);

const change = (event: Event) => {
  const comment = (event.target as HTMLTextAreaElement).value;
  store.updateRecordComment(comment);
};

const changeBookmark = (event: Event) => {
  const bookmark = (event.target as HTMLInputElement).value;
  store.updateRecordBookmark(bookmark);
};

const openBookmarkList = () => {
  bookmarkListDialogVisible.value = true;
};

const play = (pv: Move[]) => {
  store.showPVPreviewDialog({
    position: store.record.position,
    pv: pv,
  });
};
</script>

<style scoped>
.root {
  background-color: var(--main-bg-color);
}
.text {
  width: 100%;
  resize: none;
  box-sizing: border-box;
}
.play-buttons {
  padding: 1px 0px 1px 0px;
  height: 28px;
}
button {
  height: 27px;
  line-height: 25px;
  font-size: 16px;
  padding-left: 5px;
  padding-right: 5px;
}
.bookmark-area {
  padding: 1px 0px 1px 0px;
  margin-right: 5px;
  height: 28px;
  text-align: left;
  white-space: nowrap;
}
.bookmark-area > * {
  vertical-align: middle;
}
.bookmark {
  max-width: 250px;
  margin-right: 5px;
}
</style>
