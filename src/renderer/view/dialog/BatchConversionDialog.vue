<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.batchConversion }}</div>
      <div class="form-group scroll">
        <div>{{ t.inputs }}</div>
        <div class="form-item row">
          <input ref="source" class="grow" type="text" />
          <button class="thin" @click="selectDirectory(source)">
            {{ t.select }}
          </button>
          <button class="thin open-dir" @click="openDirectory(source)">
            <Icon :icon="IconType.OPEN_FOLDER" />
          </button>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.formats }}</div>
          <div class="formats">
            <ToggleButton v-model:value="sourceFormats.kif" class="toggle" label=".kif" />
            <ToggleButton v-model:value="sourceFormats.kifu" class="toggle" label=".kifu" />
            <ToggleButton v-model:value="sourceFormats.ki2" class="toggle" label=".ki2" />
            <ToggleButton v-model:value="sourceFormats.ki2u" class="toggle" label=".ki2u" />
            <ToggleButton v-model:value="sourceFormats.csa" class="toggle" label=".csa" />
            <ToggleButton v-model:value="sourceFormats.jkf" class="toggle" label=".jkf" />
          </div>
        </div>
        <div class="form-item row">
          <div class="form-item-label-wide">{{ t.subdirectories }}</div>
          <ToggleButton v-model:value="subdirectories" class="toggle" />
        </div>
        <hr />
        <div>{{ t.outputs }}</div>
        <div class="form-item center">
          <HorizontalSelector
            v-model:value="destinationType"
            :items="[
              { label: t.separate, value: DestinationType.DIRECTORY },
              { label: t.merge, value: DestinationType.SINGLE_FILE },
            ]"
          />
        </div>
        <div v-show="destinationType !== DestinationType.SINGLE_FILE" class="form-item row">
          <input ref="destination" class="grow" type="text" />
          <button class="thin" @click="selectDirectory(destination)">
            {{ t.select }}
          </button>
          <button class="thin open-dir" @click="openDirectory(destination)">
            <Icon :icon="IconType.OPEN_FOLDER" />
          </button>
        </div>
        <div v-show="destinationType !== DestinationType.SINGLE_FILE" class="form-item row">
          <div class="form-item-label-wide">{{ t.format }}</div>
          <div class="formats">
            <HorizontalSelector
              v-model:value="destinationFormat"
              :items="[
                { label: '.kif', value: RecordFileFormat.KIF },
                { label: '.kifu', value: RecordFileFormat.KIFU },
                { label: '.ki2', value: RecordFileFormat.KI2 },
                { label: '.ki2u', value: RecordFileFormat.KI2U },
                { label: '.csa', value: RecordFileFormat.CSA },
                { label: '.jkf', value: RecordFileFormat.JKF },
              ]"
            />
          </div>
        </div>
        <div v-show="destinationType !== DestinationType.SINGLE_FILE" class="form-item row">
          <div class="form-item-label-wide">{{ t.createSubdirectories }}</div>
          <ToggleButton v-model:value="createSubdirectories" class="toggle" />
        </div>
        <div v-show="destinationType !== DestinationType.SINGLE_FILE" class="form-item row">
          <div class="form-item-label-wide">{{ t.nameConflictAction }}</div>
          <HorizontalSelector
            v-model:value="fileNameConflictAction"
            :items="[
              { label: t.overwrite, value: FileNameConflictAction.OVERWRITE },
              {
                label: t.numberSuffix,
                value: FileNameConflictAction.NUMBER_SUFFIX,
              },
              { label: t.skip, value: FileNameConflictAction.SKIP },
            ]"
          />
        </div>
        <div v-show="destinationType === DestinationType.SINGLE_FILE" class="form-item row">
          <input ref="singleFileDestination" class="grow" type="text" />
          <button class="thin" @click="selectDestinationFile(singleFileDestination)">
            {{ t.select }}
          </button>
          <button class="thin open-dir" @click="openDirectory(singleFileDestination)">
            <Icon :icon="IconType.OPEN_FOLDER" />
          </button>
        </div>
      </div>
      <button class="wide" data-hotkey="Enter" @click="convert">
        {{ t.convert }}
      </button>
      <button
        v-if="appSettings.enableAppLog && appSettings.logLevel === LogLevel.DEBUG"
        class="wide"
        @click="openLogFile"
      >
        {{ t.openLogFile }}
      </button>
      <div v-else class="form-group warning">
        <div class="note">
          {{ t.forExportingConversionLogPleaseEnableAppLogsAndSetLogLevelDebugAndRestart }}
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Escape" @click="onClose">{{ t.close }}</button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { RecordFileFormat } from "@/common/file/record";
import {
  BatchConversionSettings,
  validateBatchConversionSettings,
  DestinationType,
  FileNameConflictAction,
} from "@/common/settings/conversion";
import { showModalDialog } from "@/renderer/helpers/dialog";
import api from "@/renderer/ipc/api";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { t } from "@/common/i18n";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import { LogType, LogLevel } from "@/common/log";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { useMessageStore } from "@/renderer/store/message";

