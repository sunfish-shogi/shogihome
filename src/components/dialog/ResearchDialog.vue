<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="dialog-title">検討</div>
      <div class="dialog-form-area">
        <div class="dialog-form-item">
          <PlayerSelector
            :players="engines"
            :player-uri="engineURI"
            :engine-settings="engineSettings.json"
            :display-thread-state="true"
            :display-multi-pv-state="true"
            @update-engine-setting="onUpdatePlayerSetting"
            @select-player="onSelectPlayer"
          />
        </div>
      </div>
      <div class="dialog-main-buttons">
        <button
          data-hotkey="Enter"
          autofocus
          class="dialog-button"
          @click="onStart()"
        >
          検討開始
        </button>
        <button class="dialog-button" data-hotkey="Escape" @click="onCancel()">
          キャンセル
        </button>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts">
import { showModalDialog } from "@/helpers/dialog";
import api from "@/ipc/api";
import { defaultResearchSetting, ResearchSetting } from "@/settings/research";
import { USIEngineSetting, USIEngineSettings } from "@/settings/usi";
import { useStore } from "@/store";
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  Ref,
} from "vue";
import PlayerSelector from "@/components/dialog/PlayerSelector.vue";
import { installHotKey, uninstallHotKey } from "@/helpers/hotkey";

export default defineComponent({
  name: "ResearchDialog",
  components: {
    PlayerSelector,
  },
  setup() {
    const store = useStore();
    const dialog: Ref = ref(null);
    const researchSetting = ref(defaultResearchSetting());
    const engineSettings = ref(new USIEngineSettings());
    const engineURI = ref("");

    store.retainBussyState();

    onMounted(async () => {
      showModalDialog(dialog.value);
      installHotKey(dialog.value);
      try {
        researchSetting.value = await api.loadResearchSetting();
        engineSettings.value = await api.loadUSIEngineSetting();
        engineURI.value = researchSetting.value.usi?.uri || "";
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

    const engines = computed(() => engineSettings.value.engineList);

    const onStart = () => {
      if (
        !engineURI.value ||
        !engineSettings.value.hasEngine(engineURI.value)
      ) {
        store.pushError("エンジンを選択してください。");
        return;
      }
      const engineSetting = engineSettings.value.getEngine(engineURI.value);
      const researchSetting: ResearchSetting = {
        usi: engineSetting,
      };
      store.startResearch(researchSetting);
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
      engineURI.value = uri;
    };

    return {
      dialog,
      engineSettings,
      engineURI,
      engines,
      onStart,
      onCancel,
      onUpdatePlayerSetting,
      onSelectPlayer,
    };
  },
});
</script>

<style scoped>
.root {
  width: 380px;
}
</style>
