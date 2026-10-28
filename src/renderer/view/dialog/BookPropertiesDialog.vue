<template>
  <DialogFrame limited @cancel="onClose">
    <div class="root">
      <div class="title">{{ t.bookInfo }}</div>
      <div class="form-group scroll">
        <div v-if="info" class="section">
          <div class="section-title">{{ t.bookInfo }}</div>
          <table>
            <tbody>
              <tr>
                <th scope="row">{{ t.format }}</th>
                <td>{{ formatLabel }}</td>
              </tr>
              <tr>
                <th scope="row">{{ t.loadingMode }}</th>
                <td>{{ info.type }}</td>
              </tr>
              <tr v-if="info.path">
                <th scope="row">{{ t.file }}</th>
                <td class="long-text">
                  {{ info.path }}
                  <button class="copy-button" :title="t.copy" @click="copyText(info.path)">
                    <Icon :icon="IconType.COPY" />
                  </button>
                </td>
              </tr>
              <tr v-if="info.entryCount !== undefined">
                <th scope="row">{{ t.positionCount }}</th>
                <td>{{ info.entryCount }}</td>
              </tr>
              <tr v-if="info.sbkAuthor">
                <th scope="row">{{ t.author }}</th>
                <td class="long-text">
                  {{ info.sbkAuthor }}
                  <button class="copy-button" :title="t.copy" @click="copyText(info.sbkAuthor)">
                    <Icon :icon="IconType.COPY" />
                  </button>
                </td>
              </tr>
              <tr v-if="info.sbkDescription">
                <th scope="row">{{ t.description }}</th>
                <td class="long-text">
                  {{ info.sbkDescription }}
                  <button
                    class="copy-button"
                    :title="t.copy"
                    @click="copyText(info.sbkDescription)"
                  >
                    <Icon :icon="IconType.COPY" />
                  </button>
                </td>
              </tr>
              <tr>
                <th scope="row">{{ t.unsaved }}</th>
                <td>{{ info.unsaved ? "Yes" : "No" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="section">
          <div class="section-title">{{ t.currentPosition }}</div>
          <table>
            <tbody>
              <tr v-if="positionProperties.minPly !== undefined">
                <th scope="row">{{ t.numberOfMoves }}</th>
                <td>{{ positionProperties.minPly }}</td>
              </tr>
              <tr v-if="statsLabel">
                <th scope="row">{{ t.statistics }}</th>
                <td>{{ statsLabel }}</td>
              </tr>
              <tr v-if="positionProperties.comment">
                <th scope="row">{{ t.comments }}</th>
                <td class="long-text">
                  <span class="comment">{{ positionProperties.comment }}</span>
                  <button
                    class="copy-button"
                    :title="t.copy"
                    @click="copyText(positionProperties.comment)"
                  >
                    <Icon :icon="IconType.COPY" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <table v-if="positionProperties.sbkEvals?.length">
            <thead>
              <tr>
                <th scope="col" class="nowrap">{{ t.engineName }}</th>
                <th scope="col">{{ t.evaluation }}</th>
                <th scope="col">{{ t.depth }}</th>
                <th scope="col">{{ t.nodes }}</th>
                <th scope="col">{{ t.pv }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(evalEntry, index) of positionProperties.sbkEvals" :key="index">
                <th scope="row">{{ evalEntry.engineName }}</th>
                <td class="number">{{ evalEntry.evaluationValue }}</td>
                <td class="number">{{ evalEntry.depth }}/{{ evalEntry.selDepth }}</td>
                <td class="number">{{ evalEntry.nodes }}</td>
                <td class="long-text">
                  {{ evalEntry.variation }}
                  <button
                    v-if="evalEntry.variation"
                    class="copy-button"
                    :title="t.copy"
                    @click="copyText(evalEntry.variation)"
                  >
                    <Icon :icon="IconType.COPY" />
                  </button>
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
.copy-button {
  padding: 2px 4px;
}
.copy-button > .icon {
  height: 1.1em;
  vertical-align: middle;
}
.comment {
  white-space: pre-wrap;
}
.nowrap {
  white-space: nowrap;
}
table {
  max-width: 100%;
  font-size: 0.85em;
  border-collapse: collapse;
  margin-top: 8px;
}
table th,
table td {
  border: 1px solid var(--text-separator-color);
  padding: 0 4px;
  text-align: left;
  vertical-align: middle;
}
table td.number {
  text-align: right;
  white-space: nowrap;
}
table td.long-text {
  word-break: break-all;
}
</style>