const store = useStore();
const busyState = useBusyState();
const appSettings = useAppSettings();
const dialog = ref();
const source = ref();
const sourceFormats = ref({
  kif: false,
  kifu: false,
  ki2: false,
  ki2u: false,
  csa: false,
  jkf: false,
});
const subdirectories = ref(false);
const destinationType = ref(DestinationType.DIRECTORY);
const destination = ref();
const destinationFormat = ref(RecordFileFormat.KIF);
const createSubdirectories = ref(false);
const fileNameConflictAction = ref(FileNameConflictAction.OVERWRITE);
const singleFileDestination = ref();

busyState.retain();

onMounted(async () => {
  try {
    const batchConversionSettings = await api.loadBatchConversionSettings();
    showModalDialog(dialog.value, onClose);
    installHotKeyForDialog(dialog.value);
    source.value.value = batchConversionSettings.source;
    sourceFormats.value = {
      kif: batchConversionSettings.sourceFormats.includes(RecordFileFormat.KIF),
      kifu: batchConversionSettings.sourceFormats.includes(RecordFileFormat.KIFU),
      ki2: batchConversionSettings.sourceFormats.includes(RecordFileFormat.KI2),
      ki2u: batchConversionSettings.sourceFormats.includes(RecordFileFormat.KI2U),
      csa: batchConversionSettings.sourceFormats.includes(RecordFileFormat.CSA),
      jkf: batchConversionSettings.sourceFormats.includes(RecordFileFormat.JKF),
    };
    subdirectories.value = batchConversionSettings.subdirectories;
    destinationType.value = batchConversionSettings.destinationType;
    destination.value.value = batchConversionSettings.destination;
    destinationFormat.value = batchConversionSettings.destinationFormat;
    createSubdirectories.value = batchConversionSettings.createSubdirectories;
    fileNameConflictAction.value = batchConversionSettings.fileNameConflictAction;
    singleFileDestination.value.value = batchConversionSettings.singleFileDestination;
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const selectDirectory = async (elem: HTMLInputElement) => {
  busyState.retain();
  try {
    const path = await api.showSelectDirectoryDialog(elem.value);
    if (path) {
      elem.value = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const selectDestinationFile = async (elem: HTMLInputElement) => {
  busyState.retain();
  try {
    const path = await api.showSaveMergedRecordDialog(elem.value);
    if (path) {
      elem.value = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const openDirectory = (elem: HTMLInputElement) => {
  api.openExplorer(elem.value);
};

const convert = async () => {
  const batchConversionSettings: BatchConversionSettings = {
    source: source.value.value,
    sourceFormats: Object.entries({
      [RecordFileFormat.KIF]: sourceFormats.value.kif,
      [RecordFileFormat.KIFU]: sourceFormats.value.kifu,
      [RecordFileFormat.KI2]: sourceFormats.value.ki2,
      [RecordFileFormat.KI2U]: sourceFormats.value.ki2u,
      [RecordFileFormat.CSA]: sourceFormats.value.csa,
      [RecordFileFormat.JKF]: sourceFormats.value.jkf,
    })
      .filter(([, value]) => value)
      .map(([key]) => key as RecordFileFormat),
    subdirectories: subdirectories.value,
    destinationType: destinationType.value,
    destination: destination.value.value,
    destinationFormat: destinationFormat.value,
    createSubdirectories: createSubdirectories.value,
    fileNameConflictAction: fileNameConflictAction.value,
    singleFileDestination: singleFileDestination.value.value,
  };
  const error = validateBatchConversionSettings(batchConversionSettings);
  if (error) {
    useErrorStore().add(error);
    return;
  }
  busyState.retain();
  try {
    await api.saveBatchConversionSettings(batchConversionSettings);
    const result = await api.convertRecordFiles(batchConversionSettings);
    useMessageStore().enqueue({
      text: t.conversionCompleted,
      attachments: [
        {
          type: "list",
          items: [
            {
              text: t.success,
              children: [
                t.totalNumber(result.successTotal),
                ...Object.entries(result.success).map(
                  ([key, value]) => `${key}: ${t.number(value)}`,
                ),
              ],
            },
            {
              text: t.failed,
              children: [
                t.totalNumber(result.failedTotal),
                ...Object.entries(result.failed).map(
                  ([key, value]) => `${key}: ${t.number(value)}`,
                ),
              ],
            },
            {
              text: t.skipped,
              children: [
                t.totalNumber(result.skippedTotal),
                ...Object.entries(result.skipped).map(
                  ([key, value]) => `${key}: ${t.number(value)}`,
                ),
              ],
            },
          ],
        },
      ],
    });
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const openLogFile = () => {
  api.openLogFile(LogType.APP);
};

const onClose = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.root {
  width: 540px;
}
.formats {
  display: inline-block;
  max-width: 300px;
}
.formats .toggle {
  margin-right: 10px;
}
button.open-dir {
  margin-left: 5px;
  padding-left: 8px;
  padding-right: 8px;
}
</style>
