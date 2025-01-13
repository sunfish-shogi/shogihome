<template>
  <div>
    <dialog ref="dialog" class="menu">
      <div class="group">
        <button data-hotkey="Escape" class="close" @click="onClose">
          <Icon :icon="IconType.CLOSE" />
          <div class="label">{{ t.back }}</div>
        </button>
      </div>
      <div class="group">
        <button @click="onPush(InitialPositionSFEN.STANDARD)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.noHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_LANCE)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.lanceHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_RIGHT_LANCE)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.rightLanceHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_BISHOP)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.bishopHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_ROOK)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.rookHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_ROOK_LANCE)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.rookLanceHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_2PIECES)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.twoPiecesHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_4PIECES)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.fourPiecesHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_6PIECES)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.sixPiecesHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_8PIECES)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.eightPiecesHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.HANDICAP_10PIECES)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.tenPiecesHandicap }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.TSUME_SHOGI)">
          <Icon :icon="IconType.QUIZ" />
          <div class="label">{{ t.tsumeShogi }}</div>
        </button>
        <button @click="onPush(InitialPositionSFEN.TSUME_SHOGI_2KINGS)">
          <Icon :icon="IconType.QUIZ" />
          <div class="label">{{ t.doubleKingTsumeShogi }}</div>
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useStore } from "@/renderer/store";
import { InitialPositionSFEN } from "tsshogi";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";

const emit = defineEmits<{
  close: [];
}>();

const store = useStore();
const dialog = ref();
const onClose = () => {
  emit("close");
};
const onPush = (sfen: string) => {
  store.initializePositionBySFEN(sfen);
  emit("close");
};
onMounted(() => {
  showModalDialog(dialog.value, onClose);
  installHotKeyForDialog(dialog.value);
});
onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});
</script>
