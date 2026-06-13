<template>
  <DialogFrame limited @cancel="onClose">
    <div class="title">{{ t.addBookMoves }}</div>
    <div>
      <HorizontalSelector
        v-model:value="activeTab"
        :items="[
          { value: 'memory', label: t.fromCurrentRecord },
          { value: 'file', label: t.fromFile },
          { value: 'directory', label: t.fromDirectory },
        ]"
      />
    </div>
    <div class="form-group scroll">
      <div v-show="activeTab === 'memory' && !inMemoryList.length">
        {{ t.noMoves }}
      </div>
      <table v-show="activeTab === 'memory' && inMemoryList.length" class="move-list">
        <tbody>
          <tr
            v-for="(move, index) of inMemoryList"
            :key="index"
            :ref="
              (el) => {
                if (move.type === 'move' && move.last && el) currentMoveRow = el as HTMLElement;
              }
            "
          >
            <td v-if="move.type === 'move'">{{ move.ply }}</td>
            <td v-if="move.type === 'move'">{{ move.text }}</td>
            <td v-if="move.type === 'move'">
              <span v-if="move.score !== undefined">{{ t.score }} {{ move.score }}</span>
            </td>
            <td v-if="move.type === 'move'">
              <button
                v-if="!move.exists || move.scoreUpdatable"
                class="thin"
                @click="registerMove(move)"
              >
                {{ move.exists ? t.update : t.register }}
              </button>
            </td>
            <td v-if="move.type === 'move'">
              <span v-if="move.last">({{ t.currentMove }})</span>
            </td>
            <td v-if="move.type === 'branch'" class="branch" colspan="5">
              {{ t.branchFrom(move.ply) }}:
            </td>
          </tr>
        </tbody>
      </table>
      <div v-show="activeTab === 'directory'" class="form-item row">
        <input v-model="settings.sourceDirectory" class="grow" type="text" />
        <button class="thin" @click="selectDirectory()">
          {{ t.select }}
        </button>
        <button class="thin open-dir" @click="openDirectory()">
          <Icon :icon="IconType.OPEN_FOLDER" />
        </button>
      </div>
      <div v-show="activeTab === 'file'" class="form-item row">
        <input v-model="settings.sourceRecordFile" class="grow" type="text" />
        <button class="thin" @click="selectRecordFile()">
          {{ t.select }}
        </button>
      </div>
      <div v-show="activeTab === 'directory' || activeTab === 'file'" class="form-item row">
        <span>{{ t.fromPrefix }}</span>
        <input
          v-model.number="settings.minPly"
          class="small"
          type="number"
          min="0"
          step="1"
          value="0"
        />
        <span>{{ t.plySuffix }}{{ t.fromSuffix }}</span>
      </div>
      <div v-show="activeTab === 'directory' || activeTab === 'file'" class="form-item row">
        <span>{{ t.toPrefix }}</span>
        <input
          v-model.number="settings.maxPly"
          class="small"
          type="number"
          min="0"
          step="1"
          value="1000"
        />
        <span>{{ t.plySuffix }}{{ t.toSuffix }}</span>
      </div>
      <div v-show="activeTab === 'directory' || activeTab === 'file'" class="form-item row">
        <HorizontalSelector
          v-model:value="settings.playerCriteria"
          :items="[
            { value: PlayerCriteria.ALL, label: t.allPlayers },
            { value: PlayerCriteria.BLACK, label: t.blackPlayerOnly },
            { value: PlayerCriteria.WHITE, label: t.whitePlayerOnly },
            { value: PlayerCriteria.FILTER_BY_NAME, label: t.filterByName },
          ]"
        />
      </div>
      <div v-show="activeTab === 'directory' || activeTab === 'file'" class="form-item row">
        <input
          v-show="settings.playerCriteria === 'filterByName'"
          v-model="settings.playerName"
          class="grow"
          type="text"
          :placeholder="t.enterPartOfPlayerNameHere"
        />
      </div>
      <div v-show="activeTab === 'directory' || activeTab === 'file'" class="form-item row">
        <ToggleButton v-model:value="settings.importScore" :label="t.importScoreFromComment" />
      </div>
    </div>
    <div v-show="activeTab === 'memory' && inMemoryList.length">
      <button class="register-all" @click="registerAllMoves">{{ t.importAll }}</button>
    </div>
    <div v-show="activeTab === 'directory' || activeTab === 'file'">
      <button class="import" @click="importMoves">{{ t.import }}</button>
    </div>
    <div class="main-buttons">
      <button autofocus data-hotkey="Escape" @click="onClose">
        {{ t.close }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { nextTick, onMounted, ref, watch } from "vue";
import { useBusyState } from "@/renderer/store/busy";
import { Color, formatMove, ImmutableNode, Move, Position } from "tsshogi";
import { useBookStore } from "@/renderer/store/book";
import { RecordCustomData } from "@/common/record/types";
import { useErrorStore } from "@/renderer/store/error";
import { BookMove } from "@/common/book";
import { IconType } from "@/renderer/assets/icons";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import api from "@/renderer/ipc/api";
import {
  defaultBookImportSettings,
  PlayerCriteria,
  SourceType,
  validateBookImportSettings,
} from "@/common/settings/book";

type Tab = "memory" | "file" | "directory";
const STORAGE_KEY = "addBookMovesDialog:tab";
import DialogFrame from "./DialogFrame.vue";
import { RecordFileFormat, getStandardRecordFileFormats } from "@/common/file/record";
import { useConfirmationStore } from "@/renderer/store/confirm.js";
import { useMessageStore } from "@/renderer/store/message.js";

type InMemoryMove = {
  type: "move";
  ply: number;
  sfen: string;
  book: BookMove;
  text: string;
  score?: number;
  depth?: number;
  scoreUpdatable: boolean;
  exists: boolean;
  last: boolean;
};
type Branch = {
  type: "branch";
  ply: number;
};

const store = useStore();
const bookStore = useBookStore();
const errorStore = useErrorStore();
const busyState = useBusyState();
const activeTab = ref<Tab>((localStorage.getItem(STORAGE_KEY) as Tab) ?? "memory");
watch(activeTab, (tab) => localStorage.setItem(STORAGE_KEY, tab));

const settings = ref(defaultBookImportSettings());
const inMemoryList = ref<(InMemoryMove | Branch)[]>([]);
let currentMoveRow: HTMLElement | undefined;

const setupInMemoryList = async () => {
  const nodes: { node: ImmutableNode; sfen: string }[] = [];
  store.record.forEach((node) => {
    const prev = node.prev;
    const move = node.move;
    if (!prev || !(move instanceof Move)) {
      return;
    }
    nodes.push({ node, sfen: prev.sfen });
  });
  for (const { node, sfen } of nodes) {
    if (!node.isFirstBranch) {
      inMemoryList.value.push({ type: "branch", ply: node.ply });
    }
    const position = Position.newBySFEN(sfen) as Position;
    const move = node.move as Move;
    const bookMoves = await bookStore.searchMoves(sfen);
    const book = bookMoves.find((book) => book.usi === move.usi);
    const customData = node.customData ? (node.customData as RecordCustomData) : undefined;
    const searchInfo = customData?.researchInfo || customData?.playerSearchInfo;
    const score =
      searchInfo?.score !== undefined && move.color === Color.WHITE
        ? -searchInfo.score
        : searchInfo?.score;
    const depth = searchInfo?.depth;
    inMemoryList.value.push({
      type: "move",
      ply: node.ply,
      sfen,
      book: book || { usi: move.usi, comment: "" },
      text: formatMove(position, move),
      score,
      depth,
      scoreUpdatable:
        score !== undefined &&
        (score !== book?.score || (!!depth && (!book.depth || depth > book.depth))),
      exists: bookMoves.some((book) => book.usi === move.usi),
      last: node === store.record.current,
    });
  }
};

busyState.retain();

onMounted(async () => {
  try {
    await setupInMemoryList();
    settings.value = await api.loadBookImportSettings();
    await nextTick();
    currentMoveRow?.scrollIntoView({ block: "center" });
  } catch (e) {
    errorStore.add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

const onClose = () => {
  store.closeModalDialog();
};

const registerAllMoves = () => {
  useConfirmationStore().show({
    message: t.doYouWantToImportAllMoves,
    onOk: async () => {
      let added = 0;
      for (const item of inMemoryList.value) {
        if (item.type === "move" && (!item.exists || item.scoreUpdatable)) {
          await registerMove(item);
          added++;
        }
      }
      useMessageStore().enqueue({
        text: t.importedMoves(added),
      });
    },
  });
};

const registerMove = async (move: InMemoryMove) => {
  try {
    await bookStore.updateMove(move.sfen, {
      ...move.book,
      score: move.score,
      depth: move.depth,
    });
    move.exists = true;
    move.scoreUpdatable = false;
  } catch (e) {
    errorStore.add(e);
  }
};

const selectDirectory = async () => {
  busyState.retain();
  try {
    const path = await api.showSelectDirectoryDialog(settings.value.sourceDirectory);
    if (path) {
      settings.value.sourceDirectory = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const openDirectory = () => {
  api.openExplorer(settings.value.sourceDirectory);
};

const selectRecordFile = async () => {
  busyState.retain();
  try {
    const path = await api.showOpenRecordDialog([
      ...getStandardRecordFileFormats(),
      RecordFileFormat.SFEN,
    ]);
    if (path) {
      settings.value.sourceRecordFile = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const importMoves = () => {
  settings.value.sourceType = activeTab.value as SourceType;
  const error = validateBookImportSettings(settings.value);
  if (error) {
    useErrorStore().add(error);
    return;
  }
  bookStore.importBookMoves(settings.value);
};
</script>

<style scoped>
.form-group {
  width: 580px;
  min-height: calc(80vh - 200px);
  max-height: 600px;
}
table.move-list td {
  font-size: 0.8em;
  height: 2em;
  text-align: left;
  padding: 0 0.5em;
}
table.move-list td.branch {
  font-size: 0.6em;
}
input.small {
  width: 50px;
}
button.register-all,
button.import {
  width: 100%;
}
</style>
