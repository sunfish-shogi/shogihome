<template>
  <div>
    <dialog ref="dialog">
      <div class="dialog-title">対局</div>
      <div class="dialog-form-area">
        <div class="players">
          <div class="player">
            <div class="top-label">先手（下手）</div>
            <PlayerSelector
              :players="players"
              :player-uri="blackPlayerURI"
              :engine-settings="engineSettings.json"
              :display-ponder-state="true"
              :display-thread-state="true"
              :display-multi-pv-state="true"
              @update-engine-setting="onUpdatePlayerSetting"
              @select-player="onSelectBlackPlayer"
            />
          </div>
          <div class="player">
            <div class="top-label">後手（上手）</div>
            <PlayerSelector
              v-if="whitePlayerURI"
              :players="players"
              :player-uri="whitePlayerURI"
              :engine-settings="engineSettings.json"
              :display-ponder-state="true"
              :display-thread-state="true"
              :display-multi-pv-state="true"
              @update-engine-setting="onUpdatePlayerSetting"
              @select-player="onSelectWhitePlayer"
            />
          </div>
        </div>
        <div class="players-control">
          <button @click="onSwapColor">
            <ButtonIcon class="icon" :icon="Icon.SWAP_H" />
            先後入れ替え
          </button>
        </div>
      </div>
      <div class="dialog-form-areas-h">
        <div class="dialog-form-area time-limit">
          <div class="top-label">時間</div>
          <div class="dialog-form-item">
            <div class="dialog-form-item-label">持ち時間</div>
            <input
              ref="hours"
              class="time"
              type="number"
              min="0"
              max="99"
              step="1"
            />
            <div class="dialog-form-item-unit">時間</div>
            <input
              ref="minutes"
              class="time"
              type="number"
              min="0"
              max="59"
              step="1"
            />
            <div class="dialog-form-item-unit">分</div>
          </div>
          <div class="dialog-form-item">
            <div class="dialog-form-item-label">秒読み</div>
            <input
              ref="byoyomi"
              class="time"
              type="number"
              min="0"
              max="60"
              step="1"
            />
            <div class="dialog-form-item-unit">秒</div>
          </div>
          <div class="dialog-form-item">
            <div class="dialog-form-item-label">増加</div>
            <input
              ref="increment"
              class="time"
              type="number"
              min="0"
              max="99"
              step="1"
            />
            <div class="dialog-form-item-unit">秒</div>
          </div>
          <div class="dialog-form-item">
            <input
              id="enable-engine-timeout"
              ref="enableEngineTimeout"
              type="checkbox"
            />
            <label for="enable-engine-timeout">エンジンの時間切れあり</label>
          </div>
        </div>
        <div class="dialog-form-area flags">
          <div class="top-label">その他</div>
          <div class="dialog-form-item">
            <div class="dialog-form-item-label">開始局面</div>
            <select ref="startPosition">
              <option value="current">現在の局面</option>
              <option value="standard">平手</option>
              <option value="handicapLance">香落ち</option>
              <option value="handicapRightLance">右香落ち</option>
              <option value="handicapBishop">角落ち</option>
              <option value="handicapRook">飛車落ち</option>
              <option value="handicapRookLance">飛車香落ち</option>
              <option value="handicap2Pieces">2枚落ち</option>
              <option value="handicap4Pieces">4枚落ち</option>
              <option value="handicap6Pieces">6枚落ち</option>
              <option value="handicap8Pieces">8枚落ち</option>
            </select>
          </div>
          <div class="dialog-form-item">
            <div class="dialog-form-item-label">最大手数</div>
            <input ref="maxMoves" class="number" type="number" min="1" />
          </div>
          <div class="dialog-form-item">
            <div class="dialog-form-item-label">連続対局</div>
            <input ref="repeat" class="number" type="number" min="1" />
          </div>
          <div class="dialog-form-item">
            <input id="swap-players" ref="swapPlayers" type="checkbox" />
            <label for="swap-players">1局ごとに手番を入れ替える</label>
          </div>
          <div class="dialog-form-item">
            <input id="enable-comment" ref="enableComment" type="checkbox" />
            <label for="enable-comment">コメントを出力する</label>
          </div>
          <div class="dialog-form-item">
            <input id="enable-auto-save" ref="enableAutoSave" type="checkbox" />
            <label for="enable-auto-save">棋譜を自動で保存する</label>
          </div>
          <div class="dialog-form-item">
            <input id="human-is-front" ref="humanIsFront" type="checkbox" />
            <label for="human-is-front">人を手前に表示する</label>
          </div>
        </div>
      </div>
      <div class="dialog-main-buttons">
        <button
          data-hotkey="Enter"
          autofocus
          class="dialog-button"
          @click="onStart()"
        >
          対局開始
        </button>
        <button class="dialog-button" data-hotkey="Escape" @click="onCancel()">
          キャンセル
        </button>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts">
