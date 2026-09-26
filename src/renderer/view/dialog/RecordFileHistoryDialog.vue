<template>
  <DialogFrame limited @cancel="onClose">
    <div class="title">{{ t.history }}</div>
    <div class="row filter">
      <input
        v-model.trim="filter"
        class="filter-words"
        type="text"
        :placeholder="t.filterByFilePathOrContent"
      />
      <span v-if="filter && loadingContents" class="loading">{{ t.loadingFileContents }}</span>
    </div>
    <div class="form-group scroll list-area">
      <div v-if="filteredEntries.length === 0">
        {{ t.noHistory }}
      </div>
      <div v-for="(entry, index) of filteredEntries" :key="entry.id" class="entry">
        <hr v-if="index !== 0" />
        <div class="header">
          <span class="left">
            <span class="class">{{
              entry.class === HistoryClass.USER ? t.userFile : t.automaticBackup
            }}</span>
            <span class="time">{{
              dayjs(entry.time).locale(appSettings.language.replace("_", "-")).fromNow()
            }}</span>
            <span class="datetime">{{ getDateTimeString(new Date(entry.time)) }}</span>
          </span>
          <span class="right">
            <button
              v-if="entry.class === HistoryClass.USER"
              class="open-directory"
              :title="t.openDirectory"
              @click="openDirectory(entry.userFilePath)"
            >
              <Icon :icon="IconType.OPEN_FOLDER" />
            </button>
            <button v-if="entry.class === HistoryClass.USER" @click="open(entry.userFilePath)">
              {{ t.open }}
            </button>
            <button
              v-if="entry.class === HistoryClass.BACKUP"
              @click="restoreV1(entry.backupFileName)"
            >
              {{ t.restore }}
            </button>
            <button v-if="entry.class === HistoryClass.BACKUP_V2" @click="restoreV2(entry.kif)">
              {{ t.restore }}
            </button>
          </span>
        </div>
        <div v-if="entry.class === HistoryClass.USER" class="file-path">
          {{ entry.userFilePath }}
        </div>
        <div
          v-if="
            entry.class === HistoryClass.BACKUP_V2 &&
            (entry.title || entry.blackPlayerName || entry.whitePlayerName || entry.ply)
          "
          class="file-path"
        >
          <span v-if="entry.title">{{ entry.title }} / </span>
          <span v-if="entry.blackPlayerName">{{ entry.blackPlayerName }} / </span>
          <span v-if="entry.whitePlayerName">{{ entry.whitePlayerName }} / </span>
          <span>{{ entry.ply || 0 }}手</span>
        </div>
      </div>
    </div>
    <div class="main-buttons">
      <button @click="clear">{{ t.clearHistory }}</button>
      <button data-hotkey="Escape" @click="onClose">{{ t.close }}</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import { useStore } from "@/renderer/store";
import { computed, onMounted, ref, watch } from "vue";
import { HistoryClass, RecordFileHistoryEntry } from "@/common/file/history";
import api from "@/renderer/ipc/api";
import { getDateTimeString } from "@/common/helpers/datetime";
import { t } from "@/common/i18n";
import { useAppSettings } from "@/renderer/store/settings";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { useConfirmationStore } from "@/renderer/store/confirm";
import { filter as filterString } from "@/common/helpers/string";
import { LogLevel } from "@/common/log";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import DialogFrame from "./DialogFrame.vue";

const entries = ref([] as RecordFileHistoryEntry[]);
const filter = ref("");
const userFileContents = ref<{ [id: string]: string } | undefined>();
const loadingContents = ref(false);
const store = useStore();
const busyState = useBusyState();
const appSettings = useAppSettings();
busyState.retain();

onMounted(async () => {
  try {
    const history = await api.loadRecordFileHistory();
    entries.value = history.entries.reverse();
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

// ユーザーファイルの内容はフィルタが初めて入力された時に読み込む。
const loadUserFileContents = async () => {
  if (userFileContents.value || loadingContents.value) {
    return;
  }
  loadingContents.value = true;
  try {
    userFileContents.value = await api.loadRecordFileHistoryContents();
  } catch (e) {
    api.log(LogLevel.WARN, `RecordFileHistoryDialog: failed to load file contents: ${e}`);
    userFileContents.value = {};
  } finally {
    loadingContents.value = false;
  }
};

watch(filter, (value) => {
  if (value) {
    loadUserFileContents();
  }
});

const getSearchTarget = (entry: RecordFileHistoryEntry): string | undefined => {
  switch (entry.class) {
    case HistoryClass.USER: {
      const content = userFileContents.value?.[entry.id];
      return content !== undefined ? entry.userFilePath + "\n" + content : entry.userFilePath;
    }
    case HistoryClass.BACKUP_V2:
      return entry.kif;
    default:
      // 旧バージョンのバックアップは検索対象外とする。
      return;
  }
};

const filteredEntries = computed(() => {
  const filterWords = filter.value.split(/\s+/).filter((s) => s);
  if (!filterWords.length) {
    return entries.value;
  }
  return entries.value.filter((entry) => {
    const target = getSearchTarget(entry);
    return target !== undefined && filterString(target, filterWords);
  });
});

const openDirectory = (path: string) => {
  api.openParentDirectory(path);
};

const open = (path: string) => {
  store.closeModalDialog();
  store.openRecord(path);
};

const restoreV1 = (name: string) => {
  store.restoreFromBackupV1(name);
};

const restoreV2 = (kif: string) => {
  store.restoreFromBackupV2(kif);
};

const clear = () => {
  useConfirmationStore().show({
    message: t.areYouSureWantToClearHistory,
    onOk: async () => {
      try {
        await api.clearRecordFileHistory();
        entries.value = [];
      } catch (e) {
        useErrorStore().add(e);
      }
    },
  });
};

const onClose = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.filter {
  margin: 0px 5px 5px 5px;
  align-items: center;
}
.filter-words {
  width: 300px;
}
.loading {
  margin-left: 0.5em;
  font-size: 0.8em;
}
.list-area {
  max-width: 800px;
  width: 80vw;
  height: 70vh;
  background-color: var(--text-bg-color);
}
.entry {
  width: 100%;
}
.header {
  display: table;
  width: 100%;
}
.header > .left {
  display: table-cell;
  text-align: left;
}
.header > .right {
  display: table-cell;
  text-align: right;
}
.header * button {
  width: 80px;
}
.header * button.open-directory {
  width: auto;
  margin-right: 5px;
  padding-left: 8px;
  padding-right: 8px;
}
.class {
  display: inline-block;
  color: var(--main-color);
  background-color: var(--main-bg-color);
  padding-left: 5px;
  padding-right: 5px;
  margin-right: 0.5em;
  box-sizing: border-box;
  border: 1px solid var(--text-separator-color);
  border-radius: 7px;
}
.time {
  display: inline-block;
  margin-right: 0.5em;
}
.datetime {
  display: inline-block;
  font-size: 0.8em;
  margin-right: 0.5em;
}
.file-path {
  width: 100%;
  font-size: 0.8em;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
