<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="dialog-title">通信対局（CSA プロトコル）</div>
      <div v-if="!logEnabled" class="dialog-form-area dialog-form-warning">
        <div class="dialog-form-note">
          一部のログが無効になっています。
          CSAプロトコルを使用した対局では各種ログの出力を推奨します。
          アプリ設定からログを有効にしてアプリを再起動してください。
        </div>
      </div>
      <div class="dialog-form-area">
        <div>プレイヤー</div>
        <PlayerSelector
          :players="players"
          :player-uri="playerURI"
          :engine-settings="engineSettings.json"
          :display-ponder-state="true"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engine-setting="onUpdatePlayerSetting"
          @select-player="onSelectPlayer"
        />
      </div>
      <div class="dialog-form-area">
        <div class="dialog-form-item">
          <div class="dialog-form-item-label-wide">履歴から選ぶ</div>
          <select class="long-text" value="0" @change="onChangeHistory">
            <option v-if="serverHistory.length === 0" value="0">
              履歴がありません
            </option>
            <option
              v-for="server of serverHistory"
              :key="server.index"
              :value="server.index"
            >
              {{ server.host }}:{{ server.port }} {{ server.id }}
            </option>
          </select>
        </div>
        <hr />
        <div class="dialog-form-item">
          <div class="dialog-form-item-label-wide">バージョン</div>
          <select
            ref="protocolVersion"
            class="long-text"
            value="CSA_v121"
            @change="onChangeProtocolVersion"
          >
            <option :value="CSAProtocolVersion.V121">
              CSAプロトコル1.2.1 標準
            </option>
            <option :value="CSAProtocolVersion.V121_FLOODGATE">
              CSAプロトコル1.2.1 読み筋コメント付き
            </option>
          </select>
        </div>
        <div
          v-if="selectedProtocolVersion === CSAProtocolVersion.V121"
          class="dialog-form-area dialog-form-item dialog-form-warning"
        >
          <div class="dialog-form-note">
            標準のCSAプロトコルでは評価値や読み筋が送信されません。
          </div>
        </div>
        <div
          v-if="selectedProtocolVersion === CSAProtocolVersion.V121_FLOODGATE"
          class="dialog-form-area dialog-form-item dialog-form-warning"
        >
          <div class="dialog-form-note">
            Floodgate仕様で評価値と読み筋を送信します。WCSCで使用しないでください。
          </div>
        </div>
        <div class="dialog-form-item">
          <div class="dialog-form-item-label-wide">接続先ホスト</div>
          <input
            ref="host"
            class="long-text"
            list="csa-server-host"
            type="text"
          />
          <datalist id="csa-server-host">
            <option value="gserver.computer-shogi.org" />
            <option value="wdoor.c.u-tokyo.ac.jp" />
            <option value="localhost" />
          </datalist>
        </div>
        <div class="dialog-form-item">
          <div class="dialog-form-item-label-wide">ポート番号</div>
          <input
            ref="port"
            class="number"
            list="csa-server-port-number"
            type="number"
          />
          <datalist id="csa-server-port-number">
            <option value="4081" />
          </datalist>
        </div>
        <div class="dialog-form-item">
          <div class="dialog-form-item-label-wide">ID</div>
          <input ref="id" class="long-text" type="text" />
        </div>
        <div class="dialog-form-item">
          <div class="dialog-form-item-label-wide">パスワード</div>
          <input ref="password" class="long-text" type="password" />
        </div>
        <div class="dialog-form-item">
          <input
            id="show-password"
            type="checkbox"
            @change="onTogglePasswordVisibility"
          />
          <label for="show-password">パスワードを表示する</label>
        </div>
        <div class="dialog-form-area dialog-form-item dialog-form-warning">
          <div v-if="isEncryptionAvailable" class="dialog-form-note">
            CSAプロトコルの規格上パスワードは平文で送信されます。
          </div>
          <div v-else class="dialog-form-note">
            OSの暗号化機能が利用できないため、入力したパスワードは平文で保存されます。
            保存したくない場合は「履歴に保存する」のチェックを外してください。
            なお、履歴の保存に関係なくCSAプロトコルの規格上パスワードは平文で送信されます。
          </div>
        </div>
        <div class="dialog-form-item">
          <input id="save-history" ref="saveHistory" type="checkbox" checked />
          <label for="save-history">
            履歴に保存する（最新{{ maxServerHistoryLenght }}件まで）
          </label>
        </div>
      </div>
      <div class="dialog-form-area">
        <div class="dialog-form-item">
          <div class="dialog-form-item-label-wide number">連続対局</div>
          <input ref="repeat" class="number" type="number" min="1" />
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
          <input id="auto-flip" ref="autoFlip" type="checkbox" />
          <label for="auto-flip">盤面の向きを自動で調整する</label>
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
import api from "@/ipc/api";
import { useStore } from "@/store";
import {
  CSAProtocolVersion,
  maxServerHistoryLenght,
  CSAGameSetting,
  validateCSAGameSetting,
  buildCSAGameSettingByHistory,
  defaultCSAGameSettingHistory,
} from "@/settings/csa";
import { showModalDialog } from "@/helpers/dialog";
import * as uri from "@/uri";
import { Icon } from "@/assets/icons";
import PlayerSelector from "@/components/dialog/PlayerSelector.vue";
import { PlayerSetting } from "@/settings/player";
import { readInputAsNumber } from "@/helpers/form";
import { installHotKey, uninstallHotKey } from "@/helpers/hotkey";

