<template>
  <div>
    <dialog ref="dialog">
      <div class="title">{{ t.engineSettings }}</div>
      <div class="form-group">
        <div class="option-filter">
          <input
            ref="filter"
            class="filter"
            :placeholder="t.filterByOptionName"
            @input="updateFilter"
          />
        </div>
        <div class="column option-list">
          <!-- 名前 -->
          <div class="row option">
            <div class="option-name">{{ t.engineName }}</div>
            <div class="option-unchangeable">{{ engine.defaultName }}</div>
          </div>
          <!-- 作者 -->
          <div class="row option" :class="{ hidden: filterWords.length }">
            <div class="option-name">{{ t.author }}</div>
            <div class="option-unchangeable">{{ engine.author }}</div>
          </div>
          <!-- 場所 -->
          <div class="row option" :class="{ hidden: filterWords.length }">
            <div class="option-name">{{ t.enginePath }}</div>
            <div class="option-unchangeable">
              <div>{{ engine.path }}</div>
              <button class="thin" @click="openEngineDir">
                {{ t.openDirectory }}
              </button>
            </div>
          </div>
          <!-- 表示名 -->
          <div class="row option" :class="{ hidden: filterWords.length }">
            <div class="option-name">{{ t.displayName }}</div>
            <div class="option-value">
              <input
                ref="engineNameInput"
                class="option-value-text"
                type="text"
                name="ElectronShogiEngineName"
              />
            </div>
          </div>
          <!-- オプション -->
          <div
            v-for="option in options"
            :key="option.name"
            class="row option"
            :class="{ hidden: !option.visible }"
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
                  :ref="
                    (el) => {
                      inputs[option.name] = el as HTMLInputElement;
                    }
                  "
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
                  :ref="
                    (el) => {
                      inputs[option.name] = el as HTMLInputElement;
                    }
                  "
                  class="option-value-text"
                  type="text"
                  :name="option.name"
                />
                <!-- ファイル名 (filename) -->
                <input
                  v-if="option.type === 'filename'"
                  :ref="
                    (el) => {
                      inputs[option.name] = el as HTMLInputElement;
                    }
                  "
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
                  :ref="
                    (el: unknown) => {
                      selectors[option.name] = el as InstanceType<typeof HorizontalSelector>;
                    }
                  "
                  value=""
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
                <select
                  v-if="option.type === 'combo'"
                  :ref="
                    (el) => {
                      inputs[option.name] = el as HTMLSelectElement;
                    }
                  "
                  class="option-value-combo"
                >
                  <option value="">{{ t.defaultValue }}</option>
                  <option v-for="v in option.vars" :key="v" :value="v">
                    {{ v }}
                  </option>
                </select>
                <button
                  v-if="option.type === 'button'"
                  class="thin"
                  @click="sendOption(option.name)"
                >
                  {{ t.invoke }}
                </button>
              </span>
              <!-- デフォルト値 -->
              <span
                v-if="option.default !== undefined && option.default !== ''"
                class="option-default-value"
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
              <div
                v-if="option.name === 'USI_Ponder' && option.type === 'check'"
                class="additional"
              >
                <ToggleButton
                  :label="t.earlyPonder"
                  :value="enableEarlyPonder"
                  @change="
                    (value: boolean) => {
                      enableEarlyPonder = value;
                    }
                  "
                />
                <div class="form-group warning" :class="{ hidden: !enableEarlyPonder }">
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
      <button class="wide" @click="reset()">
        {{ t.resetToEngineDefaultValues }}
      </button>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="ok()">
          {{ okButtonText }}
        </button>
        <button data-hotkey="Escape" @click="cancel()">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t, usiOptionNameMap } from "@/common/i18n";
import { filter as filterString } from "@/common/helpers/string";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { readInputAsNumber } from "@/renderer/helpers/form.js";
import api from "@/renderer/ipc/api";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import {
  emptyUSIEngineSetting,
  getUSIEngineOptionCurrentValue,
  mergeUSIEngineSetting,
  USIEngineOption,
  USIEngineSetting,
} from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { computed, onBeforeUnmount, onMounted, onUpdated, PropType, ref } from "vue";
import { useAppSetting } from "@/renderer/store/setting";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";

type Option = USIEngineOption & {
  displayName?: string;
  visible: boolean;
};

const props = defineProps({
  latestEngineSetting: {
    type: Object as PropType<USIEngineSetting>,
    required: true,
  },
  okButtonText: {
    type: String,
    required: false,
    default: "OK",
  },
});
const emit = defineEmits<{
  ok: [setting: USIEngineSetting];
  cancel: [];
}>();

