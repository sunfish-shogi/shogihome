<template>
  <div>
    <div class="full column root">
      <div
        ref="root"
        class="full column main"
        :style="{ height: `${size.height - 25}px` }"
        @copy.stop
        @paste.stop
      >
        <div class="row element">
          <div class="key">{{ t.file }}</div>
          <div class="value">
            <span v-if="store.isRecordFileUnsaved" class="unsaved-marker">{{ t.unsaved }}</span>
            {{ store.recordFilePath || t.newRecord }}
          </div>
        </div>
        <div v-if="store.remoteRecordFileURL" class="row element">
          <div class="key">{{ t.sourceURL }}</div>
          <div class="value">{{ store.remoteRecordFileURL }}</div>
        </div>
        <div
          v-for="element in list"
          v-show="appSettings.emptyRecordInfoVisibility || element.value"
          :key="element.key"
          class="row element"
        >
          <div class="key">{{ element.displayName }}</div>
          <input class="value" :value="element.value" @input="change($event, element.key)" />
        </div>
      </div>
      <div class="options">
        <ToggleButton
          :value="appSettings.emptyRecordInfoVisibility"
          :label="t.displayEmptyElements"
          @update:value="changeEmptyInfoVisibility"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getRecordMetadataName, t } from "@/common/i18n";
import { RecordMetadataKey } from "tsshogi";
import { useStore } from "@/renderer/store";
import { computed } from "vue";
import { RectSize } from "@/common/assets/geometry.js";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { useAppSettings } from "@/renderer/store/settings";

defineProps({
  size: {
    type: RectSize,
    required: true,
  },
});

const store = useStore();
const appSettings = useAppSettings();
const list = computed(() => {
  return Object.values(RecordMetadataKey).map((key) => {
    const metadata = store.record.metadata;
    return {
      key: key,
      displayName: getRecordMetadataName(key),
      value: metadata.getStandardMetadata(key) || "",
    };
  });
});

const change = (event: Event, key: RecordMetadataKey) => {
  const input = event.target as HTMLInputElement;
  store.updateStandardRecordMetadata({
    key,
    value: input.value,
  });
};

const changeEmptyInfoVisibility = (visible: boolean) => {
  appSettings.updateAppSettings({
    emptyRecordInfoVisibility: visible,
  });
};
</script>

<style scoped>
.root {
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
.main {
  overflow: auto;
}
.element {
  margin: 3px;
  text-align: left;
}
.key {
  width: 150px;
}
.value {
  white-space: pre-wrap;
  word-break: break-all;
  width: calc(100% - 150px);
}
input.value {
  width: min(500px, calc(100% - 200px));
}
.options {
  padding: 2px 5px 2px 5px;
  height: 24px;
  text-align: left;
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
.unsaved-marker {
  display: inline-block;
  font-size: 0.8em;
  vertical-align: 0.2em;
  color: var(--main-color);
  background-color: var(--main-bg-color);
  padding-left: 5px;
  padding-right: 5px;
  box-sizing: border-box;
  border: 1px solid var(--text-separator-color);
  border-radius: 7px;
}
</style>
