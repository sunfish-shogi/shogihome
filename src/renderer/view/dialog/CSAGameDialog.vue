<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.csaProtocolOnlineGame }}</div>
      <div class="form-group scroll">
        <div v-if="!logEnabled" class="form-group warning">
          <div class="note">
            {{ t.someLogsDisabled }}
            {{ t.logsRecommendedForCSAProtocol }}
            {{ t.pleaseEnableLogsAndRestart }}
          </div>
        </div>
        <div class="form-group">
          <div>{{ t.player }}</div>
          <PlayerSelector
            v-model:player-uri="playerURI"
            :contains-human="true"
            :contains-basic-engines="true"
            :engines="engines"
            :filter-label="USIEngineLabel.GAME"
            :display-ponder-state="true"
            :display-thread-state="true"
            :display-multi-pv-state="true"
            @update-engines="onUpdatePlayerSettings"
          />
          <hr v-if="uri.isUSIEngine(playerURI)" />
          <div v-if="uri.isUSIEngine(playerURI)" class="form-item">
            <div class="form-item-label-wide">{{ t.restartItEveryGame }}</div>
            <ToggleButton v-model:value="restartPlayerEveryGame" />
          </div>
        </div>
        <div class="form-group">
          <div>{{ t.server }}</div>
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.selectFromHistory }}
            </div>
            <select class="long-text" value="0" @change="onChangeHistory">
              <option v-if="history.serverHistory.length === 0" value="0">
                {{ t.noHistory }}
              </option>
              <option v-for="(server, index) in history.serverHistory" :key="index" :value="index">
                {{ server.host }}:{{ server.port }} {{ server.id }}
              </option>
            </select>
          </div>
          <hr />
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.version }}</div>
            <select v-model="protocolVersion" class="long-text">
              <option :value="CSAProtocolVersion.V121">
                {{ t.csaProtocolV121 }}
              </option>
              <option :value="CSAProtocolVersion.V121_FLOODGATE">
                {{ t.csaProtocolV121WithPVComments }}
              </option>
            </select>
          </div>
          <div v-if="protocolVersion === CSAProtocolVersion.V121" class="form-group warning">
            <div class="note">
              {{ t.notSendPVOnStandardCSAProtocol }}
            </div>
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.host }}</div>
            <input ref="host" class="long-text" list="csa-server-host" type="text" />
            <datalist id="csa-server-host">
              <option value="gserver.computer-shogi.org"></option>
              <option value="wdoor.c.u-tokyo.ac.jp"></option>
              <option value="localhost"></option>
              <option value="127.0.0.1"></option>
            </datalist>
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.portNumber }}</div>
            <input ref="port" class="number" list="csa-server-port-number" type="number" />
            <datalist id="csa-server-port-number">
              <option value="4081"></option>
            </datalist>
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">ID</div>
            <input ref="id" class="long-text" type="text" />
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.password }}</div>
            <input ref="password" class="long-text" :type="revealPassword ? 'text' : 'password'" />
          </div>
          <div class="form-item">
            <div class="form-item-label-wide"></div>
            <ToggleButton v-model:value="revealPassword" :label="t.revealPassword" />
          </div>
          <div class="form-group warning">
            <div v-if="isEncryptionAvailable" class="note">
              {{ t.csaProtocolSendPlaintextPassword }}
            </div>
            <div v-else class="note">
              {{ t.passwordWillSavedPlaintextBecauseOSSideEncryptionNotAvailable }}
              {{ t.pleaseUncheckSaveHistoryIfNotWantSave }}
              {{ t.csaProtocolSendPlaintextPasswordRegardlessOfHistory }}
            </div>
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.keepaliveInitialDelay }}</div>
            <input
              ref="keepaliveInitialDelay"
              class="number"
              type="number"
              value="10"
              min="1"
              max="7200"
            />
            <div class="form-item-small-label">
              {{ t.secondsSuffix }} ({{ t.between(1, 7200) }})
            </div>
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.blankLinePing }}</div>
            <ToggleButton v-model:value="blankLinePing" />
          </div>
          <div v-show="blankLinePing" class="form-item">
            <div class="form-item-label-wide">{{ t.blankLinePingInitialDelay }}</div>
            <input
              ref="blankLineInitialDelay"
              class="number"
              type="number"
              value="40"
              min="30"
              max="7200"
            />
            <div class="form-item-small-label">
              {{ t.secondsSuffix }} ({{ t.between(30, 7200) }})
            </div>
          </div>
          <div v-show="blankLinePing" class="form-item">
            <div class="form-item-label-wide">{{ t.blankLinePingInterval }}</div>
            <input
              ref="blankLineInterval"
              class="number"
              type="number"
              value="40"
              min="30"
              max="7200"
            />
            <div class="form-item-small-label">
              {{ t.secondsSuffix }} ({{ t.between(30, 7200) }})
            </div>
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.saveHistory }}</div>
            <ToggleButton v-model:value="saveHistory" />
          </div>
          <hr />
          <div class="form-item">
            <div class="form-item-label-wide number">
              {{ t.gameRepetition }}
            </div>
            <input ref="repeat" class="number" type="number" min="1" />
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.autoRelogin }}</div>
            <ToggleButton v-model:value="autoRelogin" />
          </div>
        </div>
        <div class="form-group">
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.outputComments }}</div>
            <ToggleButton v-model:value="enableComment" />
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.saveRecordAutomatically }}
            </div>
            <ToggleButton v-model:value="enableAutoSave" />
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.adjustBoardAutomatically }}
            </div>
            <ToggleButton v-model:value="autoFlip" />
          </div>
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Mod+c" @click="onExportYAML()">
          <Icon :icon="IconType.COPY" />YAML
        </button>
        <button @click="onExportJSON()"><Icon :icon="IconType.COPY" />JSON</button>
        <button @click="onExportCommand()"><Icon :icon="IconType.COPY" />{{ t.command }}</button>
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
import YAML from "yaml";
import { t } from "@/common/i18n";
import { USIEngineLabel, USIEngine, USIEngines } from "@/common/settings/usi";
import { ref, onMounted, computed, onUpdated, onBeforeUnmount } from "vue";
import api from "@/renderer/ipc/api";
import { useStore } from "@/renderer/store";
import {
  CSAProtocolVersion,
  CSAGameSettings,
  validateCSAGameSettings,
  buildCSAGameSettingsByHistory,
  defaultCSAGameSettingsHistory,
  exportCSAGameSettingsForCLI,
  compressCSAGameSettingsForCLI,
} from "@/common/settings/csa";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import * as uri from "@/common/uri.js";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import { PlayerSettings } from "@/common/settings/player";
import { readInputAsNumber } from "@/renderer/helpers/form.js";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useAppSettings } from "@/renderer/store/settings";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { useMessageStore } from "@/renderer/store/message";

