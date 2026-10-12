<template>
  <DialogFrame @cancel="onClose">
    <div class="root">
      <div class="title">{{ t.game }}</div>
      <div class="form-group">
        <div class="label">{{ t.opponent }}</div>
        <PlayerSelector
          v-model:player-uri="playerURI"
          :contains-basic-engines="true"
          :engines="engines"
          :enable-edit-button="false"
        />
        <template v-if="levels.length">
          <div class="label">{{ t.level }}</div>
          <HorizontalSelector v-model:value="levelIndex" :items="levelItems" />
        </template>
        <div class="label">{{ t.turn }}</div>
        <HorizontalSelector v-model:value="turn" :items="turnItems" />
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onStart">{{ t.startGame }}</button>
        <button data-hotkey="Escape" @click="onClose">{{ t.cancel }}</button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { JishogiRule } from "@/common/settings/game";
import { PlayerSettings } from "@/common/settings/player";
import { USIEngines } from "@/common/settings/usi";
import { SearchCommentFormat } from "@/common/settings/comment";
import * as uri from "@/common/uri";
import api from "@/renderer/ipc/api";
import {
  applyMobileGameLevel,
  loadMobileGameEngines,
  MobileGameEngine,
} from "@/renderer/wasm-engine/catalog";
import { useStore } from "@/renderer/store";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import DialogFrame from "@/renderer/view/dialog/DialogFrame.vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { Color, InitialPositionType } from "tsshogi";
import { computed, onMounted, ref, watch } from "vue";

const TURN_BLACK = "black";
const TURN_WHITE = "white";
const TURN_RANDOM = "random";
const TURNS = [TURN_BLACK, TURN_WHITE, TURN_RANDOM];

// 前回の選択。ブラウザ版だけの設定なので、ダイアログの中で localStorage に保存する。
const localStorageLastPlayerURIKey = "MobileGameDialog.lastPlayerURI";
const localStorageLastLevelKey = "MobileGameDialog.lastLevel";
const localStorageLastTurnKey = "MobileGameDialog.lastTurn";

const store = useStore();
const busyState = useBusyState();
// 組み込みの WebAssembly エンジンは、マニフェストが mobileGame を宣言したプリセットだけが並ぶ。
// 簡易エンジン (TypeScript 実装) は PlayerSelector が別途並べる。
const engines = ref(new USIEngines());
const mobileGameEngines = ref<MobileGameEngine[]>([]);
const playerURI = ref<string>(uri.ES_BASIC_ENGINE_LIST[0]);
const levelIndex = ref("0");
const turn = ref(TURN_BLACK);

const emit = defineEmits<{
  close: [];
}>();

const onClose = () => {
  emit("close");
};

const levels = computed(
  () => mobileGameEngines.value.find((engine) => engine.uri === playerURI.value)?.levels || [],
);
const levelItems = computed(() =>
  levels.value.map((level, index) => ({ label: level.label, value: String(index) })),
);
const turnItems = [
  { label: t.sente, value: TURN_BLACK },
  { label: t.gote, value: TURN_WHITE },
  { label: t.pieceToss, value: TURN_RANDOM },
];

// エンジンを切り替えたときに、選択中のレベルが存在しなければ最も弱いレベルに戻す。
watch(levels, (levels) => {
  if (Number(levelIndex.value) >= levels.length) {
    levelIndex.value = "0";
  }
});

