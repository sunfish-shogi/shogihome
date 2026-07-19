<template>
  <DialogFrame limited @cancel="onCancel">
    <div class="title">{{ t.createNextMoveProblemCollection }}</div>
    <div class="settings scroll">
      <div class="form-group warning">
        <div class="note">{{ t.nextMoveGenerationRequiresAnalyzedRecord }}</div>
      </div>
      <div class="form-group">
        <div>{{ t.recordDirectory }}</div>
        <div class="form-item row">
          <input v-model="settings.sourceDirectory" class="grow" type="text" />
          <button class="thin" @click="selectSourceDirectory()">{{ t.select }}</button>
        </div>
        <div class="form-item row">
          <HorizontalSelector
            v-model:value="settings.playerCriteria"
            :items="[
              { value: PlayerCriteria.ALL, label: t.allPlayers },
              { value: PlayerCriteria.BLACK, label: t.blackPlayerOnly },
              { value: PlayerCriteria.WHITE, label: t.whitePlayerOnly },
              { value: PlayerCriteria.FILTER_BY_NAME, label: t.filterByName },
            ]"
          />
        </div>
        <div v-show="settings.playerCriteria === PlayerCriteria.FILTER_BY_NAME" class="form-item">
          <input
            v-model="settings.playerName"
            class="grow"
            type="text"
            :placeholder="t.enterPartOfPlayerNameHere"
          />
        </div>
        <div class="form-item ply-range">
          <div class="form-item-small-label">{{ t.fromPrefix }}{{ t.plyPrefix }}</div>
          <input v-model.number="settings.minPly" class="small" type="number" min="0" step="1" />
          <div class="form-item-small-label">
            {{ t.plySuffix }}{{ t.fromSuffix }}{{ t.toPrefix }}{{ t.plyPrefix }}
          </div>
          <input v-model.number="settings.maxPly" class="small" type="number" min="0" step="1" />
          <div class="form-item-small-label">{{ t.plySuffix }}{{ t.toSuffix }}</div>
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.searchEngine }}</div>
        <PlayerSelector
          v-model:player-uri="engineURI"
          :engines="engines"
          :default-tag="getPredefinedUSIEngineTag('research')"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.suggestionsCount }}</div>
          <input v-model.number="settings.multiPV" class="small" type="number" min="2" step="1" />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.timePerPosition }}</div>
          <input
            v-model.number="settings.maxSecondsPerPosition"
            class="small"
            type="number"
            min="1"
            step="1"
          />
          <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
        </div>
      </div>
      <div class="form-group">
        <div>採用条件</div>
        <div class="note">解析済み棋譜から評価値の下落を検出し、その局面を再探索します。</div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.winRateDropThreshold }}</div>
          <input
            v-model.number="settings.winRateDropThreshold"
            class="number"
            type="number"
            min="1"
            max="100"
            step="1"
          />
          <div class="form-item-small-label">%</div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.minWinRate }}</div>
          <input
            v-model.number="settings.minWinRate"
            class="number"
            type="number"
            min="0"
            max="99"
            step="1"
          />
          <div class="form-item-small-label">%</div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.adoptionWinRateDiff }}</div>
          <input
            v-model.number="settings.adoptionWinRateDiff"
            class="number"
            type="number"
            min="1"
            max="100"
            step="1"
          />
          <div class="form-item-small-label">%</div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.acceptableWinRateDiff }}</div>
          <input
            v-model.number="settings.acceptableWinRateDiff"
            class="number"
            type="number"
            min="0"
            max="100"
            step="1"
          />
          <div class="form-item-small-label">%</div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.maxProblems }}</div>
          <input
            v-model.number="settings.maxProblems"
            class="number"
            type="number"
            min="1"
            step="1"
          />
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.outputFile }}</div>
        <div class="form-item row">
          <input v-model="settings.destinationFile" class="grow" type="text" />
          <button class="thin" @click="selectDestinationFile()">{{ t.select }}</button>
        </div>
      </div>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="onStart()">
        {{ t.createNextMoveProblemCollection }}
      </button>
      <button data-hotkey="Escape" @click="onCancel()">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import api from "@/renderer/ipc/api";
import {
  defaultNextMoveGenerationSettings,
  NextMoveGenerationSettings,
  validateNextMoveGenerationSettings,
} from "@/common/settings/nextmove";
import { PlayerCriteria } from "@/common/settings/book";
import { getPredefinedUSIEngineTag, USIEngines } from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { onMounted, ref } from "vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const busyState = useBusyState();
const settings = ref(defaultNextMoveGenerationSettings());
const engines = ref(new USIEngines());
const engineURI = ref("");

busyState.retain();

onMounted(async () => {
  try {
    settings.value = await api.loadNextMoveGenerationSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = settings.value.usi?.uri || "";
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
    const path = await api.showSelectDirectoryDialog(settings.value.sourceDirectory);
    if (path) {
      settings.value.sourceDirectory = path;
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
    const path = await api.showSaveNextMoveCollectionDialog(
      settings.value.destinationFile || "problems.json",
    );
    if (path) {
      settings.value.destinationFile = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const onStart = () => {
  if (!engineURI.value || !engines.value.hasEngine(engineURI.value)) {
    useErrorStore().add(t.engineNotSelected);
    return;
  }
  const engine = engines.value.getEngine(engineURI.value);
  const newSettings: NextMoveGenerationSettings = {
    ...settings.value,
    usi: engine,
  };
  const error = validateNextMoveGenerationSettings(newSettings);
  if (error) {
    useErrorStore().add(error);
    return;
  }
  store.startNextMoveGeneration(newSettings);
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = async (val: USIEngines) => {
  engines.value = val;
};
</script>

<style scoped>
.settings {
  width: 480px;
  max-width: 100%;
}
input.small {
  width: 50px;
}
input.number {
  text-align: right;
  width: 80px;
}
.ply-range > .form-item-small-label:first-child {
  margin-left: 0;
}
</style>
