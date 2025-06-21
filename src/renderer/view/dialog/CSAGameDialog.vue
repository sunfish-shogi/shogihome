<template>
  <DialogFrame limited @cancel="onCancel">
    <div class="title">{{ t.csaProtocolOnlineGame }}</div>
    <div class="form-group scroll">
      <div v-if="!logEnabled" class="form-group warning">
        <div class="note">
          {{ t.someLogsDisabled }}<br />
          {{ t.logsRecommendedForCSAProtocol }}<br />
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
          :default-tag="getPredefinedUSIEngineTag('game')"
          :display-ponder-state="true"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
        <hr v-if="uri.isUSIEngine(playerURI)" />
        <div v-if="uri.isUSIEngine(playerURI)" class="form-item">
          <div class="form-item-label-wide">{{ t.restartItEveryGame }}</div>
          <ToggleButton v-model:value="csaGameSettings.restartPlayerEveryGame" />
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
          <select v-model="csaGameSettings.server.protocolVersion" class="long-text">
            <option :value="CSAProtocolVersion.V121">
              {{ t.csaProtocolV121 }}
            </option>
            <option :value="CSAProtocolVersion.V121_FLOODGATE">
              {{ t.csaProtocolV121WithPVComments }}
            </option>
          </select>
        </div>
        <div
          v-if="csaGameSettings.server.protocolVersion === CSAProtocolVersion.V121"
          class="form-group warning"
        >
          <div class="note">
            {{ t.notSendPVOnStandardCSAProtocol }}
          </div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.host }}</div>
          <input
            v-model.trim="csaGameSettings.server.host"
            class="long-text"
            list="csa-server-host"
            type="text"
          />
          <datalist id="csa-server-host">
            <option :value="officialCSAServerDomain"></option>
            <option :value="floodgateDomain"></option>
            <option value="localhost"></option>
            <option value="127.0.0.1"></option>
          </datalist>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.portNumber }}</div>
          <input
            v-model.number="csaGameSettings.server.port"
            class="number"
            list="csa-server-port-number"
            type="number"
          />
          <datalist id="csa-server-port-number">
            <option value="4081"></option>
          </datalist>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">ID</div>
          <input v-model.trim="csaGameSettings.server.id" class="long-text" type="text" />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.password }}</div>
          <input
            v-model.trim="csaGameSettings.server.password"
            class="long-text"
            :type="revealPassword ? 'text' : 'password'"
          />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide"></div>
          <ToggleButton v-model:value="revealPassword" :label="t.revealPassword" />
        </div>
        <div v-if="isFloodgate && !validFloodgatePassword" class="form-group warning">
          <div class="note">{{ t.floodgatePasswordShouldStartWithGameName }}</div>
        </div>
        <div v-else-if="isFloodgate && !officialFloodgateGameName" class="form-group warning">
          <div class="note">{{ t.thisIsNotFloodgateOfficialGameName }}</div>
        </div>
        <div v-if="!isEncryptionAvailable" class="form-group warning">
          <div class="note">
            {{ t.passwordWillSavedPlaintextBecauseOSSideEncryptionNotAvailable }}<br />
            {{ t.pleaseUncheckSaveHistoryIfNotWantSave }}
          </div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.keepaliveInitialDelay }}</div>
          <input
            v-model.number="csaGameSettings.server.tcpKeepalive.initialDelay"
            class="number"
            type="number"
            value="10"
            min="1"
            max="7200"
          />
          <div class="form-item-small-label">{{ t.secondsSuffix }} ({{ t.between(1, 7200) }})</div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.blankLinePing }}</div>
          <ToggleButton v-model:value="blankLinePing" />
        </div>
        <div v-show="blankLinePing" class="form-item">
          <div class="form-item-label-wide">{{ t.blankLinePingInitialDelay }}</div>
          <input
            v-model.number="blankLinePingSettings.initialDelay"
            class="number"
            type="number"
            value="40"
            min="30"
            max="7200"
          />
          <div class="form-item-small-label">{{ t.secondsSuffix }} ({{ t.between(30, 7200) }})</div>
        </div>
        <div v-show="blankLinePing" class="form-item">
          <div class="form-item-label-wide">{{ t.blankLinePingInterval }}</div>
          <input
            v-model.number="blankLinePingSettings.interval"
            class="number"
            type="number"
            value="40"
            min="30"
            max="7200"
          />
          <div class="form-item-small-label">{{ t.secondsSuffix }} ({{ t.between(30, 7200) }})</div>
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
          <input v-model.number="csaGameSettings.repeat" class="number" type="number" min="1" />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.autoRelogin }}</div>
          <ToggleButton v-model:value="csaGameSettings.autoRelogin" />
        </div>
      </div>
      <div class="form-group">
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.outputComments }}</div>
          <ToggleButton v-model:value="csaGameSettings.enableComment" />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.saveRecordAutomatically }}
          </div>
          <ToggleButton v-model:value="csaGameSettings.enableAutoSave" />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.adjustBoardAutomatically }}
          </div>
          <ToggleButton v-model:value="csaGameSettings.autoFlip" />
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
  </DialogFrame>
