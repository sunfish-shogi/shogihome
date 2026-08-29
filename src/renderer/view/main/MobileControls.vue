<template>
  <div>
    <div class="full row controls">
      <button :disabled="inGame" @click="store.changePly(0)">
        <Icon :icon="IconType.FIRST" />
      </button>
      <button :disabled="inGame" @click="store.goBack()">
        <Icon :icon="IconType.BACK" />
      </button>
      <button :disabled="inGame" @click="store.goForward()">
        <Icon :icon="IconType.NEXT" />
      </button>
      <button :disabled="inGame" @click="store.changePly(Number.MAX_SAFE_INTEGER)">
        <Icon :icon="IconType.LAST" />
      </button>
      <button v-show="!inGame" @click="store.removeCurrentMove()">
        <Icon :icon="IconType.DELETE" />
      </button>
      <button v-show="inGame" :disabled="!canResign" class="close" @click="resign()">
        <Icon :icon="IconType.RESIGN" />
      </button>
      <button @click="isMobileMenuVisible = true">Menu</button>
    </div>
    <FileMenu v-if="isMobileMenuVisible" @close="isMobileMenuVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { IconType } from "@/renderer/assets/icons";
import { useStore } from "@/renderer/store";
import Icon from "@/renderer/view/primitive/Icon.vue";
import FileMenu from "@/renderer/view/menu/FileMenu.vue";
import { computed, ref } from "vue";
import { AppState } from "@/common/control/state";
import { humanPlayer } from "@/renderer/players/human";
import { useConfirmationStore } from "@/renderer/store/confirm";
import { t } from "@/common/i18n";

const store = useStore();
const isMobileMenuVisible = ref(false);
const inGame = computed(() => store.appState === AppState.GAME);
const canResign = computed(() => inGame.value && store.isMovableByUser);

function resign() {
  useConfirmationStore().show({
    message: t.areYouSureWantToResign,
    onOk: () => {
      humanPlayer.resign();
    },
  });
}
</script>

<style scoped>
.controls button {
  font-size: 100%;
  width: 100%;
  height: 100%;
}
.controls button .icon {
  height: 68%;
}
</style>
