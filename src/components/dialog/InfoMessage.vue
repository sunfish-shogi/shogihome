<template>
  <div>
    <dialog ref="dialog" class="info">
      <div class="message-box">
        <ButtonIcon class="icon" :icon="Icon.INFO" />
        <div class="message">{{ message.text }}</div>
      </div>
      <div
        v-for="(attachment, aidx) of message.attachments"
        :key="aidx"
        class="attachment"
      >
        <ul v-if="attachment.type === 'list'" class="list">
          <li
            v-for="(item, iidx) of attachment.items"
            :key="iidx"
            class="list-item"
          >
            {{ item.text }}
            <ul>
              <li
                v-for="(child, cidx) of item.children"
                :key="cidx"
                class="list-child-item"
              >
                {{ child }}
              </li>
            </ul>
          </li>
        </ul>
      </div>
      <div class="dialog-main-buttons">
        <button autofocus data-hotkey="Escape" @click="onClose()">
          閉じる
        </button>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts">
import { showModalDialog } from "@/helpers/dialog";
import { useStore } from "@/store";
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  Ref,
} from "vue";
import ButtonIcon from "@/components/primitive/ButtonIcon.vue";
import { Icon } from "@/assets/icons";
import { installHotKey, uninstallHotKey } from "@/helpers/hotkey";

export default defineComponent({
  name: "InfoMessage",
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

    const message = computed(() => store.message);

    const onClose = () => {
      store.dequeueMessage();
    };

    return {
      dialog,
      message,
      onClose,
      Icon,
    };
  },
});
</script>

<style scoped>
dialog.info {
  color: var(--info-dialog-color);
  background-color: var(--info-dialog-bg-color);
  border: 3px solid var(--info-dialog-border-color);
}
.attachment {
  text-align: left;
}
</style>
