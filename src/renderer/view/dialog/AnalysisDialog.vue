<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.recordAnalysis }}</div>
      <div class="form-group">
        <div>{{ t.searchEngine }}</div>
        <PlayerSelector
          :player-uri="engineURI"
          :engine-settings="engineSettings"
          :filter-label="USIEngineLabel.RESEARCH"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engine-setting="onUpdatePlayerSetting"
          @select-player="onSelectPlayer"
        />
      </div>
      <div class="form-group">
        <div>{{ t.startEndCriteria }}</div>
        <div class="form-item">
          <ToggleButton
            :value="enableStartNumber"
            @change="
              (value: boolean) => {
                enableStartNumber = value;
              }
            "
          />
          <div class="form-item-small-label">{{ t.fromPrefix }}{{ t.plyPrefix }}</div>
          <input
            ref="startNumber"
            class="small"
            type="number"
            min="1"
            step="1"
            :disabled="!enableStartNumber"
          />
          <div class="form-item-small-label">{{ t.plySuffix }}{{ t.fromSuffix }}</div>
        </div>
        <div class="form-item">
          <ToggleButton
            :value="enableEndNumber"
            @change="
              (value: boolean) => {
                enableEndNumber = value;
              }
            "
          />
          <div class="form-item-small-label">{{ t.toPrefix }}{{ t.plyPrefix }}</div>
          <input
            ref="endNumber"
            class="small"
            type="number"
            min="1"
            step="1"
            :disabled="!enableEndNumber"
          />
          <div class="form-item-small-label">{{ t.plySuffix }}{{ t.toSuffix }}</div>
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.endCriteria1Move }}</div>
        <div class="form-item">
          <div class="form-item-small-label">{{ t.toPrefix }}</div>
          <input ref="maxSecondsPerMove" class="small" type="number" min="0" step="1" />
          <div class="form-item-small-label">{{ t.secondsSuffix }}{{ t.toSuffix }}</div>
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.outputSettings }}</div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.moveComments }}</div>
          <HorizontalSelector
            class="selector"
            :items="[
              { value: CommentBehavior.NONE, label: t.noOutputs },
              { value: CommentBehavior.INSERT, label: t.insertCommentToTop },
              { value: CommentBehavior.APPEND, label: t.appendCommentToBottom },
              { value: CommentBehavior.OVERWRITE, label: t.overwrite },
            ]"
            :value="commentBehavior"
            @change="
              (value: string) => {
                commentBehavior = value as CommentBehavior;
              }
            "
          />
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onStart()">解析実行</button>
        <button data-hotkey="Escape" @click="onCancel()">キャンセル</button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { readInputAsNumber } from "@/renderer/helpers/form.js";
import api from "@/renderer/ipc/api";
import { AnalysisSetting } from "@/common/settings/analysis";
import { USIEngineLabel, USIEngineSettings } from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { CommentBehavior } from "@/common/settings/analysis";
import { onBeforeUnmount, onMounted, ref } from "vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";

const store = useStore();
const dialog = ref();
const enableStartNumber = ref(false);
const startNumber = ref();
const enableEndNumber = ref(false);
const endNumber = ref();
const maxSecondsPerMove = ref();
const commentBehavior = ref(CommentBehavior.NONE);
const engineSettings = ref(new USIEngineSettings());
const engineURI = ref("");

store.retainBussyState();

onMounted(async () => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
  try {
    const analysisSetting = await api.loadAnalysisSetting();
    engineSettings.value = await api.loadUSIEngineSetting();
    engineURI.value = analysisSetting.usi?.uri || "";
    enableStartNumber.value = analysisSetting.startCriteria.enableNumber;
    startNumber.value.value = analysisSetting.startCriteria.number;
    enableEndNumber.value = analysisSetting.endCriteria.enableNumber;
    endNumber.value.value = analysisSetting.endCriteria.number;
    maxSecondsPerMove.value.value = analysisSetting.perMoveCriteria.maxSeconds;
    commentBehavior.value = analysisSetting.commentBehavior;
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

const onStart = () => {
  if (!engineURI.value || !engineSettings.value.hasEngine(engineURI.value)) {
    store.pushError(t.engineNotSelected);
    return;
  }
  const engine = engineSettings.value.getEngine(engineURI.value);
  const analysisSetting: AnalysisSetting = {
    usi: engine,
    startCriteria: {
      enableNumber: enableStartNumber.value,
      number: readInputAsNumber(startNumber.value),
    },
    endCriteria: {
      enableNumber: enableEndNumber.value,
      number: readInputAsNumber(endNumber.value),
    },
    perMoveCriteria: {
      maxSeconds: readInputAsNumber(maxSecondsPerMove.value),
    },
    commentBehavior: commentBehavior.value,
  };
  store.startAnalysis(analysisSetting);
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSetting = async (settings: USIEngineSettings) => {
  engineSettings.value = settings;
};

const onSelectPlayer = (uri: string) => {
  engineURI.value = uri;
};
</script>

<style scoped>
.root {
  width: 420px;
}
input.toggle {
  height: 1em;
  width: 1em;
  margin-right: 10px;
}
input.small {
  width: 50px;
}
.selector {
  max-width: 210px;
}
</style>
