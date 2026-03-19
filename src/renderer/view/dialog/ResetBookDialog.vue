<template>
  <DialogFrame @cancel="cancel">
    <div class="root">
      <div class="title">{{ t.resetBook }}</div>
      <div class="item">
        <button @click="reset('yane2016')">やねうら王定跡ファイル (.db)</button>
      </div>
      <div class="item">
        <button @click="reset('sbk')">ShogiGUI 定跡ファイル (.sbk)</button>
      </div>
      <div class="item">
        <button @click="reset('apery')">Apery 定跡ファイル (.bin)</button>
      </div>
      <div class="item">
        <button data-hotkey="Escape" @click="cancel">{{ t.cancel }}</button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n/index.js";
import { useStore } from "@/renderer/store/index.js";
import { useBookStore } from "@/renderer/store/book.js";
import { BookFormat } from "@/common/book.js";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();

const reset = (format: BookFormat) => {
  store.destroyModalDialog();
  useBookStore().reset(format);
};

const cancel = () => {
  store.destroyModalDialog();
};
</script>

<style scoped>
.root {
  display: flex;
  flex-direction: column;
}
.item {
  display: flex;
  flex-direction: row;
}
.item:not(:last-child) {
  margin-bottom: 5px;
}
button {
  width: 100%;
}
</style>