import { USIEngineSetting, USIEngineSettings } from "@/settings/usi";
import {
  ref,
  onMounted,
  defineComponent,
  Ref,
  computed,
  onUpdated,
  onBeforeUnmount,
} from "vue";
import api, { isNative } from "@/ipc/api";
import { useStore } from "@/store";
import { CommentBehavior } from "@/store/record";
import {
  defaultGameSetting,
  GameSetting,
  validateGameSetting,
  validateGameSettingForWeb,
} from "@/settings/game";
import { showModalDialog } from "@/helpers/dialog";
import * as uri from "@/uri";
import { readInputAsNumber } from "@/helpers/form";
import { Icon } from "@/assets/icons";
import ButtonIcon from "@/components/primitive/ButtonIcon.vue";
import PlayerSelector from "@/components/dialog/PlayerSelector.vue";
import { PlayerSetting } from "@/settings/player";
import { installHotKey, uninstallHotKey } from "@/helpers/hotkey";

export default defineComponent({
  name: "GameDialog",
  components: {
    ButtonIcon,
    PlayerSelector,
  },
  setup() {
    const store = useStore();
    const dialog: Ref = ref(null);
    const hours: Ref = ref(null);
    const minutes: Ref = ref(null);
    const byoyomi: Ref = ref(null);
    const increment: Ref = ref(null);
    const startPosition: Ref = ref(null);
    const enableEngineTimeout: Ref = ref(null);
    const maxMoves: Ref = ref(null);
    const humanIsFront: Ref = ref(null);
    const repeat: Ref = ref(null);
    const swapPlayers: Ref = ref(null);
    const enableComment: Ref = ref(null);
    const enableAutoSave: Ref = ref(null);
    const gameSetting = ref(defaultGameSetting());
    const engineSettings = ref(new USIEngineSettings());
    const blackPlayerURI = ref("");
    const whitePlayerURI = ref("");

    store.retainBussyState();

    onMounted(async () => {
      try {
        gameSetting.value = await api.loadGameSetting();
        engineSettings.value = await api.loadUSIEngineSetting();
        blackPlayerURI.value = gameSetting.value.black.uri;
        whitePlayerURI.value = gameSetting.value.white.uri;
        showModalDialog(dialog.value);
        installHotKey(dialog.value);
      } catch (e) {
        store.pushError(e);
        store.closeModalDialog();
      } finally {
        store.releaseBussyState();
      }
    });

    onBeforeUnmount(() => {
      uninstallHotKey(dialog.value);
    });

    let defaultValueApplied = false;
    onUpdated(() => {
      if (!defaultValueApplied) {
        hours.value.value = Math.floor(
          gameSetting.value.timeLimit.timeSeconds / 3600
        );
        minutes.value.value =
          Math.floor(gameSetting.value.timeLimit.timeSeconds / 60) % 60;
        byoyomi.value.value = gameSetting.value.timeLimit.byoyomi;
        increment.value.value = gameSetting.value.timeLimit.increment;
        startPosition.value.value =
          gameSetting.value.startPosition !== undefined
            ? gameSetting.value.startPosition
            : "current";
        enableEngineTimeout.value.checked =
          gameSetting.value.enableEngineTimeout;
        maxMoves.value.value = gameSetting.value.maxMoves;
        humanIsFront.value.checked = gameSetting.value.humanIsFront;
        repeat.value.value = gameSetting.value.repeat;
        swapPlayers.value.checked = gameSetting.value.swapPlayers;
        enableComment.value.checked = gameSetting.value.enableComment;
        enableAutoSave.value.checked = gameSetting.value.enableAutoSave;
        defaultValueApplied = true;
      }
    });

    const buildPlayerSetting = (playerURI: string): PlayerSetting => {
      if (
        uri.isUSIEngine(playerURI) &&
        engineSettings.value.hasEngine(playerURI)
      ) {
        const engine = engineSettings.value.getEngine(
          playerURI
        ) as USIEngineSetting;
        return {
          name: engine.name,
          uri: playerURI,
          usi: engine,
        };
      }
      return {
        name: "人",
        uri: uri.ES_HUMAN,
      };
    };

    const onStart = () => {
      const gameSetting: GameSetting = {
        black: buildPlayerSetting(blackPlayerURI.value),
        white: buildPlayerSetting(whitePlayerURI.value),
        timeLimit: {
          timeSeconds:
            (readInputAsNumber(hours.value) * 60 +
              readInputAsNumber(minutes.value)) *
            60,
          byoyomi: readInputAsNumber(byoyomi.value),
          increment: readInputAsNumber(increment.value),
        },
        startPosition:
          startPosition.value.value !== "current"
            ? startPosition.value.value
            : undefined,
        enableEngineTimeout: enableEngineTimeout.value.checked,
        maxMoves: readInputAsNumber(maxMoves.value),
        humanIsFront: humanIsFront.value.checked,
        repeat: readInputAsNumber(repeat.value),
        swapPlayers: swapPlayers.value.checked,
        enableComment: enableComment.value.checked,
        enableAutoSave: enableAutoSave.value.checked,
      };
      const error = isNative()
        ? validateGameSetting(gameSetting)
        : validateGameSettingForWeb(gameSetting);
      if (error) {
        store.pushError(error);
      } else {
        store.startGame(gameSetting);
      }
    };

    const onCancel = () => {
      store.closeModalDialog();
    };

    const onUpdatePlayerSetting = async (setting: USIEngineSetting) => {
      const clone = new USIEngineSettings(engineSettings.value.json);
      clone.updateEngine(setting);
      store.retainBussyState();
      try {
        await api.saveUSIEngineSetting(clone);
        engineSettings.value = clone;
      } catch (e) {
        store.pushError(e);
      } finally {
        store.releaseBussyState();
      }
    };

    const onSelectBlackPlayer = (uri: string) => {
      blackPlayerURI.value = uri;
    };
    const onSelectWhitePlayer = (uri: string) => {
      whitePlayerURI.value = uri;
    };

    const onSwapColor = () => {
      [blackPlayerURI.value, whitePlayerURI.value] = [
        whitePlayerURI.value,
        blackPlayerURI.value,
      ];
    };

    const players = computed(() => {
      return [
        { name: "人", uri: uri.ES_HUMAN },
        ...engineSettings.value.engineList,
      ];
    });

    return {
      CommentBehavior,
      dialog,
      hours,
      minutes,
      byoyomi,
      increment,
      startPosition,
      enableEngineTimeout,
      maxMoves,
      humanIsFront,
      repeat,
      swapPlayers,
      enableComment,
      enableAutoSave,
      engineSettings,
      blackPlayerURI,
      whitePlayerURI,
      players,
      onStart,
      onCancel,
      onUpdatePlayerSetting,
      onSelectBlackPlayer,
      onSelectWhitePlayer,
      onSwapColor,
      Icon,
    };
  },
});
</script>

<style scoped>
.top-label {
  text-align: center;
}
.dialog-form-area {
  width: 520px;
  display: flex;
  flex-direction: column;
}
.players {
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  width: 100%;
}
.player {
  width: 250px;
}
.players-control {
  width: 100%;
}
.players-control > * {
  margin-top: 5px;
}
.dialog-form-area.time-limit {
  width: 260px;
}
input.time {
  text-align: right;
  width: 40px;
}
input.number {
  text-align: right;
  width: 80px;
}
.dialog-form-area.flags {
  width: 225px;
}
</style>
