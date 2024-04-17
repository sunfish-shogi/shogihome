<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.launchUSIEngine }}({{ t.adminMode }})</div>
      <div class="form-group">
        <div>{{ t.searchEngine }}</div>
        <PlayerSelector
          :player-uri="engineURI"
          :engine-settings="engineSettings"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engine-setting="onUpdatePlayerSetting"
          @select-player="onSelectPlayer"
        />
      </div>
      <div class="form-group warning">
        <div class="note">
          {{ t.inAdminModeYouShouldInvokeCommandsManuallyAtPrompt }}
        </div>
        <div class="note">
          {{ t.setoptionAndPrecedingCommandsWillBeSentAutomatically }}
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
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import PlayerSelector from "./PlayerSelector.vue";
import { USIEngineSettings } from "@/common/settings/usi";
import api from "@/renderer/ipc/api";
import { useAppSetting } from "@/renderer/store/setting";
import { PromptTarget } from "@/common/advanced/prompt";
import { Tab } from "@/common/settings/app";

const store = useStore();
const appSetting = useAppSetting();
const dialog = ref();
const engineSettings = ref(new USIEngineSettings());
const engineURI = ref("");

store.retainBussyState();

onMounted(async () => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
  try {
    engineSettings.value = await api.loadUSIEngineSetting();
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

const onStart = async () => {
  const setting = engineSettings.value.getEngine(engineURI.value);
  if (!setting) {
    store.pushError(t.engineNotSelected);
    return;
  }
  const sessionID = await api.usiLaunch(setting, appSetting.engineTimeoutSeconds);
  api.openPrompt(PromptTarget.USI, sessionID, setting.name);
  useAppSetting().updateAppSetting({ tab: Tab.MONITOR });
  store.closeModalDialog();
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
  width: 560px;
}
</style>