export default defineComponent({
  name: "CSAGameDialog",
  components: {
    PlayerSelector,
  },
  setup() {
    const store = useStore();
    const dialog: Ref = ref(null);
    const protocolVersion: Ref = ref(null);
    const selectedProtocolVersion = ref(CSAProtocolVersion.V121);
    const host: Ref = ref(null);
    const port: Ref = ref(null);
    const id: Ref = ref(null);
    const password: Ref = ref(null);
    const saveHistory: Ref = ref(null);
    const enableComment: Ref = ref(null);
    const enableAutoSave: Ref = ref(null);
    const repeat: Ref = ref(null);
    const autoFlip: Ref = ref(null);
    const isEncryptionAvailable: Ref = ref(false);
    const history = ref(defaultCSAGameSettingHistory());
    const engineSettings = ref(new USIEngineSettings());
    const playerURI = ref("");

    let defaultValueLoaded = false;
    let defaultValueApplied = false;
    store.retainBussyState();

    onMounted(async () => {
      try {
        isEncryptionAvailable.value = await api.isEncryptionAvailable();
        history.value = await api.loadCSAGameSettingHistory();
        engineSettings.value = await api.loadUSIEngineSetting();
        showModalDialog(dialog.value);
        installHotKey(dialog.value);
        defaultValueLoaded = true;
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

    onUpdated(() => {
      if (!defaultValueLoaded || defaultValueApplied) {
        return;
      }
      const defaultSetting = buildCSAGameSettingByHistory(history.value, 0);
      protocolVersion.value.value = selectedProtocolVersion.value =
        defaultSetting.server.protocolVersion;
      host.value.value = defaultSetting.server.host;
      port.value.value = defaultSetting.server.port;
      id.value.value = defaultSetting.server.id;
      password.value.value = defaultSetting.server.password;
      enableComment.value.checked = defaultSetting.enableComment;
      enableAutoSave.value.checked = defaultSetting.enableAutoSave;
      repeat.value.value = defaultSetting.repeat;
      autoFlip.value.checked = defaultSetting.autoFlip;
      playerURI.value = defaultSetting.player.uri;
      defaultValueApplied = true;
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
      const csaGameSetting: CSAGameSetting = {
        player: buildPlayerSetting(playerURI.value),
        server: {
          protocolVersion: protocolVersion.value.value,
          host: String(host.value.value || "").trim(),
          port: Number(port.value.value),
          id: String(id.value.value || ""),
          password: String(password.value.value || ""),
        },
        enableComment: enableComment.value.checked,
        enableAutoSave: enableAutoSave.value.checked,
        repeat: readInputAsNumber(repeat.value),
        autoFlip: autoFlip.value.checked,
      };
      const error = validateCSAGameSetting(csaGameSetting);
      if (error) {
        store.pushError(error);
      } else {
        store.loginCSAGame(csaGameSetting, {
          saveHistory: saveHistory.value.checked,
        });
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

    const onSelectPlayer = (uri: string) => {
      playerURI.value = uri;
    };

    const onTogglePasswordVisibility = (event: Event) => {
      const checkbox = event.target as HTMLInputElement;
      password.value.type = checkbox.checked ? "text" : "password";
    };

    const onChangeHistory = (event: Event) => {
      const select = event.target as HTMLSelectElement;
      const server = history.value.serverHistory[Number(select.value)];
      if (server) {
        protocolVersion.value.value = server.protocolVersion;
        host.value.value = server.host;
        port.value.value = server.port;
        id.value.value = server.id;
        password.value.value = server.password;
      }
    };

    const onChangeProtocolVersion = () => {
      selectedProtocolVersion.value = protocolVersion.value.value;
    };

    const players = computed(() => {
      return [
        { name: "人", uri: uri.ES_HUMAN },
        ...engineSettings.value.engineList,
      ];
    });

    const serverHistory = computed(() => {
      return history.value.serverHistory.map((serverSetting, index) => {
        return {
          index,
          ...serverSetting,
        };
      });
    });

    const logEnabled = computed(() => {
      return (
        store.appSetting.enableCSALog &&
        store.appSetting.enableAppLog &&
        store.appSetting.enableUSILog
      );
    });

    return {
      CSAProtocolVersion,
      maxServerHistoryLenght,
      dialog,
      protocolVersion,
      host,
      port,
      id,
      password,
      saveHistory,
      enableComment,
      enableAutoSave,
      repeat,
      autoFlip,
      engineSettings,
      playerURI,
      players,
      serverHistory,
      selectedProtocolVersion,
      onChangeProtocolVersion,
      logEnabled,
      isEncryptionAvailable,
      onStart,
      onCancel,
      onUpdatePlayerSetting,
      onSelectPlayer,
      onTogglePasswordVisibility,
      onChangeHistory,
      Icon,
    };
  },
});
</script>

<style scoped>
.root {
  width: 540px;
}
input.number {
  width: 100px;
}
.long-text {
  flex-grow: 1;
}
</style>
