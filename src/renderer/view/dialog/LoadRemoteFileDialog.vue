<template>
  <DialogFrame @cancel="onCancel">
    <div class="title">{{ t.loadRecordFromWeb }}</div>
    <div>
      <HorizontalSelector
        v-model:value="tab"
        :items="[
          { value: Tab.URL, label: 'URL' },
          { value: Tab.Floodgate, label: 'Floodgate' },
          { value: Tab.WCSC, label: 'WCSC' },
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
      <div v-for="(game, index) in filteredFloodgateGames" :key="game.id">
        <hr v-if="index !== 0" />
        <div class="game-list-entry row" :class="{ playing: game.playing }">
          <div class="game-label column space-evenly">
            <div class="game-header">
              <span>
                {{ dayjs(game.dateTime).locale(appSettings.language.replace("_", "-")).fromNow() }}
              </span>
              <span
                class="player-name link"
                :class="{
                  bold:
                    floodgatePlayerName &&
                    game.blackName.toLowerCase().includes(floodgatePlayerName.toLowerCase()),
                }"
                @click="floodgatePlayerName = game.blackName"
              >
                {{ game.blackName }}
                <span v-if="floodgatePlayerRateMap?.get(game.blackName)">
                  ({{ floodgatePlayerRateMap.get(game.blackName) }})
                </span>
              </span>
              <span> vs </span>
              <span
                class="player-name link"
                :class="{
                  bold:
                    floodgatePlayerName &&
                    game.whiteName.toLowerCase().includes(floodgatePlayerName.toLowerCase()),
                }"
                @click="floodgatePlayerName = game.whiteName"
              >
                {{ game.whiteName }}
                <span v-if="floodgatePlayerRateMap?.get(game.whiteName)">
                  ({{ floodgatePlayerRateMap.get(game.whiteName) }})
                </span>
              </span>
              <span v-if="game.winner" class="link" @click="floodgateWinner = game.winner">{{
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
      </div>
    </div>
    <!-- WCSC -->
    <div v-show="tab === Tab.WCSC" class="header row align-center">
      <div class="filter row align-center">
        <select v-model="wcscEdition" class="edition-selector">
          <option v-for="edition in wcscEditions" :key="edition.name" :value="edition.name">
            {{ edition.name }} ({{ edition.year }})
          </option>
        </select>
        <div class="player-name-filter row align-center">
          <input v-model.trim="wcscSearchWord" placeholder="検索" />
          <button @click="wcscSearchWord = ''">&#x2715;</button>
        </div>
      </div>
      <button class="reload" @click="updateWCSCGameList()">{{ t.reload }}</button>
    </div>
    <div v-show="tab === Tab.WCSC" class="form-group game-list">
      <div v-for="(game, index) in filteredWCSCGames" :key="game.url">
        <hr v-if="index !== 0" />
        <div class="game-list-entry row">
          <div class="game-label column space-evenly">
            <div class="game-header">{{ game.title }}</div>
          </div>
          <div class="column space-evenly">
            <button @click="open(game.url)">{{ t.open }}</button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="tab === Tab.Floodgate" class="reference">
      <span>Floodgate: </span>
      <span class="link" @click="api.openWebBrowser(floodgateTopURL)">{{ floodgateTopURL }}</span>
    </div>
    <div v-if="tab === Tab.WCSC" class="reference">
      <span>Computer Shogi Association: </span>
      <span class="link" @click="api.openWebBrowser(csaTopURL)">{{ csaTopURL }}</span>
    </div>
    <!-- Common buttons -->
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
  WCSC = "wcsc",
}
const localStorageLastTabKey = "LoadRemoteFileDialog.lastTab";
const localStorageLastURLKey = "LoadRemoteFileDialog.lastURL";
const localStorageLastFloodgatePlayerNameKey = "LoadRemoteFileDialog.lastFloodgatePlayerName";
const localStorageLastFloodgateMinRateKey = "LoadRemoteFileDialog.lastFloodgateMinRate";
const localStorageLastWCSCEditionKey = "LoadRemoteFileDialog.lastWCSCEdition";
const localStorageLastWCSCSearchWordKey = "LoadRemoteFileDialog.lastWCSCSearchWord";
</script>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed, onMounted, ref, watch } from "vue";
import { useStore } from "@/renderer/store";
import api, { isNative } from "@/renderer/ipc/api";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import {
  Game as FloodgateGame,
  listLatestGames as listFloodgateLatestGames,
  listPlayers as listFloodgatePlayers,
} from "@/renderer/external/floodgate";
import {
  Edition as WCSCEdition,
  Game as WCSCGame,
  listEditions as listWCSCEditions,
  listGames as listWCSCGames,
} from "@/renderer/external/wcsc";
import DialogFrame from "./DialogFrame.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { getDateTimeString } from "@/common/helpers/datetime";
import dayjs from "dayjs";
import { useAppSettings } from "@/renderer/store/settings";
import { Color } from "tsshogi";
import { floodgateTopURL } from "@/common/links/floodgate";
import { csaTopURL } from "@/common/links/csa";

