<template>
  <DialogFrame @cancel="cancel">
    <div class="title">{{ t.manageEngines }}</div>
    <div class="form-group">
      <div class="option-filter">
        <input v-model.trim="filter" class="filter" :placeholder="t.filterByOptionName" />
      </div>
      <div class="column option-list">
        <!-- 名前 -->
        <div class="row option">
          <div class="option-name">{{ t.engineName }}</div>
          <div class="option-unchangeable">{{ engine.defaultName }}</div>
        </div>
        <!-- 作者 -->
        <div v-show="!filterWords.length" class="row option">
          <div class="option-name">{{ t.author }}</div>
          <div class="option-unchangeable">{{ engine.author }}</div>
        </div>
        <!-- 場所 -->
        <div v-show="!filterWords.length" class="row option">
          <div class="option-name">{{ t.enginePath }}</div>
          <div class="option-unchangeable">
            <div>{{ engine.path }}</div>
            <button class="thin" @click="replaceEnginePath">
              {{ t.replaceEnginePath }}
            </button>
            <button class="thin" @click="openEngineDir">
              {{ t.openDirectory }}
            </button>
          </div>
        </div>
        <!-- 表示名 -->
        <div v-show="!filterWords.length" class="row option">
          <div class="option-name">{{ t.displayName }}</div>
          <div class="option-value">
            <input v-model="engine.name" class="option-value-text" type="text" />
          </div>
        </div>
        <!-- オプション -->
        <div
          v-for="(option, index) in options"
          v-show="optionVisibility[index]"
          :key="option.name"
          class="row option"
        >
          <div class="option-name">
            <!-- オプション名 -->
            {{ option.displayName || option.name }}
            <span v-if="option.displayName" class="option-name-original">
              {{ option.name }}
            </span>
          </div>
          <div class="option-value">
            <span class="option-value-control">
              <!-- 数値 (spin) -->
              <input
                v-if="option.type === 'spin'"
                v-model.number="option.currentValue"
                class="option-value-number"
                type="number"
                :min="option.min"
                :max="option.max"
                step="1"
                :name="option.name"
              />
              <!-- 文字列 (string) -->
              <input
                v-if="option.type === 'string'"
                v-model="option.currentValue"
                class="option-value-text"
                type="text"
                :name="option.name"
              />
              <!-- ファイル名 (filename) -->
              <input
                v-if="option.type === 'filename'"
                v-model="option.currentValue"
                class="option-value-filename"
                type="text"
                :name="option.name"
              />
              <button
                v-if="option.type === 'filename'"
                class="thin"
                @click="selectFile(option.name)"
              >
                {{ t.select }}
              </button>
              <!-- ブール値 (check) -->
              <HorizontalSelector
                v-if="option.type === 'check'"
                v-model:value="option.currentValue as string"
                :items="
                  option.default
                    ? [
                        { value: 'true', label: 'ON' },
                        { value: 'false', label: 'OFF' },
                      ]
                    : [
                        { value: '', label: t.defaultValue },
                        { value: 'true', label: 'ON' },
                        { value: 'false', label: 'OFF' },
                      ]
                "
              />
              <!-- 選択 (combo) -->
              <ComboBox
                v-if="option.type === 'combo'"
                v-model="option.currentValue as string"
                :options="[
                  { value: '', label: t.defaultValue },
                  ...option.vars.map((v) => ({ value: v, label: v })),
                ]"
                :free-text-label="t.freeTextUnsafe"
              />
              <button
                v-if="option.type === 'button'"
                class="thin"
                @click="sendOptionButtonSignal(option.name)"
              >
                {{ t.invoke }}
              </button>
            </span>
            <!-- デフォルト値 -->
            <span
              v-if="option.type !== 'button' && (option.default || option.default === 0)"
              class="option-default-value"
              :class="{ highlight: option.currentValue !== option.default }"
            >
              {{ t.defaultValue }}:
              {{
                option.type === "check"
                  ? option.default === "true"
                    ? "ON"
                    : "OFF"
                  : option.default
              }}
            </span>
            <!-- 早期 ponder -->
            <div v-if="option.name === 'USI_Ponder' && option.type === 'check'" class="additional">
              <ToggleButton v-model:value="engine.enableEarlyPonder" :label="t.earlyPonder" />
              <div v-show="engine.enableEarlyPonder" class="form-group warning">
                <div class="note">
                  {{ t.earlyPonderFeatureSendsPonderhitCommandWithYaneuraOusNonStandardOptions }}
                  {{ t.ifYourEngineNotSupportTheOptionsItMayCauseUnexpectedBehavior }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="menu row">
      <button class="wide" @click="reset()">
        {{ t.resetToEngineDefaultValues }}
      </button>
      <button class="wide" @click="copyOptions()">
        <Icon :icon="IconType.COPY" />
        {{ t.copy }}
      </button>
      <button class="wide" @click="pasteOptions()">
        <Icon :icon="IconType.PASTE" />
        {{ t.paste }}
      </button>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="ok()">
        {{ okButtonText }}
      </button>
      <button data-hotkey="Escape" @click="cancel()">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t, usiOptionNameMap } from "@/common/i18n";
