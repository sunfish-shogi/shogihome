<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.connectToCSAServer }}({{ t.adminMode }})</div>
      <div class="form-group">
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.hostToConnect }}</div>
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
          <input ref="password" class="long-text" type="password" />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide"></div>
          <ToggleButton
            :label="t.showPassword"
            :value="false"
            @change="onTogglePasswordVisibility"
          />
        </div>
      </div>
      <div class="form-group warning">
        <div class="note">
          {{ t.inAdminModeYouShouldInvokeCommandsManuallyAtPrompt }}
        </div>
        <div class="note">
          {{ t.serverMustSupportShogiServerX1ModeLogIn }}
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
import { PromptTarget } from "@/common/advanced/prompt";
import { t } from "@/common/i18n";
import { CSAProtocolVersion, validateCSAServerSetting } from "@/common/settings/csa";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { showModalDialog } from "@/renderer/helpers/dialog";
import api from "@/renderer/ipc/api";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { useAppSetting } from "@/renderer/store/setting";
import { Tab } from "@/common/settings/app";

const store = useStore();
const dialog = ref();
const host = ref();
const port = ref();
const id = ref();
const password = ref();

onMounted(() => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const onTogglePasswordVisibility = (value: boolean) => {
  password.value.type = value ? "text" : "password";
};

const onStart = () => {
  const setting = {
    protocolVersion: CSAProtocolVersion.V121_X1,
    host: host.value.value,
    port: port.value.value,
    id: id.value.value,
    password: password.value.value,
    tcpKeepalive: {
      initialDelay: 60,
    },
  };
  const error = validateCSAServerSetting(setting);
  if (error) {
    store.pushError(error);
    return;
  }
  api.csaLogin(setting).then((sessionID: number) => {
    api.openPrompt(PromptTarget.CSA, sessionID, `${setting.host}:${setting.port}`);
    useAppSetting().updateAppSetting({ tab: Tab.MONITOR });
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
