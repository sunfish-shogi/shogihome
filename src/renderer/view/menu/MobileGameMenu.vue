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
        <button
          v-for="player of players"
          v-show="!playerURI"
          :key="player.uri"
          @click="selectPlayer(player.uri)"
        >
          <Icon :icon="IconType.ROBOT" />
          <div class="label">{{ player.label }}</div>
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
import { PlayerSettings } from "@/common/settings/player";
import * as uri from "@/common/uri";
import api from "@/renderer/ipc/api";
import { builtinEngineURI } from "@/renderer/wasm-engine/catalog";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { useStore } from "@/renderer/store";
import { useErrorStore } from "@/renderer/store/error";
import { Color, InitialPositionType } from "tsshogi";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { SearchCommentFormat } from "@/common/settings/comment";

// モバイル表示では名前が長いと収まらないので、強さをレベルで表す。
// Lv.1 は TypeScript 実装の簡易エンジン、Lv.2 以降は組み込みの WebAssembly エンジン。
// (モバイル表示は Web 版でのみ使われる。)
const players = [
  { level: 1, uri: uri.ES_BASIC_ENGINE_STATIC_ROOK_V1, style: () => t.staticRook },
  { level: 1, uri: uri.ES_BASIC_ENGINE_RANGING_ROOK_V1, style: () => t.rangingRook },
  { level: 2, uri: builtinEngineURI("basic-level2-static-rook-v1"), style: () => t.staticRook },
  { level: 2, uri: builtinEngineURI("basic-level2-ranging-rook-v1"), style: () => t.rangingRook },
  { level: 3, uri: builtinEngineURI("basic-level3-static-rook-v1"), style: () => t.staticRook },
  { level: 3, uri: builtinEngineURI("basic-level3-ranging-rook-v1"), style: () => t.rangingRook },
].map((player) => ({ uri: player.uri, label: `Lv. ${player.level} ${player.style()}` }));

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
// 対局相手の設定を組み立てる。取得に失敗した場合は undefined を返す。
// 棋譜には正式な名前を残すので、ボタンのレベル表記はここでは使わない。
const buildOpponentSettings = async (): Promise<PlayerSettings | undefined> => {
  // TypeScript 実装の簡易エンジンは renderer 内で完結するため、設定の実体を持たない。
  if (uri.isBasicEngine(playerURI.value)) {
    return { name: uri.basicEngineName(playerURI.value), uri: playerURI.value };
  }
  // 組み込みの WebAssembly エンジンは USI エンジンとして扱うため、設定の実体を取得する。
  // マニフェストの読み込みに失敗したエンジンは一覧に含まれないので、その場合は対局を始めない。
  // 設定の実体が無いまま USI のプレイヤーを組み立てると defaultPlayerBuilder が失敗する。
  const engine = (await api.loadUSIEngines()).getEngine(playerURI.value);
  return engine && { name: engine.name, uri: playerURI.value, usi: engine };
};
const selectTurn = async (turn: Color) => {
  let opponent: PlayerSettings | undefined;
  try {
    opponent = await buildOpponentSettings();
  } catch (e) {
    useErrorStore().add(e);
    return;
  }
  if (!opponent) {
    useErrorStore().add(new Error(`${t.failedToStartNewGame}: ${playerURI.value}`));
    return;
  }
  let black: PlayerSettings = { name: t.human, uri: uri.ES_HUMAN };
  let white: PlayerSettings = opponent;
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
    startPositionSFEN: "",
    startPositionListFile: "",
    startPositionListOrder: "sequential",
    enableEngineTimeout: false,
    humanIsFront: true,
    enableComment: false,
    enableAutoSave: false,
    autoSaveDirectory: "",
    repeat: 1,
    parallelism: 1,
    swapPlayers: false,
    maxMoves: 1000,
    jishogiRule: JishogiRule.NONE,
    searchCommentFormat: SearchCommentFormat.SHOGIHOME,
    sprtEnabled: false,
    sprt: { elo0: 0, elo1: 3, alpha: 0.05, beta: 0.05, maxGames: 10000 },
  });
  emit("close");
};
</script>
