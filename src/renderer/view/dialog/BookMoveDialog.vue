<template>
  <DialogFrame @cancel="onCancel">
    <div class="root">
      <div class="title">{{ t.bookMove }}</div>
      <div class="form-group">
        <div class="form-item">
          <div class="form-item-label">{{ t.move }}</div>
          <span>{{ move }}</span>
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.evaluation }}</div>
          <input
            v-model.number="scoreValue"
            :min="-32767"
            :max="32767"
            type="number"
            :readonly="!enableScore"
          />
          <ToggleButton v-model:value="enableScore" />
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.depth }}</div>
          <input
            v-model.number="depthValue"
            :min="0"
            :max="127"
            type="number"
            :readonly="!enableDepth"
          />
          <ToggleButton v-model:value="enableDepth" />
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.frequency }}</div>
          <input
            v-model.number="countValue"
            :min="0"
            :max="2147483647"
            type="number"
            :readonly="!enableCount"
          />
          <ToggleButton v-model:value="enableCount" />
        </div>
        <div class="form-item">
          <div class="form-item-label">{{ t.comments }}</div>
          <textarea v-model="commentValue" />
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
    </div>
  </DialogFrame>
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
import { ref } from "vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import DialogFrame from "./DialogFrame.vue";

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

const scoreValue = ref(props.score || 0);
const depthValue = ref(props.depth || 0);
const countValue = ref(props.count || 0);
const commentValue = ref(props.comment || "");
const enableScore = ref(props.score !== undefined);
const enableDepth = ref(props.depth !== undefined);
const enableCount = ref(props.count !== undefined);

const onOk = () => {
  emits("ok", {
    score: enableScore.value ? scoreValue.value : undefined,
    depth: enableDepth.value ? depthValue.value : undefined,
    count: enableCount.value ? countValue.value : undefined,
    comment: commentValue.value,
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
