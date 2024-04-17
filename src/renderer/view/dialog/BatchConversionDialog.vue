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
            <ToggleButton
              class="toggle"
              label=".kif"
              :value="sourceFormats.kif"
              @change="
                (val: boolean) => {
                  sourceFormats.kif = val;
                }
              "
            />
            <ToggleButton
              class="toggle"
              label=".kifu"
              :value="sourceFormats.kifu"
              @change="
                (val: boolean) => {
                  sourceFormats.kifu = val;
                }
              "
            />
            <ToggleButton
              class="toggle"
              label=".ki2"
              :value="sourceFormats.ki2"
              @change="
                (val: boolean) => {
                  sourceFormats.ki2 = val;
                }
              "
            />
            <ToggleButton
              class="toggle"
              label=".ki2u"
              :value="sourceFormats.ki2u"
              @change="
                (val: boolean) => {
                  sourceFormats.ki2u = val;
                }
              "
            />
            <ToggleButton
              class="toggle"
              label=".csa"
              :value="sourceFormats.csa"
              @change="
                (val: boolean) => {
                  sourceFormats.csa = val;
                }
              "
            />
            <ToggleButton
              class="toggle"
              label=".jkf"
              :value="sourceFormats.jkf"
              @change="
                (val: boolean) => {
                  sourceFormats.jkf = val;
                }
              "
            />
          </div>
        </div>
        <div class="form-item row">
          <div class="form-item-label-wide">{{ t.subdirectories }}</div>
          <ToggleButton
            class="toggle"
            :value="subdirectories"
            @change="
              (val: boolean) => {
                subdirectories = val;
              }
            "
          />
        </div>
        <hr />
        <div>{{ t.outputs }}</div>
        <div class="form-item center">
          <HorizontalSelector
            :items="[
              { label: t.separately, value: DestinationType.DIRECTORY },
              { label: t.merge, value: DestinationType.SINGLE_FILE },
            ]"
            :value="destinationType"
            @change="
              (val: string) => {
                destinationType = val as DestinationType;
              }
            "
          />
        </div>
        <div
          class="form-item row"
          :class="{ hidden: destinationType === DestinationType.SINGLE_FILE }"
        >
          <input ref="destination" class="grow" type="text" />
          <button class="thin" @click="selectDirectory(destination)">
            {{ t.select }}
          </button>
          <button class="thin open-dir" @click="openDirectory(destination)">
            <Icon :icon="IconType.OPEN_FOLDER" />
          </button>
        </div>
        <div
          class="form-item row"
          :class="{ hidden: destinationType === DestinationType.SINGLE_FILE }"
        >
          <div class="form-item-label-wide">{{ t.format }}</div>
          <div class="formats">
            <HorizontalSelector
              :items="[
                { label: '.kif', value: RecordFileFormat.KIF },
                { label: '.kifu', value: RecordFileFormat.KIFU },
                { label: '.ki2', value: RecordFileFormat.KI2 },
                { label: '.ki2u', value: RecordFileFormat.KI2U },
                { label: '.csa', value: RecordFileFormat.CSA },
                { label: '.jkf', value: RecordFileFormat.JKF },
              ]"
              :value="destinationFormat"
              @change="
                (val: string) => {
                  destinationFormat = val as RecordFileFormat;
                }
              "
            />
          </div>
        </div>
        <div
          class="form-item row"
          :class="{ hidden: destinationType === DestinationType.SINGLE_FILE }"
        >
          <div class="form-item-label-wide">{{ t.createSubdirectories }}</div>
          <ToggleButton
            class="toggle"
            :value="createSubdirectories"
            @change="
              (val: boolean) => {
                createSubdirectories = val;
              }
            "
          />
        </div>
        <div
          class="form-item row"
          :class="{ hidden: destinationType === DestinationType.SINGLE_FILE }"
        >
          <div class="form-item-label-wide">{{ t.nameConflictAction }}</div>
          <HorizontalSelector
            :items="[
              { label: t.overwrite, value: FileNameConflictAction.OVERWRITE },
              {
                label: t.numberSuffix,
                value: FileNameConflictAction.NUMBER_SUFFIX,
              },
              { label: t.skip, value: FileNameConflictAction.SKIP },
            ]"
            :value="fileNameConflictAction"
            @change="
              (val: string) => {
                fileNameConflictAction = val as FileNameConflictAction;
              }
            "
          />
        </div>
        <div
          class="form-item row"
          :class="{ hidden: destinationType !== DestinationType.SINGLE_FILE }"
        >
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
        v-if="appSetting.enableAppLog && appSetting.logLevel === LogLevel.DEBUG"
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
  BatchConversionSetting,
  validateBatchConversionSetting,
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
import { useAppSetting } from "@/renderer/store/setting";
import { LogType, LogLevel } from "@/common/log";

const store = useStore();
const appSetting = useAppSetting();
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

store.retainBussyState();

onMounted(async () => {
  try {
    const batchConversionSetting = await api.loadBatchConversionSetting();
    showModalDialog(dialog.value, onClose);
    installHotKeyForDialog(dialog.value);
    source.value.value = batchConversionSetting.source;
    sourceFormats.value = {
      kif: batchConversionSetting.sourceFormats.includes(RecordFileFormat.KIF),
      kifu: batchConversionSetting.sourceFormats.includes(RecordFileFormat.KIFU),
      ki2: batchConversionSetting.sourceFormats.includes(RecordFileFormat.KI2),
      ki2u: batchConversionSetting.sourceFormats.includes(RecordFileFormat.KI2U),
      csa: batchConversionSetting.sourceFormats.includes(RecordFileFormat.CSA),
      jkf: batchConversionSetting.sourceFormats.includes(RecordFileFormat.JKF),
    };
    subdirectories.value = batchConversionSetting.subdirectories;
    destinationType.value = batchConversionSetting.destinationType;
    destination.value.value = batchConversionSetting.destination;
    destinationFormat.value = batchConversionSetting.destinationFormat;
    createSubdirectories.value = batchConversionSetting.createSubdirectories;
    fileNameConflictAction.value = batchConversionSetting.fileNameConflictAction;
    singleFileDestination.value.value = batchConversionSetting.singleFileDestination;
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

const selectDirectory = async (elem: HTMLInputElement) => {
  store.retainBussyState();
  try {
    const path = await api.showSelectDirectoryDialog(elem.value);
    if (path) {
      elem.value = path;
    }
  } catch (e) {
    store.pushError(e);
  } finally {
    store.releaseBussyState();
  }
};

const selectDestinationFile = async (elem: HTMLInputElement) => {
  store.retainBussyState();
  try {
    const path = await api.showSaveMergedRecordDialog(elem.value);
    if (path) {
      elem.value = path;
    }
  } catch (e) {
    store.pushError(e);
  } finally {
    store.releaseBussyState();
  }
};

const openDirectory = (elem: HTMLInputElement) => {
  api.openExplorer(elem.value);
};

const convert = async () => {
  const batchConversionSetting: BatchConversionSetting = {
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
  const error = validateBatchConversionSetting(batchConversionSetting);
  if (error) {
    store.pushError(error);
    return;
  }
  store.retainBussyState();
  try {
    await api.saveBatchConversionSetting(batchConversionSetting);
    const result = await api.convertRecordFiles(batchConversionSetting);
    store.enqueueMessage({
      text: t.conversionCompleted,
      attachments: [
        {
          type: "list",
          items: [
            {
              text: t.succeeded,
              children: [
                t.totalNumber(result.succeededTotal),
                ...Object.entries(result.succeeded).map(
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
    store.pushError(e);
  } finally {
    store.releaseBussyState();
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
