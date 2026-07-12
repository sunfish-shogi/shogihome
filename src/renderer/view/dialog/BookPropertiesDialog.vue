<template>
  <DialogFrame limited @cancel="onClose">
    <div class="root">
      <div class="title">{{ t.bookInfo }}</div>
      <div class="form-group scroll">
        <div v-if="info" class="section">
          <div class="section-title">{{ t.bookInfo }}</div>
          <div class="property-item">
            <div class="property-label">{{ t.format }}</div>
            <span>{{ formatLabel }}</span>
          </div>
          <div class="property-item">
            <div class="property-label">{{ t.loadingMode }}</div>
            <span>{{ info.type }}</span>
          </div>
          <div v-if="info.path" class="property-item">
            <div class="property-label">{{ t.file }}</div>
            <div class="property-value">
              <span class="long-text">{{ info.path }}</span>
              <button class="copy-button" :title="t.copy" @click="copyText(info.path)">
                <Icon :icon="IconType.COPY" />
              </button>
            </div>
          </div>
          <div v-if="info.entryCount !== undefined" class="property-item">
            <div class="property-label">{{ t.positionCount }}</div>
            <span>{{ info.entryCount }}</span>
          </div>
          <div v-if="info.unsaved" class="property-item">
            <span>{{ t.unsaved }}</span>
          </div>
          <div v-if="info.sbkAuthor" class="property-item">
            <div class="property-label">{{ t.author }}</div>
            <div class="property-value">
              <span class="long-text">{{ info.sbkAuthor }}</span>
              <button class="copy-button" :title="t.copy" @click="copyText(info.sbkAuthor)">
                <Icon :icon="IconType.COPY" />
              </button>
            </div>
          </div>
          <div v-if="info.sbkDescription" class="property-item">
            <div class="property-label">{{ t.description }}</div>
            <div class="property-value">
              <span class="long-text">{{ info.sbkDescription }}</span>
              <button class="copy-button" :title="t.copy" @click="copyText(info.sbkDescription)">
                <Icon :icon="IconType.COPY" />
              </button>
            </div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">{{ t.currentPosition }}</div>
          <div v-if="positionProperties.minPly !== undefined" class="property-item">
            <div class="property-label">{{ t.numberOfMoves }}</div>
            <span>{{ positionProperties.minPly }}</span>
          </div>
          <div v-if="statsLabel" class="property-item">
            <div class="property-label">{{ t.statistics }}</div>
            <span>{{ statsLabel }}</span>
          </div>
          <div v-if="positionProperties.comment" class="property-item">
            <div class="property-label">{{ t.comments }}</div>
            <div class="property-value">
              <span class="long-text comment">{{ positionProperties.comment }}</span>
              <button
                class="copy-button"
                :title="t.copy"
                @click="copyText(positionProperties.comment)"
              >
                <Icon :icon="IconType.COPY" />
              </button>
            </div>
          </div>
          <table v-if="positionProperties.sbkEvals?.length" class="evals">
            <thead>
              <tr>
                <td>{{ t.engineName }}</td>
                <td>{{ t.evaluation }}</td>
                <td>{{ t.depth }}</td>
                <td>{{ t.nodes }}</td>
                <td>{{ t.pv }}</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(evalEntry, index) of positionProperties.sbkEvals" :key="index">
                <td>{{ evalEntry.engineName }}</td>
                <td class="number">{{ evalEntry.evaluationValue }}</td>
                <td class="number">{{ evalEntry.depth }}/{{ evalEntry.selDepth }}</td>
                <td class="number">{{ evalEntry.nodes }}</td>
                <td class="long-text">
                  <div class="property-value">
                    <span>{{ evalEntry.variation }}</span>
                    <button
                      v-if="evalEntry.variation"
                      class="copy-button"
                      :title="t.copy"
                      @click="copyText(evalEntry.variation)"
                    >
                      <Icon :icon="IconType.COPY" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="main-buttons">
        <button autofocus data-hotkey="Escape" @click="onClose">
          {{ t.close }}
        </button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { t } from "@/common/i18n";
import { BookInfo, defaultBookSession } from "@/common/book";
import { useStore } from "@/renderer/store";
import { useBookStore } from "@/renderer/store/book";
import { useErrorStore } from "@/renderer/store/error";
import { useMessageStore } from "@/renderer/store/message";
import api from "@/renderer/ipc/api";
import DialogFrame from "./DialogFrame.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";

const store = useStore();
const bookStore = useBookStore();
const info = ref<BookInfo>();

onMounted(async () => {
  try {
    info.value = await api.getBookInfo(defaultBookSession);
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  }
});

const positionProperties = computed(() => bookStore.positionProperties);

const formatLabel = computed(() => {
  switch (info.value?.format) {
    case "yane2016":
      return `${t.yane2016BookFile} (.db)`;
    case "ybb":
      return `${t.ybbBookFile} (.ybb)`;
    case "apery":
      return `${t.aperyBookFile} (.bin)`;
    case "sbk":
      return `${t.shogiGUIBookFile} (.sbk)`;
    default:
      return info.value?.format;
  }
});

const statsLabel = computed(() => {
  const props = positionProperties.value;
  if (props.games === undefined && props.wonBlack === undefined && props.wonWhite === undefined) {
    return "";
  }
  return (
    `${t.gameCount}: ${props.games ?? 0} / ` +
    `${t.blackWin}: ${props.wonBlack ?? 0} / ` +
    `${t.whiteWin}: ${props.wonWhite ?? 0}`
  );
});

const copyText = (text: string) => {
  navigator.clipboard.writeText(text);
  useMessageStore().enqueue({ text: t.copiedToClipboard });
};

const onClose = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.root {
  width: calc(100vw - 150px);
  max-width: 1000px;
}
.form-group {
  max-height: 60vh;
  text-align: left;
}
.section:not(:first-child) {
  margin-top: 15px;
}
.section-title {
  font-weight: bold;
  margin-bottom: 8px;
}
.property-item {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 12px;
  margin-bottom: 8px;
  align-items: start;
}
.property-label {
  font-weight: 500;
}
.long-text {
  word-break: break-all;
}
.property-value {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.copy-button {
  flex-shrink: 0;
  padding: 2px 4px;
}
.copy-button > .icon {
  height: 1.1em;
  vertical-align: middle;
}
.comment {
  white-space: pre-wrap;
}
table.evals {
  width: 100%;
  font-size: 0.85em;
  border-collapse: collapse;
  margin-top: 8px;
}
table.evals td {
  border: 1px solid var(--text-separator-color);
  padding: 0 4px;
  text-align: left;
  vertical-align: middle;
}
table.evals td.number {
  text-align: right;
  white-space: nowrap;
}
</style>
