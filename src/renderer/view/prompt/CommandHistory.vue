<template>
  <div>
    <div class="root column">
      <div class="tools row">
        <ToggleButton v-model:value="autoScroll" :label="t.autoScroll" />
        <ToggleButton v-model:value="showTimestamp" :label="t.showTimestamp" />
        <input
          class="search-text"
          type="text"
          :placeholder="t.highlightByPartialMatch"
          @input="
            (event) => {
              searchText = inputEventToString(event);
            }
          "
        />
      </div>
      <div class="history column">
        <div v-if="store.history.discarded" class="discarded">
          {{ store.history.discarded }} commands discarded
        </div>
        <div
          v-for="entry of store.history.commands"
          :id="`history-${entry.id}`"
          :key="entry.id"
          class="entry"
          :class="{
            highlight: searchText && entry.command.includes(searchText),
          }"
        >
          <span v-if="showTimestamp" class="timestamp">{{ entry.dateTime }}</span>
          <span v-if="entry.type === CommandType.SEND" class="send">&#x25B6;</span>
          <span v-if="entry.type === CommandType.RECEIVE" class="receive">&#x25C0;</span>
          <span v-if="entry.type === CommandType.SYSTEM" class="system">&#x25FC;</span>
          {{ entry.command }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CommandType } from "@/common/advanced/command";
import { useStore } from "@/renderer/prompt/store";
import { onMounted, onUpdated, ref } from "vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { t } from "@/common/i18n";
import { inputEventToString } from "@/renderer/helpers/form";

const store = useStore();
const autoScroll = ref(true);
const showTimestamp = ref(false);
const searchText = ref("");
let latestID: number | null = null;

function scrollToEnd() {
  if (store.history.commands.length) {
    const latest = store.history.commands[store.history.commands.length - 1];
    if (autoScroll.value && (latestID === null || latest.id !== latestID)) {
      const elem = document.getElementById(`history-${latest.id}`);
      elem?.scrollIntoView({ behavior: "auto", block: "nearest" });
      latestID = latest.id;
    }
  }
}

onMounted(() => {
  scrollToEnd();
});

onUpdated(() => {
  scrollToEnd();
});
</script>

<style scoped>
.root {
  width: 100%;
  height: 100%;
}
.tools {
  width: 100%;
  height: 24px;
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
.tools > *:not(:first-child) {
  margin-left: 20px;
}
.search-text {
  width: 300px;
}
.history {
  width: 100%;
  height: calc(100% - 24px);
  overflow: auto;
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
.discarded {
  font-size: 12px;
  text-align: left;
  background-color: var(--text-bg-color-disabled);
}
.entry {
  font-size: 12px;
  padding: 0 4px;
  text-align: left;
  white-space: pre;
}
.entry.highlight {
  background-color: var(--text-bg-color-warning);
}
.entry > .send {
  color: darkorange;
}
.entry > .receive {
  color: cornflowerblue;
}
.entry > .system {
  color: red;
}
.entry > .timestamp {
  margin-right: 4px;
}
</style>