import { filter as filterString } from "@/common/helpers/string";
import api from "@/renderer/ipc/api";
import {
  compressUSIEngineOptionsClipboardData,
  decompressUSIEngineOptionsClipboardData,
  emptyUSIEngine,
  getUSIEngineOptionCurrentValue,
  mergeUSIEngine,
  USIEngine,
  USIEngineOption,
  USIEngineOptionsClipboardData,
} from "@/common/settings/usi";
import { computed, onMounted, PropType, ref } from "vue";
import { useAppSettings } from "@/renderer/store/settings";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import ComboBox from "@/renderer/view/primitive/ComboBox.vue";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { useConfirmationStore } from "@/renderer/store/confirm";
import DialogFrame from "./DialogFrame.vue";
import { useMessageStore } from "@/renderer/store/message";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";

const props = defineProps({
  latest: {
    type: Object as PropType<USIEngine>,
    required: true,
  },
  okButtonText: {
    type: String,
    required: false,
    default: "OK",
  },
});
const emit = defineEmits<{
  ok: [engine: USIEngine];
  cancel: [];
}>();

type Option = USIEngineOption & {
  displayName: string;
  currentValue: string | number;
};

const busyState = useBusyState();
const appSettings = useAppSettings();
const filter = ref("");
const filterWords = computed(() => filter.value.split(/ +/).filter((s) => s));
const engine = ref(emptyUSIEngine());
const options = ref<Option[]>([]);
const optionVisibility = computed(() =>
  options.value.map(
    (option) =>
      filterWords.value.length === 0 ||
      (option.displayName && filterString(option.displayName, filterWords.value)) ||
      filterString(option.name, filterWords.value),
  ),
);

busyState.retain();
onMounted(async () => {
  try {
    const timeoutSeconds = appSettings.engineTimeoutSeconds;
    engine.value = await api.getUSIEngineInfo(props.latest.path, timeoutSeconds);
    mergeUSIEngine(engine.value, props.latest);
    options.value = Object.values(engine.value.options)
      .sort((a, b): number => (a.order < b.order ? -1 : 1))
      .map((option) => ({
        displayName: appSettings.translateEngineOptionName ? usiOptionNameMap[option.name] : "",
        ...option,
        currentValue: getUSIEngineOptionCurrentValue(option) ?? (option.type === "spin" ? 0 : ""),
      }));
  } catch (e) {
    useErrorStore().add(e);
    emit("cancel");
  } finally {
    busyState.release();
  }
});

const openEngineDir = () => {
  api.openExplorer(engine.value.path);
};

