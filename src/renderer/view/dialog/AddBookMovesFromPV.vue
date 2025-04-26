<template>
  <div>
    <dialog ref="dialog">
      <!-- TODO: i18n -->
      <div class="title">読み筋を定跡に登録</div>
      <div class="form-group">
        <div class="form-item">
          <div class="form-item-label">{{ t.depth }}</div>
          {{ t.toPrefix + t.plyPrefix }}
          <input v-model="maxDepth" type="number" min="1" max="100" step="1" />
          {{ t.plySuffix + t.toSuffix }}
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.score }}</div>
          <HorizontalSelector
            v-model:value="scoreTarget"
            :items="[
              { label: t.none, value: BookMoveInsertionFromPVScoreTarget.NONE },
              { label: t.firstMoveOnly, value: BookMoveInsertionFromPVScoreTarget.ROOT },
              { label: t.all, value: BookMoveInsertionFromPVScoreTarget.ALL },
            ]"
          />
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onOk()">
          {{ t.ok }}
        </button>
        <button data-hotkey="Escape" @click="onCancel()">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts" setup>
import { t } from "@/common/i18n";
import { BookMoveInsertionFromPVScoreTarget } from "@/common/settings/app";
import { useAppSettings } from "@/renderer/store/settings";
import { onBeforeUnmount, onMounted, ref } from "vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";

const appSettings = useAppSettings();
const dialog = ref();
const maxDepth = ref(appSettings.bookMoveInsertionFromPVMaxDepth);
const scoreTarget = ref(appSettings.bookMoveInsertionFromPVScoreTarget);

const emit = defineEmits<{
  ok: [maxDepth: number, scoreTarget: BookMoveInsertionFromPVScoreTarget];
  cancel: [];
}>();

onMounted(() => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const onOk = () => {
  appSettings.updateAppSettings({
    bookMoveInsertionFromPVMaxDepth: maxDepth.value,
    bookMoveInsertionFromPVScoreTarget: scoreTarget.value,
  });
  emit("ok", maxDepth.value, scoreTarget.value);
};

const onCancel = () => {
  emit("cancel");
};
</script>
