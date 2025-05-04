<template>
  <DialogFrame @cancel="onCancel">
    <div class="root">
      <div class="title">{{ t.connectToCSAServer }}({{ t.adminMode }})</div>
      <div class="form-group">
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.host }}</div>
          <input ref="host" class="long-text" list="csa-server-host" type="text" />
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
            ref="port"
            class="number"
            list="csa-server-port-number"
            type="number"
            value="4081"
          />
          <datalist id="csa-server-port-number">
            <option value="4081"></option>
          </datalist>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">ID</div>
          <input ref="id" class="long-text" type="text" value="admin" />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.password }}</div>
          <input ref="password" class="long-text" :type="revealPassword ? 'text' : 'password'" />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide"></div>
          <ToggleButton v-model:value="revealPassword" :label="t.revealPassword" />
        </div>
      </div>
      <div class="form-group warning">
        <div class="note">
          {{ t.inAdminModeManuallyInvokeCommandsAtPrompt }}
        </div>
        <div class="note">
          {{ t.serverMustSupportShogiServerX1ModeLogIn }}
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
import { PromptTarget } from "@/common/advanced/prompt";
import { t } from "@/common/i18n";
import { CSAProtocolVersion, validateCSAServerSettings } from "@/common/settings/csa";
import api from "@/renderer/ipc/api";
import { useStore } from "@/renderer/store";
import { ref } from "vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { useAppSettings } from "@/renderer/store/settings";
import { Tab } from "@/common/settings/app";
import { useErrorStore } from "@/renderer/store/error";
import { floodgateDomain, officialCSAServerDomain } from "@/common/game/csa";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const host = ref();
const port = ref();
const id = ref();
const password = ref();
const revealPassword = ref(false);

const onStart = () => {
  const settings = {
    protocolVersion: CSAProtocolVersion.V121_X1,
    host: host.value.value,
    port: port.value.value,
    id: id.value.value,
    password: password.value.value,
    tcpKeepalive: {
      initialDelay: 60,
    },
  };
  const error = validateCSAServerSettings(settings);
  if (error) {
    useErrorStore().add(error);
    return;
  }
  api.csaLogin(settings).then((sessionID: number) => {
    api.openPrompt(PromptTarget.CSA, sessionID, `${settings.host}:${settings.port}`);
    useAppSettings().updateAppSettings({ tab: Tab.MONITOR });
    store.closeModalDialog();
  });
};

const onCancel = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.root {
  width: 560px;
}
</style>
