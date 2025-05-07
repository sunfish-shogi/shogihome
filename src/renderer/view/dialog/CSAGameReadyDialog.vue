<template>
  <dialog ref="dialog" class="message-box">
    <div class="message-area">
      <Icon :icon="IconType.BUSY" />
      <div class="message">
        <span v-if="store.csaGameState === CSAGameState.READY">
          {{ t.waitingForNewGame }}
        </span>
        <span v-if="store.csaGameState === CSAGameState.PLAYER_SETUP">
          {{ t.waitingForPlayerSetup }}
        </span>
        <span v-if="store.csaGameState === CSAGameState.LOGIN_RETRY_INTERVAL">
          {{ t.tryToReloginToCSAServerNSecondsLater(remainingSeconds) }}
        </span>
        <span v-if="store.csaGameState === CSAGameState.WAITING_LOGIN">
          {{ t.tryingToConnectAndLoginToCSAServer }}
        </span>
      </div>
    </div>
    <div v-if="store.usiSessionIDs.length" class="main-buttons">
      <button @click="onOpenEnginePrompt()">{{ t.prompt }}({{ t.usiEngine }})</button>
    </div>
    <div v-if="store.csaServerSessionID" class="main-buttons">
      <button @click="onOpenServerPrompt()">{{ t.prompt }}({{ t.csaServer }})</button>
    </div>
    <div
      v-if="
        store.csaGameState === CSAGameState.READY ||
        store.csaGameState === CSAGameState.LOGIN_RETRY_INTERVAL
      "
      class="main-buttons"
    >
      <button autofocus data-hotkey="Escape" @click="onLogout()">
        {{ t.cancelGame }}
      </button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useStore } from "@/renderer/store";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { CSAGameState, loginRetryIntervalSeconds } from "@/renderer/store/csa";
import { t } from "@/common/i18n";
import api from "@/renderer/ipc/api";
import { PromptTarget } from "@/common/advanced/prompt";
import { useErrorStore } from "@/renderer/store/error";

const store = useStore();
const dialog = ref();
const remainingSeconds = ref(0);
let remainingTimer = 0;

onMounted(() => {
  showModalDialog(dialog.value);
  installHotKeyForDialog(dialog.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
  window.clearInterval(remainingTimer);
});

const onCSAGameStateUpdated = (newState: CSAGameState) => {
  window.clearInterval(remainingTimer);
  if (newState === CSAGameState.LOGIN_RETRY_INTERVAL) {
    remainingSeconds.value = loginRetryIntervalSeconds;
    remainingTimer = window.setInterval(() => {
      remainingSeconds.value--;
    }, 1000);
  }
};
onCSAGameStateUpdated(store.csaGameState);
watch(() => store.csaGameState, onCSAGameStateUpdated);

const onLogout = () => {
  store.cancelCSAGame();
};

const onOpenEnginePrompt = () => {
  const sessionIDs = store.usiSessionIDs;
  if (sessionIDs.length === 0) {
    useErrorStore().add("USI session is not found.");
    return;
  }
  const settings = store.csaGameSettings;
  api.openPrompt(PromptTarget.USI, sessionIDs[0], settings.player.name);
};

const onOpenServerPrompt = () => {
  const settings = store.csaGameSettings;
  const name = `${settings.server.host}:${settings.server.port}`;
  api.openPrompt(PromptTarget.CSA, store.csaServerSessionID, name);
};
</script>