const replaceEnginePath = async () => {
  busyState.retain();
  try {
    const path = await api.showSelectUSIEngineDialog();
    if (!path) {
      return;
    }
    const timeoutSeconds = appSettings.engineTimeoutSeconds;
    useConfirmationStore().show({
      message: t.incompatibleOptionsWillBeDiscardedDoYouReallyWantToReplaceTheEnginePath,
      onOk: async () => {
        try {
          const newEngine = await api.getUSIEngineInfo(path, timeoutSeconds);
          mergeUSIEngine(newEngine, engine.value); // もとの設定を引き継ぐ
          engine.value = newEngine;
        } catch (e) {
          useErrorStore().add(e);
        }
      },
    });
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const selectFile = async (name: string) => {
  busyState.retain();
  try {
    const path = await api.showSelectFileDialog();
    const option = options.value.find((option) => option.name === name);
    if (path && option) {
      option.currentValue = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const sendOptionButtonSignal = async (name: string) => {
  busyState.retain();
  try {
    const timeoutSeconds = appSettings.engineTimeoutSeconds;
    await api.sendUSIOptionButtonSignal(engine.value.path, name, timeoutSeconds);
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const reset = () => {
  engine.value.name = engine.value.defaultName;
  engine.value.enableEarlyPonder = false;
  options.value.forEach((option) => {
    if (option.type === "button") {
      return;
    }
    option.currentValue = option.default ?? (option.type === "spin" ? 0 : "");
  });
};

const buildEngineOptions = () => {
  const newEngineOptions = { ...engine.value.options };
  options.value.forEach((option) => {
    const org = engine.value.options[option.name];
    if (!org) {
      return;
    }
    const engineOption = { ...org };
    if (engineOption.type === "button") {
      return;
    }
    if (engineOption.type === "check") {
      engineOption.value = (option.currentValue as "true" | "false" | "") || undefined;
    } else if (engineOption.type === "combo") {
      engineOption.value = (option.currentValue as string) || undefined;
    } else if (engineOption.type === "spin") {
      engineOption.value = option.currentValue as number;
    } else {
      engineOption.value = (option.currentValue as string) || undefined;
    }
    newEngineOptions[option.name] = engineOption;
  });
  return newEngineOptions;
};

const restoreEngineOptions = (newOptions: { [name: string]: USIEngineOption }) => {
  options.value.forEach((option) => {
    const newOption = newOptions[option.name];
    if (!newOption || newOption.type === "button" || newOption.type !== option.type) {
      return;
    }
    option.currentValue =
      getUSIEngineOptionCurrentValue(newOption) ?? (option.type === "spin" ? 0 : "");
  });
};

const copyOptions = async () => {
  const data: USIEngineOptionsClipboardData = {
    schema: "es://usi-engine-options-clipboard-data",
    options: buildEngineOptions(),
    enableEarlyPonder: engine.value.enableEarlyPonder,
  };
  try {
    const base64 = await compressUSIEngineOptionsClipboardData(data);
    await navigator.clipboard.writeText(base64);
    useMessageStore().enqueue({ text: t.copiedToClipboard });
  } catch (e) {
    useErrorStore().add(e);
  }
};

const pasteOptions = async () => {
  busyState.retain();
  try {
    const base64 = await navigator.clipboard.readText();
    const data = await decompressUSIEngineOptionsClipboardData(base64);
    restoreEngineOptions(data.options);
    engine.value.enableEarlyPonder = data.enableEarlyPonder;
    useMessageStore().enqueue({ text: t.pastedFromClipboard });
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const ok = () => {
  engine.value.options = buildEngineOptions();
  emit("ok", engine.value);
};

const cancel = () => {
  emit("cancel");
};
</script>

<style scoped>
.option-list {
  width: 740px;
  height: calc(100vh - 250px);
  max-height: 800px;
  overflow: auto;
}
.option {
  margin: 5px 5px 0px 5px;
  padding: 5px;
  border-bottom: 1px solid var(--text-separator-color);
}
.option-filter {
  margin: 0px 5px 5px 5px;
}
.filter {
  width: 100%;
}
.option-name {
  width: 290px;
  text-align: left;
  border-right: 1px solid var(--text-separator-color);
  margin-right: 10px;
}
.option-name .option-name-original {
  font-size: 0.7em;
}
.option-unchangeable {
  width: 415px;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-all;
}
.option-value {
  width: 415px;
  text-align: left;
}
.option-value-control {
  margin-right: 10px;
}
.option-value-text {
  width: 380px;
  text-align: left;
}
.option-value-filename {
  width: 250px;
  text-align: left;
}
.option-value-number {
  width: 100px;
  text-align: right;
}
.option button {
  vertical-align: top;
}
.option button:not(:last-child) {
  margin-right: 5px;
}
.option-default-value {
  padding: 0.3em;
  font-size: 0.7em;
  white-space: nowrap;
  font-weight: 600;
  opacity: 0.7;
}
.option-default-value.highlight {
  color: var(--text-color-danger);
  background-color: var(--text-bg-color-danger);
}
.option .additional {
  margin-top: 5px;
}
.menu > *:not(:first-child) {
  margin-left: 5px;
}
</style>