busyState.retain();
onMounted(async () => {
  try {
    // マニフェストの読み込みに失敗した場合は loadUSIEngines が画面に理由を出すため、
    // ここではエラーを報告しない (同じエラーが二重に出るのを避ける)。
    const [allEngines, gameEngines] = await Promise.all([
      api.loadUSIEngines(),
      loadMobileGameEngines(),
    ]);
    const filtered = new USIEngines();
    const available: MobileGameEngine[] = [];
    for (const gameEngine of gameEngines) {
      const engine = allEngines.getEngine(gameEngine.uri);
      if (engine) {
        filtered.addEngine(engine);
        available.push(gameEngine);
      }
    }
    engines.value = filtered;
    mobileGameEngines.value = available;
    restoreLastSelection(available);
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
});

// 前回の選択を復元する。前回のエンジンが選択肢から消えていれば先頭のエンジンを選ぶ。
// レベルが範囲外の場合は、levels の watch が最も弱いレベルに戻す。
const restoreLastSelection = (available: MobileGameEngine[]) => {
  const lastPlayerURI = localStorage.getItem(localStorageLastPlayerURIKey);
  if (
    lastPlayerURI &&
    (available.some((engine) => engine.uri === lastPlayerURI) ||
      uri.ES_BASIC_ENGINE_LIST.some((basic) => basic === lastPlayerURI))
  ) {
    playerURI.value = lastPlayerURI;
  } else if (available.length) {
    playerURI.value = available[0].uri;
  }
  const lastLevel = localStorage.getItem(localStorageLastLevelKey);
  if (lastLevel && /^\d+$/.test(lastLevel)) {
    levelIndex.value = lastLevel;
  }
  const lastTurn = localStorage.getItem(localStorageLastTurnKey);
  if (lastTurn && TURNS.includes(lastTurn)) {
    turn.value = lastTurn;
  }
};

const saveLastSelection = () => {
  localStorage.setItem(localStorageLastPlayerURIKey, playerURI.value);
  localStorage.setItem(localStorageLastLevelKey, levelIndex.value);
  localStorage.setItem(localStorageLastTurnKey, turn.value);
};

// 対局相手の設定を組み立てる。取得できない場合は undefined を返す。
const buildOpponentSettings = (): PlayerSettings | undefined => {
  // TypeScript 実装の簡易エンジンは renderer 内で完結するため、設定の実体を持たない。
  if (uri.isBasicEngine(playerURI.value)) {
    return { name: uri.basicEngineName(playerURI.value), uri: playerURI.value };
  }
  // 組み込みの WebAssembly エンジンは USI エンジンとして扱うため、設定の実体を使う。
  // 設定の実体が無いまま USI のプレイヤーを組み立てると defaultPlayerBuilder が失敗する。
  const engine = engines.value.getEngine(playerURI.value);
  if (!engine) {
    return;
  }
  const level = levels.value[Number(levelIndex.value)];
  const usi = level ? applyMobileGameLevel(engine, level) : engine;
  return { name: usi.name, uri: playerURI.value, usi };
};

const onStart = () => {
  const opponent = buildOpponentSettings();
  if (!opponent) {
    useErrorStore().add(new Error(`${t.failedToStartNewGame}: ${playerURI.value}`));
    return;
  }
  saveLastSelection();
  const humanColor =
    turn.value === TURN_RANDOM
      ? Math.random() * 2 >= 1
        ? Color.BLACK
        : Color.WHITE
      : turn.value === TURN_WHITE
        ? Color.WHITE
        : Color.BLACK;
  let black: PlayerSettings = { name: t.human, uri: uri.ES_HUMAN };
  let white = opponent;
  let blackTimeLimit = { timeSeconds: 900, byoyomi: 30, increment: 0 };
  let whiteTimeLimit = { timeSeconds: 0, byoyomi: 10, increment: 0 };
  if (humanColor === Color.WHITE) {
    [black, white] = [white, black];
    [blackTimeLimit, whiteTimeLimit] = [whiteTimeLimit, blackTimeLimit];
  }
  store.startGame({
    black,
    white,
    timeLimit: blackTimeLimit,
    whiteTimeLimit: whiteTimeLimit,
    startPosition: InitialPositionType.STANDARD,
    startPositionSFEN: "",
    startPositionListFile: "",
    startPositionListOrder: "sequential",
    enableEngineTimeout: false,
    humanIsFront: true,
    enableComment: true,
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

<style scoped>
.root {
  width: min(420px, calc(100vw - 80px));
}
.label {
  text-align: left;
  font-size: 0.8em;
  margin: 10px 0 2px 0;
}
.label:first-child {
  margin-top: 0;
}
</style>
