<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">{{ t.game }}</div>
    <div class="form-group full-column">
      <div class="row regular-interval">
        <div class="half-column">
          <div class="top-label">{{ t.senteOrShitate }}</div>
          <PlayerSelector
            v-model:player-uri="blackPlayerURI"
            :contains-human="true"
            :contains-basic-engines="true"
            :engines="engines"
            :default-tag="getPredefinedUSIEngineTag('game')"
            :display-ponder-state="true"
            :display-thread-state="true"
            :display-multi-pv-state="true"
            @update-engines="onUpdatePlayerSettings"
          />
        </div>
        <div class="half-column">
          <div class="top-label">{{ t.goteOrUwate }}</div>
          <PlayerSelector
            v-if="whitePlayerURI"
            v-model:player-uri="whitePlayerURI"
            :contains-human="true"
            :contains-basic-engines="true"
            :engines="engines"
            :default-tag="getPredefinedUSIEngineTag('game')"
            :display-ponder-state="true"
            :display-thread-state="true"
            :display-multi-pv-state="true"
            @update-engines="onUpdatePlayerSettings"
          />
        </div>
      </div>
      <div class="row regular-interval">
        <div class="half-column">
          <div class="form-item">
            <div class="form-item-label">{{ t.allottedTime }}</div>
            <input v-model.number="hours" class="time" type="number" min="0" max="99" step="1" />
            <div class="form-item-small-label">{{ t.hoursSuffix }}</div>
            <input v-model.number="minutes" class="time" type="number" min="0" max="59" step="1" />
            <div class="form-item-small-label">{{ t.minutesSuffix }}</div>
          </div>
          <div class="form-item">
            <div class="form-item-label">{{ t.byoyomi }}</div>
            <input v-model.number="byoyomi" class="time" type="number" min="0" max="60" step="1" />
            <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
          </div>
          <div class="form-item">
            <div class="form-item-label">{{ t.increments }}</div>
            <input
              v-model.number="increment"
              class="time"
              type="number"
              min="0"
              max="99"
              step="1"
            />
            <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
          </div>
          <div class="form-item">
            <ToggleButton
              v-model:value="gameSettings.enableEngineTimeout"
              :label="t.enableEngineTimeout"
            />
          </div>
        </div>
        <div class="half-column">
          <div class="form-item">
            <div class="form-item-label">{{ t.allottedTime }}</div>
            <input
              v-model.number="whiteHours"
              class="time"
              type="number"
              min="0"
              max="99"
              step="1"
              :disabled="!setDifferentTime"
            />
            <div class="form-item-small-label">{{ t.hoursSuffix }}</div>
            <input
              v-model.number="whiteMinutes"
              class="time"
              type="number"
              min="0"
              max="59"
              step="1"
              :disabled="!setDifferentTime"
            />
            <div class="form-item-small-label">{{ t.minutesSuffix }}</div>
          </div>
          <div class="form-item">
            <div class="form-item-label">{{ t.byoyomi }}</div>
            <input
              v-model.number="whiteByoyomi"
              class="time"
              type="number"
              min="0"
              max="60"
              step="1"
              :disabled="!setDifferentTime"
            />
            <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
          </div>
          <div class="form-item">
            <div class="form-item-label">{{ t.increments }}</div>
            <input
              v-model.number="whiteIncrement"
              class="time"
              type="number"
              min="0"
              max="99"
              step="1"
              :disabled="!setDifferentTime"
            />
            <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
          </div>
          <div class="form-item">
            <ToggleButton v-model:value="setDifferentTime" :label="t.setDifferentTimeForGote" />
          </div>
        </div>
      </div>
      <div class="players-control">
        <button @click="onSwapColor">
          <Icon :icon="IconType.SWAP_H" />
          <span>{{ t.swapSenteGote }}</span>
        </button>
      </div>
    </div>
    <div class="form-group full-column">
      <div class="row regular-interval">
        <div class="half-column">
          <div class="form-item">
            <div class="form-item-label">{{ t.startPosition }}</div>
            <select v-model="gameSettings.startPosition">
              <option value="current">{{ t.currentPosition }}</option>
              <option value="list">{{ t.positionList }}</option>
              <option :value="InitialPositionType.STANDARD">
                {{ t.noHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_LANCE">
                {{ t.lanceHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_RIGHT_LANCE">
                {{ t.rightLanceHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_BISHOP">
                {{ t.bishopHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_ROOK">
                {{ t.rookHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_ROOK_LANCE">
                {{ t.rookLanceHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_2PIECES">
                {{ t.twoPiecesHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_4PIECES">
                {{ t.fourPiecesHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_6PIECES">
                {{ t.sixPiecesHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_8PIECES">
                {{ t.eightPiecesHandicap }}
              </option>
              <option :value="InitialPositionType.HANDICAP_10PIECES">
                {{ t.tenPiecesHandicap }}
              </option>
            </select>
          </div>
          <div v-show="gameSettings.startPosition === 'list'" class="form-item">
            <input v-model="gameSettings.startPositionListFile" type="text" placeholder="*.sfen" />
            <button class="thin" @click="onSelectStartPositionListFile">{{ t.select }}</button>
          </div>
          <div v-show="gameSettings.startPosition === 'list'" class="form-item">
            <ToggleButton v-model:value="startPositionListShuffle" :label="t.shuffle" />
          </div>
          <div class="form-item">
            <div class="form-item-label">{{ t.maxMoves }}</div>
            <input v-model.number="gameSettings.maxMoves" class="number" type="number" min="1" />
          </div>
          <div class="form-item">
            <div class="form-item-label">{{ t.gameRepetition }}</div>
            <input v-model.number="gameSettings.repeat" class="number" type="number" min="1" />
          </div>
          <div class="form-item">
            <div class="form-item-label">{{ t.jishogi }}</div>
            <select v-model="gameSettings.jishogiRule">
              <option :value="JishogiRule.NONE">{{ t.none }}</option>
              <option :value="JishogiRule.GENERAL24">{{ t.rule24 }}</option>
              <option :value="JishogiRule.GENERAL27">{{ t.rule27 }}</option>
              <option :value="JishogiRule.TRY">{{ t.tryRule }}</option>
            </select>
          </div>
        </div>
        <div class="half-column">
          <div class="form-item">
            <ToggleButton
              v-model:value="gameSettings.swapPlayers"
              :label="t.swapTurnWhenGameRepetition"
            />
          </div>
          <div class="form-item">
            <ToggleButton v-model:value="gameSettings.enableComment" :label="t.outputComments" />
          </div>
          <div class="form-item">
            <ToggleButton
              v-model:value="gameSettings.enableAutoSave"
              :label="t.saveRecordAutomatically"
            />
          </div>
          <div class="form-item">
            <ToggleButton
              v-model:value="gameSettings.humanIsFront"
              :label="t.adjustBoardToHumanPlayer"
            />
          </div>
        </div>
      </div>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="onStart()">
        {{ t.startGame }}
      </button>
      <button data-hotkey="Escape" @click="onCancel()">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { USIEngine, USIEngines, getPredefinedUSIEngineTag } from "@/common/settings/usi";
import { ref, onMounted } from "vue";
import api, { isNative } from "@/renderer/ipc/api";
import { useStore } from "@/renderer/store";
import {
  defaultGameSettings,
  GameSettings,
  JishogiRule,
  validateGameSettings,
  validateGameSettingsForWeb,
} from "@/common/settings/game";
import * as uri from "@/common/uri.js";
import { IconType } from "@/renderer/assets/icons";
import Icon from "@/renderer/view/primitive/Icon.vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import { PlayerSettings } from "@/common/settings/player";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { InitialPositionType } from "tsshogi";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const busyState = useBusyState();
const hours = ref(0);
const minutes = ref(0);
const byoyomi = ref(0);
const increment = ref(0);
const whiteHours = ref(0);
const whiteMinutes = ref(0);
const whiteByoyomi = ref(0);
const whiteIncrement = ref(0);
const setDifferentTime = ref(false);
const startPositionListShuffle = ref(false);
const gameSettings = ref(defaultGameSettings());
const engines = ref(new USIEngines());
const blackPlayerURI = ref("");
const whitePlayerURI = ref("");

busyState.retain();

onMounted(async () => {
  try {
    gameSettings.value = await api.loadGameSettings();
    engines.value = await api.loadUSIEngines();
    blackPlayerURI.value = gameSettings.value.black.uri;
    whitePlayerURI.value = gameSettings.value.white.uri;
    hours.value = Math.floor(gameSettings.value.timeLimit.timeSeconds / 3600);
    minutes.value = Math.floor(gameSettings.value.timeLimit.timeSeconds / 60) % 60;
    byoyomi.value = gameSettings.value.timeLimit.byoyomi;
    increment.value = gameSettings.value.timeLimit.increment;
    const whiteTimeLimit = gameSettings.value.whiteTimeLimit || gameSettings.value.timeLimit;
    whiteHours.value = Math.floor(whiteTimeLimit.timeSeconds / 3600);
    whiteMinutes.value = Math.floor(whiteTimeLimit.timeSeconds / 60) % 60;
    whiteByoyomi.value = whiteTimeLimit.byoyomi;
    whiteIncrement.value = whiteTimeLimit.increment;
    setDifferentTime.value = !!gameSettings.value.whiteTimeLimit;
    startPositionListShuffle.value = gameSettings.value.startPositionListOrder === "shuffle";
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

const buildPlayerSettings = (playerURI: string): PlayerSettings => {
  if (uri.isUSIEngine(playerURI) && engines.value.hasEngine(playerURI)) {
    const engine = engines.value.getEngine(playerURI) as USIEngine;
    return {
      name: engine.name,
      uri: playerURI,
      usi: engine,
    };
  }
  return {
    name: uri.isBasicEngine(playerURI) ? uri.basicEngineName(playerURI) : t.human,
    uri: playerURI,
  };
};

const onStart = () => {
  const newSettings: GameSettings = {
    ...gameSettings.value,
    black: buildPlayerSettings(blackPlayerURI.value),
    white: buildPlayerSettings(whitePlayerURI.value),
    timeLimit: {
      timeSeconds: (hours.value * 60 + minutes.value) * 60,
      byoyomi: byoyomi.value,
      increment: increment.value,
    },
    startPositionListOrder: startPositionListShuffle.value ? "shuffle" : "sequential",
  };
  if (setDifferentTime.value) {
    newSettings.whiteTimeLimit = {
      timeSeconds: (whiteHours.value * 60 + whiteMinutes.value) * 60,
      byoyomi: whiteByoyomi.value,
      increment: whiteIncrement.value,
    };
  } else {
    delete newSettings.whiteTimeLimit;
  }
  const error = isNative()
    ? validateGameSettings(newSettings)
    : validateGameSettingsForWeb(newSettings);
  if (error) {
    useErrorStore().add(error);
  } else {
    store.startGame(newSettings);
  }
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = (val: USIEngines) => {
  engines.value = val;
};

const onSwapColor = () => {
  [blackPlayerURI.value, whitePlayerURI.value] = [whitePlayerURI.value, blackPlayerURI.value];
  if (setDifferentTime.value) {
    [hours.value, whiteHours.value] = [whiteHours.value, hours.value];
    [minutes.value, whiteMinutes.value] = [whiteMinutes.value, minutes.value];
    [byoyomi.value, whiteByoyomi.value] = [whiteByoyomi.value, byoyomi.value];
    [increment.value, whiteIncrement.value] = [whiteIncrement.value, increment.value];
  }
};

const onSelectStartPositionListFile = async () => {
  useBusyState().retain();
  try {
    const sfenPath = await api.showSelectSFENDialog(gameSettings.value.startPositionListFile);
    if (sfenPath) {
      gameSettings.value.startPositionListFile = sfenPath;
    }
  } finally {
    useBusyState().release();
  }
};
</script>

<style scoped>
.top-label {
  text-align: center;
}
.full-column {
  width: 580px;
}
.half-column {
  width: 280px;
}
.players-control {
  width: 100%;
}
.players-control > * {
  margin-top: 5px;
}
input.time {
  text-align: right;
  width: 40px;
}
input.number {
  text-align: right;
  width: 80px;
}
</style>
