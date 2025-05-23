<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">{{ t.loadRecordFromWeb }}</div>
    <div>
      <HorizontalSelector
        v-model:value="tab"
        :items="[
          { value: Tab.URL, label: 'URL' },
          { value: Tab.Floodgate, label: 'Floodgate' },
        ]"
      />
    </div>
    <!-- URL -->
    <div v-show="tab === Tab.URL" class="form-group">
      <div class="form-item">
        <input v-model.trim="url" class="url" type="text" placeholder="URL" />
      </div>
      <div class="note">{{ t.supportsKIF_KI2_CSA_USI_SFEN_JKF_USEN }}</div>
      <div class="note">{{ t.pleaseSpecifyPlainTextURL }}</div>
      <div class="note">{{ t.redirectNotSupported }}</div>
    </div>
    <!-- Floodgate -->
    <div v-show="tab === Tab.Floodgate" class="header row align-center">
      <div class="filter row align-center">
        <div class="player-name-filter row align-center">
          <input v-model.trim="floodgatePlayerName" :placeholder="t.playerName" />
          <button @click="floodgatePlayerName = ''">&#x2715;</button>
        </div>
        <div class="min-rate-filter row align-center">
          <span>{{ t.minRate }}</span>
          <input v-model.number="floodgateMinRate" type="number" />
          <button @click="floodgateMinRate = 0">&#x2715;</button>
        </div>
        <HorizontalSelector
          v-model:value="floodgateWinner"
          :items="[
            { label: t.all, value: 'all' },
            { label: t.blackWin, value: Color.BLACK },
            { label: t.whiteWin, value: Color.WHITE },
            { label: t.others, value: 'other' },
          ]"
          :height="25"
        />
      </div>
      <button class="reload" @click="updateFloodgateGameList()">{{ t.reload }}</button>
    </div>
    <div v-show="tab === Tab.Floodgate" class="form-group game-list">
      <div v-for="game in filteredFloodgateGames" :key="game.id">
        <div class="game-list-entry row" :class="{ playing: game.playing }">
          <div class="game-label column space-evenly">
            <div class="game-header">
              <span>
                {{ dayjs(game.dateTime).locale(appSettings.language.replace("_", "-")).fromNow() }}
              </span>
              <span
                class="player-name filter-link"
                :class="{
                  bold:
                    floodgatePlayerName &&
                    game.blackName.toLowerCase().includes(floodgatePlayerName.toLowerCase()),
                }"
                @click="floodgatePlayerName = game.blackName"
              >
                {{ game.blackName }}
                <span v-if="floodgatePlayerRateMap[game.blackName]">
                  ({{ floodgatePlayerRateMap[game.blackName] }})
                </span>
              </span>
              <span> vs </span>
              <span
                class="player-name filter-link"
                :class="{
                  bold:
                    floodgatePlayerName &&
                    game.whiteName.toLowerCase().includes(floodgatePlayerName.toLowerCase()),
                }"
                @click="floodgatePlayerName = game.whiteName"
              >
                {{ game.whiteName }}
                <span v-if="floodgatePlayerRateMap[game.whiteName]">
                  ({{ floodgatePlayerRateMap[game.whiteName] }})
                </span>
              </span>
              <span v-if="game.winner" class="filter-link" @click="floodgateWinner = game.winner">{{
                game.winner === Color.BLACK ? t.blackWin : t.whiteWin
              }}</span>
            </div>
            <div class="game-info">
              <span>{{ getDateTimeString(game.dateTime) }}</span>
              <span>{{ game.id }}</span>
            </div>
          </div>
          <div class="column space-evenly">
            <button @click="open(game.url)">{{ t.open }}</button>
          </div>
        </div>
        <hr />
      </div>
    </div>
    <div class="main-buttons">
      <button v-show="tab === Tab.URL" data-hotkey="Enter" autofocus @click="open(url)">
        {{ t.ok }}
      </button>
      <button data-hotkey="Escape" @click="onCancel()">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script lang="ts">
enum Tab {
  URL = "url",
  Floodgate = "floodgate",
}
const localStorageLastTabKey = "LoadRemoteFileDialog.lastTab";
const localStorageLastURLKey = "LoadRemoteFileDialog.lastURL";
const localStorageLastFloodgatePlayerNameKey = "LoadRemoteFileDialog.lastFloodgatePlayerName";
const localStorageLastFloodgateMinRateKey = "LoadRemoteFileDialog.lastFloodgateMinRate";
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed, onMounted, ref, watch } from "vue";
import { useStore } from "@/renderer/store";
import { isNative } from "@/renderer/ipc/api";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import {
  Game as FloodgateGame,
  listLatestGames as listFloodgateLatestGames,
  listPlayers as listFloodgatePlayers,
} from "@/renderer/external/floodgate";
import DialogFrame from "./DialogFrame.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { getDateTimeString } from "@/common/helpers/datetime";
import dayjs from "dayjs";
import { useAppSettings } from "@/renderer/store/settings";
import { Color } from "tsshogi";

