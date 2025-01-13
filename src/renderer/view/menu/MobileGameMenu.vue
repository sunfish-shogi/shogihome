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
        <button v-if="!playerURI" @click="selectPlayer(uri.ES_BASIC_ENGINE_STATIC_ROOK_V1)">
          <Icon :icon="IconType.ROBOT" />
          <div class="label">{{ `${t.beginner} (${t.staticRook})` }}</div>
        </button>
        <button v-if="!playerURI" @click="selectPlayer(uri.ES_BASIC_ENGINE_RANGING_ROOK_V1)">
          <Icon :icon="IconType.ROBOT" />
          <div class="label">{{ `${t.beginner} (${t.rangingRook})` }}</div>
        </button>
        <button v-if="playerURI" @click="selectTurn(Color.BLACK)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.sente }}</div>
        </button>
        <button v-if="playerURI" @click="selectTurn(Color.WHITE)">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.gote }}</div>
        </button>
        <button
          v-if="playerURI"
          @click="selectTurn(Math.random() * 2 >= 1 ? Color.BLACK : Color.WHITE)"
        >
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.pieceToss }}</div>
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { JishogiRule } from "@/common/settings/game";
import * as uri from "@/common/uri";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { useStore } from "@/renderer/store";
import { Color, InitialPositionType } from "tsshogi";
import { onBeforeUnmount, onMounted, ref } from "vue";

const store = useStore();
const dialog = ref();
const playerURI = ref("");
const emit = defineEmits<{
  close: [];
}>();
const onClose = () => {
  emit("close");
};
onMounted(() => {
  showModalDialog(dialog.value, onClose);
  installHotKeyForDialog(dialog.value);
});
onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});
const selectPlayer = (uri: string) => {
  playerURI.value = uri;
};
const selectTurn = (turn: Color) => {
  let black = { name: t.human, uri: uri.ES_HUMAN };
  let white = { name: uri.basicEngineName(playerURI.value), uri: playerURI.value };
  if (turn === Color.WHITE) {
    [black, white] = [white, black];
  }
  store.startGame({
    black,
    white,
    timeLimit: {
      timeSeconds: 900,
      byoyomi: 30,
      increment: 0,
    },
    startPosition: InitialPositionType.STANDARD,
    startPositionListFile: "",
    startPositionListOrder: "sequential",
    enableEngineTimeout: false,
    humanIsFront: true,
    enableComment: false,
    enableAutoSave: false,
    repeat: 1,
    swapPlayers: false,
    maxMoves: 1000,
    jishogiRule: JishogiRule.NONE,
  });
  emit("close");
};
</script>