</template>

<script setup lang="ts">
import YAML from "yaml";
import { t } from "@/common/i18n";
import { USIEngine, USIEngines, getPredefinedUSIEngineTag } from "@/common/settings/usi";
import { ref, onMounted, computed } from "vue";
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
  defaultCSAGameSettings,
  BlankLinePingSettings,
} from "@/common/settings/csa";
import * as uri from "@/common/uri.js";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import { PlayerSettings } from "@/common/settings/player";
import { useAppSettings } from "@/renderer/store/settings";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { useMessageStore } from "@/renderer/store/message";
import { useConfirmationStore } from "@/renderer/store/confirm";
import {
  floodgateDomain,
  isOfficialFloodgateGameName,
  isValidFloodgatePassword,
  officialCSAServerDomain,
} from "@/common/game/csa";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const busyState = useBusyState();
const messageStore = useMessageStore();
const appSettings = useAppSettings();
const csaGameSettings = ref(defaultCSAGameSettings());
const blankLinePing = ref(false);
const blankLinePingSettings = ref<BlankLinePingSettings>({
  initialDelay: 40,
  interval: 40,
});
const revealPassword = ref(false);
const saveHistory = ref(true);
const isEncryptionAvailable = ref(false);
const history = ref(defaultCSAGameSettingsHistory());
const engines = ref(new USIEngines());
const playerURI = ref("");

busyState.retain();

onMounted(async () => {
  try {
    isEncryptionAvailable.value = await api.isEncryptionAvailable();
    history.value = await api.loadCSAGameSettingsHistory();
    engines.value = await api.loadUSIEngines();
    const settings = buildCSAGameSettingsByHistory(history.value, 0);
    csaGameSettings.value = JSON.parse(JSON.stringify(settings)); // history を書き換えないために deep copy が必要
    if (csaGameSettings.value.server.blankLinePing) {
      blankLinePing.value = true;
      blankLinePingSettings.value = csaGameSettings.value.server.blankLinePing;
    }
    playerURI.value = csaGameSettings.value.player.uri;
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

const isFloodgate = computed(() => csaGameSettings.value.server.host === floodgateDomain);

const validFloodgatePassword = computed(() =>
  isValidFloodgatePassword(csaGameSettings.value.server.password),
);

const officialFloodgateGameName = computed(() =>
  isOfficialFloodgateGameName(csaGameSettings.value.server.password),
);

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
    ...csaGameSettings.value,
    player: buildPlayerSettings(playerURI.value),
    server: {
      ...csaGameSettings.value.server,
      blankLinePing: blankLinePing.value ? blankLinePingSettings.value : undefined,
    },
  };
};

const confirm = (action: () => void) => {
  if (isFloodgate.value && !validFloodgatePassword.value) {
    useConfirmationStore().show({
      message: t.yourPasswordDoesNotMeetFloodgateRequirementsDoYouStillWantToContinue,
      onOk: action,
    });
  } else {
    action();
  }
};

const onExportYAML = () => {
  confirm(() => {
    const settings = exportCSAGameSettingsForCLI(buildConfig(), appSettings);
    if (settings instanceof Error) {
      useErrorStore().add(settings);
      return;
    }
    navigator.clipboard.writeText(YAML.stringify(settings));
    messageStore.enqueue({
      text: t.yamlFormatSettingsCopiedToClipboard,
    });
  });
};

const onExportJSON = () => {
  confirm(() => {
    const settings = exportCSAGameSettingsForCLI(buildConfig(), appSettings);
    if (settings instanceof Error) {
      useErrorStore().add(settings);
      return;
    }
    navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
    messageStore.enqueue({
      text: t.jsonFormatSettingsCopiedToClipboard,
    });
  });
};

const onExportCommand = () => {
  confirm(() => {
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
  });
};

const onStart = () => {
  confirm(() => {
    const csaGameSettings = buildConfig();
    const error = validateCSAGameSettings(csaGameSettings);
    if (error) {
      useErrorStore().add(error);
    } else {
      store.loginCSAGame(csaGameSettings, {
        saveHistory: saveHistory.value,
      });
    }
  });
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
    csaGameSettings.value.server = { ...server };
    blankLinePing.value = !!server.blankLinePing;
    if (server.blankLinePing) {
      blankLinePingSettings.value = { ...server.blankLinePing };
    }
  }
};

const logEnabled = computed(() => {
  const appSettings = useAppSettings();
  return appSettings.enableCSALog && appSettings.enableAppLog && appSettings.enableUSILog;
});
</script>

<style scoped>
.form-group {
  min-width: 510px;
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
