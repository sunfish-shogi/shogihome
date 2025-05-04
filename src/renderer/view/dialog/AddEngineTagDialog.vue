<template>
  <DialogFrame @cancel="onCancel">
    <div class="root">
      <div class="title">タグを追加</div>
      <div v-for="tag of tags" :key="tag" class="tag">
        <button @click="emit('add', tag)">{{ tag }}</button>
      </div>
      <div class="tag">
        <input v-model="newTag" placeholder="新しいタグ" />
        <button :disabled="!newTag.trim()" @click="emit('add', newTag.trim())">{{ t.add }}</button>
      </div>
      <div class="tag">
        <button data-hotkey="Escape" @click="onCancel">
          {{ t.cancel }}
        </button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import DialogFrame from "./DialogFrame.vue";
import { ref } from "vue";

defineProps<{
  tags: string[];
}>();

const emit = defineEmits<{
  (e: "add", tag: string): void;
  (e: "cancel"): void;
}>();

const newTag = ref("");

const onCancel = () => {
  emit("cancel");
};
</script>

<style scoped>
.root {
  display: flex;
  flex-direction: column;
  width: 200px;
}
.tag {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
}
.tag:not(:last-child) {
  margin-bottom: 5px;
}
input {
  width: 100%;
}
button {
  height: 23px;
  margin: 0;
  padding: 2px 5px;
}
button:not(:first-child) {
  width: 80px;
}
button:first-child {
  width: 100%;
}
</style>
