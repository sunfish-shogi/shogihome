<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.history }}</div>
      <div class="form-group scroll list-area">
        <div v-if="entries.length === 0">
          {{ t.noHistory }}
        </div>
        <div v-for="(entry, index) of entries" :key="index" class="entry">
          <hr v-if="index !== 0" />
          <div class="header">
            <span class="left">
              <span class="class">{{
                entry.class === HistoryClass.USER ? t.userFile : t.automaticBackup
              }}</span>
              <span class="time">{{
                dayjs(entry.time).locale(appSetting.language.replace("_", "-")).fromNow()
              }}</span>
              <span class="datetime">{{ getDateTimeString(new Date(entry.time)) }}</span>
            </span>
            <span class="right">
              <button v-if="entry.userFilePath" @click="open(entry.userFilePath)">
                {{ t.open }}
              </button>
              <button v-if="entry.backupFileName" @click="restore(entry.backupFileName)">
                {{ t.restore }}
              </button>
            </span>
          </div>
          <div v-if="entry.userFilePath" class="file-path">
            {{ entry.userFilePath }}
          </div>
        </div>
      </div>
      <div class="main-buttons">
        <button @click="clear">{{ t.clearHistory }}</button>
        <button data-hotkey="Escape" @click="onClose">{{ t.close }}</button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { HistoryClass, RecordFileHistoryEntry } from "@/common/file/history";
import api from "@/renderer/ipc/api";
import { getDateTimeString } from "@/common/helpers/datetime";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { t } from "@/common/i18n";
import { useAppSetting } from "@/renderer/store/setting";

const dialog = ref();
const entries = ref([] as RecordFileHistoryEntry[]);
const store = useStore();
const appSetting = useAppSetting();
store.retainBussyState();

onMounted(async () => {
  try {
    const history = await api.loadRecordFileHistory();
    entries.value = history.entries.reverse();
    showModalDialog(dialog.value, onClose);
    installHotKeyForDialog(dialog.value);
  } catch (e) {
    store.pushError(e);
    store.destroyModalDialog();
  } finally {
    store.releaseBussyState();
  }
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const open = (path: string) => {
  store.closeModalDialog();
  store.openRecord(path);
};

const restore = (name: string) => {
  store.restoreFromBackup(name);
};

const clear = () => {
  store.showConfirmation({
    message: t.areYouSureWantToClearHistory,
    onOk: async () => {
      try {
        await api.clearRecordFileHistory();
        entries.value = [];
      } catch (e) {
        store.pushError(e);
      }
    },
  });
};

const onClose = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
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
