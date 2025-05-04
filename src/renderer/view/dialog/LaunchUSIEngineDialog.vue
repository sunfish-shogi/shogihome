<template>
  <DialogFrame @cancel="onCancel">
    <div class="root">
      <div class="title">{{ t.launchUSIEngine }}({{ t.adminMode }})</div>
      <div class="form-group">
        <div>{{ t.searchEngine }}</div>
        <PlayerSelector
          v-model:player-uri="engineURI"
          :engines="engines"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
      </div>
      <div class="form-group warning">
        <div class="note">
          {{ t.inAdminModeManuallyInvokeCommandsAtPrompt }}
        </div>
        <div class="note">
          {{ t.setoptionAndPrecedingCommandsAreSentAutomatically }}
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onStart()">
          {{ t.ok }}
        </button>
        <button data-hotkey="Escape" @click="onCancel()">
          {{ t.cancel }}
        </button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { onMounted, ref } from "vue";
import PlayerSelector from "./PlayerSelector.vue";
import { USIEngines } from "@/common/settings/usi";
import api from "@/renderer/ipc/api";
import { useAppSettings } from "@/renderer/store/settings";
import { PromptTarget } from "@/common/advanced/prompt";
import { Tab } from "@/common/settings/app";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const busyState = useBusyState();
const appSettings = useAppSettings();
const engines = ref(new USIEngines());
const engineURI = ref("");

busyState.retain();

onMounted(async () => {
  try {
    engines.value = await api.loadUSIEngines();
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

const onStart = async () => {
  const settings = engines.value.getEngine(engineURI.value);
  if (!settings) {
    useErrorStore().add(t.engineNotSelected);
    return;
  }
  const sessionID = await api.usiLaunch(settings, appSettings.engineTimeoutSeconds);
  api.openPrompt(PromptTarget.USI, sessionID, settings.name);
  useAppSettings().updateAppSettings({ tab: Tab.MONITOR });
  store.closeModalDialog();
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = async (val: USIEngines) => {
  engines.value = val;
};
</script>

<style scoped>
.root {
  width: 560px;
}
</style>
