<template>
  <div>
    <dialog ref="dialog">
      <div class="title">{{ t.game }}</div>
      <div class="form-group full-column">
        <div class="row regular-interval">
          <div class="half-column">
            <div class="top-label">{{ t.senteOrShitate }}</div>
            <PlayerSelector
              :player-uri="blackPlayerURI"
              :contains-human="true"
              :contains-basic-engines="true"
              :engines="engines"
              :filter-label="USIEngineLabel.GAME"
              :display-ponder-state="true"
              :display-thread-state="true"
              :display-multi-pv-state="true"
              @update-engines="onUpdatePlayerSettings"
              @select-player="onSelectBlackPlayer"
            />
          </div>
          <div class="half-column">
            <div class="top-label">{{ t.goteOrUwate }}</div>
            <PlayerSelector
              v-if="whitePlayerURI"
              :player-uri="whitePlayerURI"
              :contains-human="true"
              :contains-basic-engines="true"
              :engines="engines"
              :filter-label="USIEngineLabel.GAME"
              :display-ponder-state="true"
              :display-thread-state="true"
              :display-multi-pv-state="true"
              @update-engines="onUpdatePlayerSettings"
              @select-player="onSelectWhitePlayer"
            />
          </div>
        </div>
        <div class="row regular-interval">
          <div class="half-column">
            <div class="form-item">
              <div class="form-item-label">{{ t.allottedTime }}</div>
              <input ref="hours" class="time" type="number" min="0" max="99" step="1" />
              <div class="form-item-small-label">{{ t.hoursSuffix }}</div>
              <input ref="minutes" class="time" type="number" min="0" max="59" step="1" />
              <div class="form-item-small-label">{{ t.minutesSuffix }}</div>
            </div>
            <div class="form-item">
              <div class="form-item-label">{{ t.byoyomi }}</div>
              <input ref="byoyomi" class="time" type="number" min="0" max="60" step="1" />
              <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
            </div>
            <div class="form-item">
              <div class="form-item-label">{{ t.increments }}</div>
              <input ref="increment" class="time" type="number" min="0" max="99" step="1" />
              <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
            </div>
            <div class="form-item">
              <ToggleButton
                :label="t.enableEngineTimeout"
                :value="enableEngineTimeout"
                @change="
                  (value: boolean) => {
                    enableEngineTimeout = value;
                  }
                "
              />
            </div>
          </div>
          <div class="half-column">
            <div class="form-item">
              <div class="form-item-label">{{ t.allottedTime }}</div>
              <input ref="whiteHours" class="time" type="number" min="0" max="99" step="1" />
              <div class="form-item-small-label">{{ t.hoursSuffix }}</div>
              <input ref="whiteMinutes" class="time" type="number" min="0" max="59" step="1" />
              <div class="form-item-small-label">{{ t.minutesSuffix }}</div>
            </div>
            <div class="form-item">
              <div class="form-item-label">{{ t.byoyomi }}</div>
              <input ref="whiteByoyomi" class="time" type="number" min="0" max="60" step="1" />
              <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
            </div>
            <div class="form-item">
              <div class="form-item-label">{{ t.increments }}</div>
              <input ref="whiteIncrement" class="time" type="number" min="0" max="99" step="1" />
              <div class="form-item-small-label">{{ t.secondsSuffix }}</div>
            </div>
            <div class="form-item">
              <ToggleButton
                :label="t.setDifferentTimeForGote"
                :value="setDifferentTime"
                @change="
                  (value: boolean) => {
                    setDifferentTime = value;
                    onUpdateSetDifferentTime();
                  }
                "
              />
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
              <select
                :value="startPosition"
                @change="
                  (event) =>
                    (startPosition = (event.target as HTMLSelectElement)
                      .value as GameStartPositionType)
                "
              >
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
            <div v-show="startPosition === 'list'" class="form-item">
              <input ref="startPositionListFile" type="text" placeholder="*.sfen" />
              <button class="thin" @click="onSelectStartPositionListFile">{{ t.select }}</button>
            </div>
            <div v-show="startPosition === 'list'" class="form-item">
              <ToggleButton
                :label="t.shuffle"
                :value="startPositionListShuffle"
                @change="
                  (value: boolean) => {
                    startPositionListShuffle = value;
                  }
                "
              />
            </div>
            <div class="form-item">
              <div class="form-item-label">{{ t.maxMoves }}</div>
              <input ref="maxMoves" class="number" type="number" min="1" />
            </div>
            <div class="form-item">
              <div class="form-item-label">{{ t.gameRepetition }}</div>
              <input ref="repeat" class="number" type="number" min="1" />
            </div>
            <div class="form-item">
              <div class="form-item-label">{{ t.jishogi }}</div>
              <select ref="jishogiRule">
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
                :label="t.swapTurnWhenGameRepetition"
                :value="swapPlayers"
                @change="
                  (value: boolean) => {
                    swapPlayers = value;
                  }
                "
              />
            </div>
            <div class="form-item">
              <ToggleButton
                :label="t.outputComments"
                :value="enableComment"
                @change="
                  (value: boolean) => {
                    enableComment = value;
                  }
                "
              />
            </div>
            <div class="form-item">
              <ToggleButton
                :label="t.saveRecordAutomatically"
                :value="enableAutoSave"
                @change="
                  (value: boolean) => {
                    enableAutoSave = value;
                  }
                "
              />
            </div>
            <div class="form-item">
              <ToggleButton
                :label="t.adjustBoardToHumanPlayer"
                :value="humanIsFront"
                @change="
                  (value: boolean) => {
                    humanIsFront = value;
                  }
                "
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
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { USIEngineLabel, USIEngine, USIEngines } from "@/common/settings/usi";
import { ref, onMounted, onUpdated, onBeforeUnmount } from "vue";
import api, { isNative } from "@/renderer/ipc/api";
import { useStore } from "@/renderer/store";
import {
  defaultGameSettings,
  GameSettings,
  GameStartPositionType,
  JishogiRule,
  validateGameSettings,
  validateGameSettingsForWeb,
} from "@/common/settings/game";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import * as uri from "@/common/uri.js";
import { readInputAsNumber } from "@/renderer/helpers/form.js";
import { IconType } from "@/renderer/assets/icons";
import Icon from "@/renderer/view/primitive/Icon.vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import { PlayerSettings } from "@/common/settings/player";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { InitialPositionType } from "tsshogi";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";

