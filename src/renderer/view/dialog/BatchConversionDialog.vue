<template>
  <DialogFrame @cancel="onClose">
    <div class="title">{{ t.batchConversion }}</div>
    <div class="form-group">
      <div>{{ t.inputs }}</div>
      <div class="form-item row">
        <input v-model="settings.source" class="grow" type="text" />
        <button class="thin" @click="selectSourceDirectory">
          {{ t.select }}
        </button>
        <button class="thin open-dir" @click="openDirectory(settings.source)">
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
        <ToggleButton v-model:value="settings.subdirectories" class="toggle" />
      </div>
      <hr />
      <div>{{ t.outputs }}</div>
      <div class="form-item center">
        <HorizontalSelector
          v-model:value="settings.destinationType"
          :items="[
            { label: t.separate, value: DestinationType.DIRECTORY },
            { label: t.merge, value: DestinationType.SINGLE_FILE },
          ]"
        />
      </div>
      <div v-show="settings.destinationType !== DestinationType.SINGLE_FILE" class="form-item row">
        <input v-model="settings.destination" class="grow" type="text" />
        <button class="thin" @click="selectDestinationDirectory">
          {{ t.select }}
        </button>
        <button class="thin open-dir" @click="openDirectory(settings.destination)">
          <Icon :icon="IconType.OPEN_FOLDER" />
        </button>
      </div>
      <div v-show="settings.destinationType !== DestinationType.SINGLE_FILE" class="form-item row">
        <div class="form-item-label-wide">{{ t.format }}</div>
        <div class="formats">
          <HorizontalSelector
            v-model:value="settings.destinationFormat"
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
      <div v-show="settings.destinationType !== DestinationType.SINGLE_FILE" class="form-item row">
        <div class="form-item-label-wide">{{ t.createSubdirectories }}</div>
        <ToggleButton v-model:value="settings.createSubdirectories" class="toggle" />
      </div>
      <div v-show="settings.destinationType !== DestinationType.SINGLE_FILE" class="form-item row">
        <div class="form-item-label-wide">{{ t.nameConflictAction }}</div>
        <HorizontalSelector
          v-model:value="settings.fileNameConflictAction"
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
      <div v-show="settings.destinationType === DestinationType.SINGLE_FILE" class="form-item row">
        <input v-model="settings.singleFileDestination" class="grow" type="text" />
        <button class="thin" @click="selectDestinationFile">
          {{ t.select }}
        </button>
        <button class="thin open-dir" @click="openDirectory(settings.singleFileDestination)">
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
  </DialogFrame>
</template>

<script setup lang="ts">
import { RecordFileFormat } from "@/common/file/record";
import {
  BatchConversionSettings,
  validateBatchConversionSettings,
  DestinationType,
  FileNameConflictAction,
  defaultBatchConversionSettings,
} from "@/common/settings/conversion";
import api from "@/renderer/ipc/api";
import { useStore } from "@/renderer/store";
import { onMounted, ref } from "vue";
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
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const busyState = useBusyState();
const appSettings = useAppSettings();
const settings = ref(defaultBatchConversionSettings());
const sourceFormats = ref({
  kif: false,
  kifu: false,
  ki2: false,
  ki2u: false,
  csa: false,
  jkf: false,
});

busyState.retain();

onMounted(async () => {
  try {
    settings.value = await api.loadBatchConversionSettings();
    const sf = settings.value.sourceFormats;
    sourceFormats.value = {
      kif: sf.includes(RecordFileFormat.KIF),
      kifu: sf.includes(RecordFileFormat.KIFU),
      ki2: sf.includes(RecordFileFormat.KI2),
      ki2u: sf.includes(RecordFileFormat.KI2U),
      csa: sf.includes(RecordFileFormat.CSA),
      jkf: sf.includes(RecordFileFormat.JKF),
    };
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

const selectSourceDirectory = async () => {
  busyState.retain();
  try {
    const path = await api.showSelectDirectoryDialog(settings.value.source);
    if (path) {
      settings.value.source = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const selectDestinationDirectory = async () => {
  busyState.retain();
  try {
    const path = await api.showSelectDirectoryDialog(settings.value.destination);
    if (path) {
      settings.value.destination = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const selectDestinationFile = async () => {
  busyState.retain();
  try {
    const path = await api.showSaveMergedRecordDialog(settings.value.singleFileDestination);
    if (path) {
      settings.value.singleFileDestination = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const openDirectory = (path: string) => {
  api.openExplorer(path);
};

const convert = async () => {
  const batchConversionSettings: BatchConversionSettings = {
    ...settings.value,
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
      withCopyButton: true,
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
.form-group {
  width: 520px;
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