const store = useStore();
const busyState = useBusyState();
const messageStore = useMessageStore();
const appSettings = useAppSettings();
const dialog = ref();
const protocolVersion = ref(CSAProtocolVersion.V121);
const host = ref();
const port = ref();
const id = ref();
const password = ref();
const revealPassword = ref(false);
const keepaliveInitialDelay = ref();
const blankLinePing = ref(false);
const blankLineInitialDelay = ref();
const blankLineInterval = ref();
const saveHistory = ref(true);
const repeat = ref();
const autoRelogin = ref(false);
const restartPlayerEveryGame = ref(false);
const enableComment = ref(false);
const enableAutoSave = ref(false);
const autoFlip = ref(false);
const isEncryptionAvailable = ref(false);
const history = ref(defaultCSAGameSettingsHistory());
const engines = ref(new USIEngines());
const playerURI = ref("");

let defaultValueLoaded = false;
let defaultValueApplied = false;
busyState.retain();

onMounted(async () => {
  try {
    isEncryptionAvailable.value = await api.isEncryptionAvailable();
    history.value = await api.loadCSAGameSettingsHistory();
    engines.value = await api.loadUSIEngines();
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

onUpdated(() => {
  if (!defaultValueLoaded || defaultValueApplied) {
    return;
  }
  const defaultSettings = buildCSAGameSettingsByHistory(history.value, 0);
  protocolVersion.value = defaultSettings.server.protocolVersion;
  host.value.value = defaultSettings.server.host;
  port.value.value = defaultSettings.server.port;
  id.value.value = defaultSettings.server.id;
  password.value.value = defaultSettings.server.password;
  keepaliveInitialDelay.value.value = defaultSettings.server.tcpKeepalive.initialDelay;
  blankLinePing.value = !!defaultSettings.server.blankLinePing;
  blankLineInitialDelay.value.value = defaultSettings.server.blankLinePing?.initialDelay || 40;
  blankLineInterval.value.value = defaultSettings.server.blankLinePing?.interval || 40;
  repeat.value.value = defaultSettings.repeat;
  autoRelogin.value = defaultSettings.autoRelogin;
  restartPlayerEveryGame.value = defaultSettings.restartPlayerEveryGame;
  enableComment.value = defaultSettings.enableComment;
  enableAutoSave.value = defaultSettings.enableAutoSave;
  autoFlip.value = defaultSettings.autoFlip;
  playerURI.value = defaultSettings.player.uri;
  defaultValueApplied = true;
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
    uri: uri.ES_HUMAN,
  };
};

const buildConfig = (): CSAGameSettings => {
  return {
    player: buildPlayerSettings(playerURI.value),
    server: {
      protocolVersion: protocolVersion.value,
      host: String(host.value.value || "").trim(),
      port: Number(port.value.value),
      id: String(id.value.value || "").trim(),
      password: String(password.value.value || "").trim(),
      tcpKeepalive: {
        initialDelay: readInputAsNumber(keepaliveInitialDelay.value),
      },
      blankLinePing: blankLinePing.value
        ? {
            initialDelay: readInputAsNumber(blankLineInitialDelay.value),
            interval: readInputAsNumber(blankLineInterval.value),
          }
        : undefined,
    },
    repeat: readInputAsNumber(repeat.value),
    autoRelogin: autoRelogin.value,
    restartPlayerEveryGame: restartPlayerEveryGame.value,
    enableComment: enableComment.value,
    enableAutoSave: enableAutoSave.value,
    autoFlip: autoFlip.value,
  };
};

const onExportYAML = () => {
  const settings = exportCSAGameSettingsForCLI(buildConfig(), appSettings);
  if (settings instanceof Error) {
    useErrorStore().add(settings);
    return;
  }
  navigator.clipboard.writeText(YAML.stringify(settings));
  messageStore.enqueue({
    text: t.yamlFormatSettingsCopiedToClipboard,
  });
};

const onExportJSON = () => {
  const settings = exportCSAGameSettingsForCLI(buildConfig(), appSettings);
  if (settings instanceof Error) {
    useErrorStore().add(settings);
    return;
  }
  navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
  messageStore.enqueue({
    text: t.jsonFormatSettingsCopiedToClipboard,
  });
};

const onExportCommand = () => {
  const settings = exportCSAGameSettingsForCLI(buildConfig(), appSettings);
  if (settings instanceof Error) {
    useErrorStore().add(settings);
    return;
  }
  compressCSAGameSettingsForCLI(settings).then((compressed) => {
    navigator.clipboard.writeText(`npx usi-csa-bridge --base64 ${compressed}`);
    messageStore.enqueue({
      text: t.usiCsaBridgeCommandCopiedToClipboard,
    });
  });
};

const onStart = () => {
  const csaGameSettings = buildConfig();
  const error = validateCSAGameSettings(csaGameSettings);
  if (error) {
    useErrorStore().add(error);
  } else {
    store.loginCSAGame(csaGameSettings, {
      saveHistory: saveHistory.value,
    });
  }
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = async (val: USIEngines) => {
  engines.value = val;
};

const onChangeHistory = (event: Event) => {
  const select = event.target as HTMLSelectElement;
  const server = history.value.serverHistory[Number(select.value)];
  if (server) {
    protocolVersion.value = server.protocolVersion;
    host.value.value = server.host;
    port.value.value = server.port;
    id.value.value = server.id;
    password.value.value = server.password;
    keepaliveInitialDelay.value.value = server.tcpKeepalive.initialDelay;
    blankLinePing.value = !!server.blankLinePing;
    if (server.blankLinePing) {
      blankLineInitialDelay.value.value = server.blankLinePing.initialDelay;
      blankLineInterval.value.value = server.blankLinePing.interval;
    }
  }
};

const logEnabled = computed(() => {
  const appSettings = useAppSettings();
  return appSettings.enableCSALog && appSettings.enableAppLog && appSettings.enableUSILog;
});
</script>

<style scoped>
.root {
  width: 560px;
}
input.number {
  width: 100px;
}
.long-text {
  width: 250px;
}
.main-buttons button {
  line-height: 150%;
}
</style>
