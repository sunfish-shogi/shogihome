<template>
  <div>
    <dialog ref="dialog" class="bussy">
      <div class="message-box">
        <ButtonIcon class="icon" :icon="Icon.BUSSY" />
        <div class="message">対局の開始を待っています。</div>
      </div>
      <div class="dialog-main-buttons">
        <button autofocus data-hotkey="Escape" @click="onLogout()">
          ログアウト
        </button>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts">
import { showModalDialog } from "@/helpers/dialog";
import { defineComponent, onBeforeUnmount, onMounted, ref, Ref } from "vue";
import ButtonIcon from "@/components/primitive/ButtonIcon.vue";
import { Icon } from "@/assets/icons";
import { useStore } from "@/store";
import { installHotKey, uninstallHotKey } from "@/helpers/hotkey";

export default defineComponent({
  name: "CSAGameReadyDialog",
  components: {
    ButtonIcon,
  },
  setup() {
    const store = useStore();
    const dialog: Ref = ref(null);

    onMounted(() => {
      showModalDialog(dialog.value);
      installHotKey(dialog.value);
    });

    onBeforeUnmount(() => {
      uninstallHotKey(dialog.value);
    });

    const onLogout = () => {
      store.logoutCSAGame();
    };

    return {
      dialog,
      Icon,
      onLogout,
    };
  },
});
</script>

<style scoped>
dialog.bussy {
  color: var(--info-dialog-color);
  background-color: var(--info-dialog-bg-color);
  border: 3px solid var(--info-dialog-border-color);
}
</style>