const store = useStore();
const busyState = useBusyState();
const appSettings = useAppSettings();
const tab = ref(Tab.URL);
const url = ref("");
const floodgatePlayerName = ref("");
const floodgateMinRate = ref(0);
const floodgateWinner = ref<Color | "all" | "other">("all");
const floodgateGames = ref<FloodgateGame[]>([]);
const floodgatePlayerRateMap = ref<Record<string, number>>({});

async function updateFloodgateGameList() {
  try {
    busyState.retain();
    floodgateGames.value = await listFloodgateLatestGames();
    const players = await listFloodgatePlayers();
    floodgatePlayerRateMap.value = Object.fromEntries(
      players.map((player) => [player.name, player.rate]),
    );
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
}

const filteredFloodgateGames = computed(() => {
  const name = floodgatePlayerName.value.toLowerCase();
  return floodgateGames.value.filter((game) => {
    if (
      name &&
      !game.blackName.toLowerCase().includes(name) &&
      !game.whiteName.toLowerCase().includes(name)
    ) {
      return false;
    }
    if (floodgateMinRate.value > 0) {
      const blackRate = floodgatePlayerRateMap.value[game.blackName] || 0;
      const whiteRate = floodgatePlayerRateMap.value[game.whiteName] || 0;
      if (blackRate < floodgateMinRate.value || whiteRate < floodgateMinRate.value) {
        return false;
      }
    }
    if (floodgateWinner.value !== "all" && floodgateWinner.value !== (game.winner || "other")) {
      return false;
    }
    return true;
  });
});

function onUpdateTab(newTab: Tab) {
  if (newTab === Tab.Floodgate && floodgateGames.value.length === 0) {
    updateFloodgateGameList();
  }
}

function open(url: string) {
  if (!url) {
    useErrorStore().add("URL is required.");
    return;
  }
  localStorage.setItem(localStorageLastTabKey, tab.value);
  localStorage.setItem(localStorageLastURLKey, url);
  localStorage.setItem(localStorageLastFloodgatePlayerNameKey, floodgatePlayerName.value);
  localStorage.setItem(localStorageLastFloodgateMinRateKey, String(floodgateMinRate.value));
  store.closeModalDialog();
  store.loadRemoteRecordFile(url);
}

function onCancel() {
  store.closeModalDialog();
}

busyState.retain();
onMounted(async () => {
  try {
    tab.value = (localStorage.getItem(localStorageLastTabKey) || tab.value) as Tab;
    url.value = localStorage.getItem(localStorageLastURLKey) || url.value;
    floodgatePlayerName.value =
      localStorage.getItem(localStorageLastFloodgatePlayerNameKey) || floodgatePlayerName.value;
    floodgateMinRate.value =
      Number(localStorage.getItem(localStorageLastFloodgateMinRateKey)) || floodgateMinRate.value;
    if (!isNative()) {
      return;
    }
    const copied = (await navigator.clipboard.readText()).trim();
    if (copied && /^https?:\/\//.test(copied)) {
      url.value = copied;
    }
  } finally {
    busyState.release();
  }
  watch(tab, onUpdateTab, { immediate: true });
});
</script>

<style scoped>
.form-group {
  width: 800px;
  max-width: calc(100vw - 50px);
}
.header {
  margin: 5px;
}
.filter {
  text-align: left;
  width: 100%;
}
.filter > * {
  margin-right: 15px;
}
.player-name-filter > input {
  width: 120px;
}
.player-name-filter > button {
  margin: 0;
}
.min-rate-filter > input {
  width: 50px;
}
.min-rate-filter > button {
  margin: 0;
}
button.reload {
  width: 150px;
}
.game-list {
  height: calc(100vh - 300px);
  overflow-y: auto;
  background-color: var(--text-bg-color);
}
.game-list-entry {
  padding: 5px;
}
.game-list-entry.playing {
  background-color: var(--text-bg-color-warning);
}
hr {
  margin: 0;
}
.url {
  width: calc(100% - 20px);
}
.game-label {
  width: calc(100% - 100px);
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
}
.game-header {
  font-size: 0.8em;
}
.game-header > * {
  margin-right: 5px;
}
.player-name.bold {
  font-weight: bold;
}
.filter-link {
  cursor: pointer;
  text-decoration: underline;
}
.game-info {
  font-size: 0.6em;
}
.game-info > * {
  margin-right: 5px;
}
</style>