const store = useStore();
const busyState = useBusyState();
const dialog = ref();
const hours = ref();
const minutes = ref();
const byoyomi = ref();
const increment = ref();
const enableEngineTimeout = ref(false);
const whiteHours = ref();
const whiteMinutes = ref();
const whiteByoyomi = ref();
const whiteIncrement = ref();
const setDifferentTime = ref(false);
const startPosition = ref<GameStartPositionType>(InitialPositionType.STANDARD);
const startPositionListFile = ref();
const startPositionListShuffle = ref(false);
const maxMoves = ref();
const repeat = ref();
const jishogiRule = ref();
const swapPlayers = ref(false);
const enableComment = ref(false);
const enableAutoSave = ref(false);
const humanIsFront = ref(false);
const gameSettings = ref(defaultGameSettings());
const engines = ref(new USIEngines());
const blackPlayerURI = ref("");
const whitePlayerURI = ref("");

let defaultValueLoaded = false;
let defaultValueApplied = false;
busyState.retain();

onMounted(async () => {
  try {
    gameSettings.value = await api.loadGameSettings();
    engines.value = await api.loadUSIEngines();
    blackPlayerURI.value = gameSettings.value.black.uri;
    whitePlayerURI.value = gameSettings.value.white.uri;
    showModalDialog(dialog.value, onCancel);
    installHotKeyForDialog(dialog.value);
    defaultValueLoaded = true;
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

const onUpdateSetDifferentTime = () => {
  whiteHours.value.disabled = !setDifferentTime.value;
  whiteMinutes.value.disabled = !setDifferentTime.value;
  whiteByoyomi.value.disabled = !setDifferentTime.value;
  whiteIncrement.value.disabled = !setDifferentTime.value;
};

onUpdated(() => {
  if (!defaultValueLoaded || defaultValueApplied) {
    return;
  }
  hours.value.value = Math.floor(gameSettings.value.timeLimit.timeSeconds / 3600);
  minutes.value.value = Math.floor(gameSettings.value.timeLimit.timeSeconds / 60) % 60;
  byoyomi.value.value = gameSettings.value.timeLimit.byoyomi;
  increment.value.value = gameSettings.value.timeLimit.increment;
  enableEngineTimeout.value = gameSettings.value.enableEngineTimeout;
  const whiteTimeLimit = gameSettings.value.whiteTimeLimit || gameSettings.value.timeLimit;
  whiteHours.value.value = Math.floor(whiteTimeLimit.timeSeconds / 3600);
  whiteMinutes.value.value = Math.floor(whiteTimeLimit.timeSeconds / 60) % 60;
  whiteByoyomi.value.value = whiteTimeLimit.byoyomi;
  whiteIncrement.value.value = whiteTimeLimit.increment;
  setDifferentTime.value = !!gameSettings.value.whiteTimeLimit;
  startPosition.value = gameSettings.value.startPosition;
  startPositionListFile.value.value = gameSettings.value.startPositionListFile;
  startPositionListShuffle.value = gameSettings.value.startPositionListOrder === "shuffle";
  maxMoves.value.value = gameSettings.value.maxMoves;
  repeat.value.value = gameSettings.value.repeat;
  jishogiRule.value.value = gameSettings.value.jishogiRule;
  swapPlayers.value = gameSettings.value.swapPlayers;
  enableComment.value = gameSettings.value.enableComment;
  enableAutoSave.value = gameSettings.value.enableAutoSave;
  humanIsFront.value = gameSettings.value.humanIsFront;
  defaultValueApplied = true;
  onUpdateSetDifferentTime();
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
  const gameSettings: GameSettings = {
    black: buildPlayerSettings(blackPlayerURI.value),
    white: buildPlayerSettings(whitePlayerURI.value),
    timeLimit: {
      timeSeconds: (readInputAsNumber(hours.value) * 60 + readInputAsNumber(minutes.value)) * 60,
      byoyomi: readInputAsNumber(byoyomi.value),
      increment: readInputAsNumber(increment.value),
    },
    enableEngineTimeout: enableEngineTimeout.value,
    startPosition: startPosition.value,
    startPositionListFile: startPositionListFile.value.value,
    startPositionListOrder: startPositionListShuffle.value ? "shuffle" : "sequential",
    maxMoves: readInputAsNumber(maxMoves.value),
    repeat: readInputAsNumber(repeat.value),
    jishogiRule: jishogiRule.value.value,
    swapPlayers: swapPlayers.value,
    enableComment: enableComment.value,
    enableAutoSave: enableAutoSave.value,
    humanIsFront: humanIsFront.value,
  };
  if (setDifferentTime.value) {
    gameSettings.whiteTimeLimit = {
      timeSeconds:
        (readInputAsNumber(whiteHours.value) * 60 + readInputAsNumber(whiteMinutes.value)) * 60,
      byoyomi: readInputAsNumber(whiteByoyomi.value),
      increment: readInputAsNumber(whiteIncrement.value),
    };
  }
  const error = isNative()
    ? validateGameSettings(gameSettings)
    : validateGameSettingsForWeb(gameSettings);
  if (error) {
    useErrorStore().add(error);
  } else {
    store.startGame(gameSettings);
  }
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = (val: USIEngines) => {
  engines.value = val;
};

const onSelectBlackPlayer = (uri: string) => {
  blackPlayerURI.value = uri;
};
const onSelectWhitePlayer = (uri: string) => {
  whitePlayerURI.value = uri;
};

const onSwapColor = () => {
  [blackPlayerURI.value, whitePlayerURI.value] = [whitePlayerURI.value, blackPlayerURI.value];
  if (setDifferentTime.value) {
    [hours.value.value, whiteHours.value.value] = [whiteHours.value.value, hours.value.value];
    [minutes.value.value, whiteMinutes.value.value] = [
      whiteMinutes.value.value,
      minutes.value.value,
    ];
    [byoyomi.value.value, whiteByoyomi.value.value] = [
      whiteByoyomi.value.value,
      byoyomi.value.value,
    ];
    [increment.value.value, whiteIncrement.value.value] = [
      whiteIncrement.value.value,
      increment.value.value,
    ];
  }
};

const onSelectStartPositionListFile = async () => {
  useBusyState().retain();
  try {
    const sfenPath = await api.showSelectSFENDialog(startPositionListFile.value.value);
    if (sfenPath) {
      startPositionListFile.value.value = sfenPath;
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