const store = useStore();
const busyState = useBusyState();
const appSettings = useAppSettings();
const tab = ref(Tab.URL);
const url = ref("");
const floodgatePlayerName = ref("");
const floodgateMinRate = ref(0);
const floodgateWinner = ref<Color | "all" | "other">("all");
const floodgateGames = ref<FloodgateGame[]>([]);
const floodgatePlayerRateMap = ref<Map<string, number> | null>(null);
const wcscEdition = ref("");
const wcscSearchWord = ref("");
const wcscEditions = ref([] as WCSCEdition[]);
const wcscGames = ref<WCSCGame[]>([]);

async function updateFloodgateGameList() {
  try {
    busyState.retain();
    floodgateGames.value = await listFloodgateLatestGames();
    if (floodgateGames.value.length > 0 && !floodgatePlayerRateMap.value) {
      const players = await listFloodgatePlayers();
      floodgatePlayerRateMap.value = new Map(players.map((player) => [player.name, player.rate]));
    }
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
      const blackRate = floodgatePlayerRateMap.value?.get(game.blackName) || 0;
      const whiteRate = floodgatePlayerRateMap.value?.get(game.whiteName) || 0;
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

async function updateWCSCGameList() {
  try {
    busyState.retain();
    if (wcscEditions.value.length === 0) {
      wcscEditions.value = await listWCSCEditions();
      if (wcscEditions.value.length === 0) {
        return;
      }
    }
    const edition =
      wcscEditions.value.find((edition) => edition.name === wcscEdition.value) ||
      wcscEditions.value[0];
    wcscEdition.value = edition.name;
    wcscGames.value = await listWCSCGames(edition.url);
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
}

const filteredWCSCGames = computed(() => {
  const word = wcscSearchWord.value.toLowerCase();
  return wcscGames.value.filter((game) => {
    if (word && !game.title.toLowerCase().includes(word)) {
      return false;
    }
    return true;
  });
});

function onUpdateTab(newTab: Tab) {
  if (newTab === Tab.Floodgate && floodgateGames.value.length === 0) {
    updateFloodgateGameList();
  } else if (newTab === Tab.WCSC && wcscGames.value.length === 0) {
    updateWCSCGameList();
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
  localStorage.setItem(localStorageLastWCSCEditionKey, wcscEdition.value);
  localStorage.setItem(localStorageLastWCSCSearchWordKey, wcscSearchWord.value);
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
    wcscEdition.value = localStorage.getItem(localStorageLastWCSCEditionKey) || wcscEdition.value;
    wcscSearchWord.value =
      localStorage.getItem(localStorageLastWCSCSearchWordKey) || wcscSearchWord.value;
    if (!isNative()) {
      return;
    }
    const copied = (await navigator.clipboard.readText()).trim();
    if (copied && /^https?:\/\//.test(copied)) {
      url.value = copied;
    }
  } finally {
    busyState.release();
    watch(tab, onUpdateTab, { immediate: true });
    watch(wcscEdition, updateWCSCGameList);
  }
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
  font-size: 0.62em;
  margin: 0;
}
.min-rate-filter > input {
  width: 50px;
}
.min-rate-filter > button {
  font-size: 0.62em;
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
.link {
  cursor: pointer;
  text-decoration: underline;
}
.game-info {
  font-size: 0.6em;
}
.game-info > * {
  margin-right: 5px;
}
.reference {
  text-align: left;
  font-size: 0.8em;
}
</style>
