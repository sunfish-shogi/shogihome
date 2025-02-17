<template>
  <div>
    <dialog ref="dialog">
      <div class="title">{{ t.bookMove }}</div>
      <div class="form-group">
        <div class="form-item">
          <div class="form-item-label">{{ t.move }}</div>
          <span>{{ move }}</span>
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.evaluation }}</div>
          <input
            ref="scoreInput"
            :min="-32767"
            :max="32767"
            type="number"
            :value="score || 0"
            :readonly="!enableScore"
          />
          <ToggleButton v-model:value="enableScore" />
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.depth }}</div>
          <input
            ref="depthInput"
            :min="0"
            :max="127"
            type="number"
            :value="depth || 0"
            :readonly="!enableDepth"
          />
          <ToggleButton v-model:value="enableDepth" />
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.frequency }}</div>
          <input
            ref="countInput"
            :min="0"
            :max="2147483647"
            type="number"
            :value="count || 0"
            :readonly="!enableCount"
          />
          <ToggleButton v-model:value="enableCount" />
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.comments }}</div>
          <textarea ref="commentInput" :value="comment" />
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onOk">
          {{ t.ok }}
        </button>
        <button data-hotkey="Escape" @click="onCancel">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts">
export type Result = {
  score?: number;
  depth?: number;
  count?: number;
  comment: string;
};
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { readInputAsNumber } from "@/renderer/helpers/form";
import { onBeforeUnmount, onMounted, ref } from "vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";

const props = defineProps<{
  move: string;
  score?: number;
  depth?: number;
  count?: number;
  comment: string;
}>();

const emits = defineEmits<{
  ok: [result: Result];
  cancel: [];
}>();

const dialog = ref();
const scoreInput = ref();
const depthInput = ref();
const countInput = ref();
const commentInput = ref();
const enableScore = ref(props.score !== undefined);
const enableDepth = ref(props.depth !== undefined);
const enableCount = ref(props.count !== undefined);

onMounted(async () => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const onOk = () => {
  emits("ok", {
    score: enableScore.value ? readInputAsNumber(scoreInput.value) : undefined,
    depth: enableDepth.value ? readInputAsNumber(depthInput.value) : undefined,
    count: enableCount.value ? readInputAsNumber(countInput.value) : undefined,
    comment: commentInput.value.value,
  });
};

const onCancel = () => {
  emits("cancel");
};
</script>

<style scoped>
.form-item > input {
  width: 100px;
  margin-right: 5px;
}
</style>