const store = useStore();
const appSetting = useAppSetting();
const dialog = ref();
const engineNameInput = ref();
const enableEarlyPonder = ref(false);
const filter = ref();
const filterWords = ref([] as string[]);
const inputs = ref({} as { [key: string]: HTMLInputElement | HTMLSelectElement });
const selectors = ref({} as { [key: string]: InstanceType<typeof HorizontalSelector> });
const engine = ref(emptyUSIEngineSetting());
let defaultValueLoaded = false;
let defaultValueApplied = false;
store.retainBussyState();
onMounted(async () => {
  showModalDialog(dialog.value, cancel);
  installHotKeyForDialog(dialog.value);
  try {
    const timeoutSeconds = appSetting.engineTimeoutSeconds;
    engine.value = await api.getUSIEngineInfo(props.latestEngineSetting.path, timeoutSeconds);
    mergeUSIEngineSetting(engine.value, props.latestEngineSetting);
    engineNameInput.value.value = engine.value.name;
    enableEarlyPonder.value = engine.value.enableEarlyPonder;
    defaultValueLoaded = true;
  } catch (e) {
    store.pushError(e);
    emit("cancel");
  } finally {
    store.releaseBussyState();
  }
});
const options = computed(() =>
  Object.values(engine.value.options)
    .sort((a, b): number => (a.order < b.order ? -1 : 1))
    .map((option) => {
      const enableFilter = filterWords.value.length > 0;
      const ret: Option = {
        ...option,
        value: getUSIEngineOptionCurrentValue(option),
        visible: !enableFilter,
      };
      if (appSetting.translateEngineOptionName) {
        ret.displayName = usiOptionNameMap[option.name];
      }
      if (enableFilter) {
        ret.visible =
          (ret.displayName && filterString(ret.displayName, filterWords.value)) ||
          filterString(ret.name, filterWords.value);
      }
      return ret;
    }),
);
onUpdated(() => {
  if (!defaultValueLoaded || defaultValueApplied) {
    return;
  }
  for (const option of options.value) {
    if (option.value === undefined) {
      continue;
    }
    if (option.type === "check") {
      selectors.value[option.name].setValue((option.value as string) || "");
    } else if (inputs.value[option.name]) {
      inputs.value[option.name].value = option.value + "";
    }
  }
  defaultValueApplied = true;
});
onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});
const updateFilter = () => {
  filterWords.value = String(filter.value.value)
    .trim()
    .split(/ +/)
    .filter((s) => s);
};
const openEngineDir = () => {
  api.openExplorer(engine.value.path);
};
const selectFile = async (name: string) => {
  store.retainBussyState();
  try {
    const path = await api.showSelectFileDialog();
    const elem = inputs.value[name];
    if (path && elem) {
      elem.value = path;
    }
  } catch (e) {
    store.pushError(e);
  } finally {
    store.releaseBussyState();
  }
};
const sendOption = async (name: string) => {
  store.retainBussyState();
  try {
    const timeoutSeconds = appSetting.engineTimeoutSeconds;
    await api.sendUSISetOption(engine.value.path, name, timeoutSeconds);
  } catch (e) {
    store.pushError(e);
  } finally {
    store.releaseBussyState();
  }
};
const reset = () => {
  engineNameInput.value.value = engine.value.defaultName;
  enableEarlyPonder.value = engine.value.enableEarlyPonder;
  for (const option of options.value) {
    const value =
      engine.value.options[option.name].default !== undefined
        ? engine.value.options[option.name].default + ""
        : "";
    if (option.type === "check") {
      selectors.value[option.name].setValue(value);
    } else if (inputs.value[option.name]) {
      inputs.value[option.name].value = value;
    }
  }
};
const ok = () => {
  engine.value.name = engineNameInput.value.value;
  engine.value.enableEarlyPonder = enableEarlyPonder.value;
  for (const option of options.value) {
    if (option.type === "check") {
      engine.value.options[option.name].value =
        selectors.value[option.name].getValue() || undefined;
    } else if (inputs.value[option.name]) {
      const elem = inputs.value[option.name];
      engine.value.options[option.name].value = !elem.value
        ? undefined
        : option.type === "spin"
          ? readInputAsNumber(elem as HTMLInputElement)
          : elem.value;
    }
  }
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
.option-value-combo {
  text-align: left;
}
.option button {
  vertical-align: top;
}
.option-default-value {
  font-size: 0.7em;
  white-space: nowrap;
  font-weight: 600;
  opacity: 0.7;
}
.option .additional {
  margin-top: 5px;
}
</style>
