<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.recordAnalysis }}</div>
      <div class="form-group">
        <div>{{ t.searchEngine }}</div>
        <PlayerSelector
          :player-uri="engineURI"
          :engines="engines"
          :filter-label="USIEngineLabel.RESEARCH"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
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
        <button data-hotkey="Enter" autofocus @click="onStart()">
          {{ t.analyze }}
        </button>
        <button data-hotkey="Escape" @click="onCancel()">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { readInputAsNumber } from "@/renderer/helpers/form.js";
import api from "@/renderer/ipc/api";
import { AnalysisSettings } from "@/common/settings/analysis";
import { CommentBehavior } from "@/common/settings/comment";
import { USIEngineLabel, USIEngines } from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";

const store = useStore();
const busyState = useBusyState();
const dialog = ref();
const enableStartNumber = ref(false);
const startNumber = ref();
const enableEndNumber = ref(false);
const endNumber = ref();
const maxSecondsPerMove = ref();
const commentBehavior = ref(CommentBehavior.NONE);
const engines = ref(new USIEngines());
const engineURI = ref("");

busyState.retain();

onMounted(async () => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
  try {
    const analysisSettings = await api.loadAnalysisSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = analysisSettings.usi?.uri || "";
    enableStartNumber.value = analysisSettings.startCriteria.enableNumber;
    startNumber.value.value = analysisSettings.startCriteria.number;
    enableEndNumber.value = analysisSettings.endCriteria.enableNumber;
    endNumber.value.value = analysisSettings.endCriteria.number;
    maxSecondsPerMove.value.value = analysisSettings.perMoveCriteria.maxSeconds;
    commentBehavior.value = analysisSettings.commentBehavior;
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

const onStart = () => {
  if (!engineURI.value || !engines.value.hasEngine(engineURI.value)) {
    useErrorStore().add(t.engineNotSelected);
    return;
  }
  const engine = engines.value.getEngine(engineURI.value);
  const analysisSettings: AnalysisSettings = {
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
  store.startAnalysis(analysisSettings);
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = async (val: USIEngines) => {
  engines.value = val;
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
