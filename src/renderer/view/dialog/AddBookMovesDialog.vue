<template>
  <div>
    <dialog ref="dialog">
      <div class="title">定跡手追加</div>
      <div>
        <HorizontalSelector
          v-model:value="sourceType"
          :items="[
            { value: SourceType.MEMORY, label: '現在の棋譜から' },
            { value: SourceType.FILE, label: 'ファイルから' },
            { value: SourceType.DIRECTORY, label: 'フォルダから' },
          ]"
        />
      </div>
      <div class="form-group scroll">
        <div v-show="sourceType === 'memory' && !inMemoryList.length">指し手がありません。</div>
        <table v-show="sourceType === 'memory' && inMemoryList.length" class="move-list">
          <tbody>
            <tr v-for="move of inMemoryList" :key="move.ply">
              <td v-if="move.type === 'move'">{{ move.ply }}</td>
              <td v-if="move.type === 'move'">{{ move.text }}</td>
              <td v-if="move.type === 'move'">
                <span v-if="move.score !== undefined">{{ t.score }} {{ move.score }}</span>
              </td>
              <td v-if="move.type === 'move'">
                <button v-if="!move.exists" class="thin" @click="registerMove(move)">登録</button>
                <button v-else-if="move.scoreUpdatable" class="thin" @click="updateScore(move)">
                  更新
                </button>
              </td>
              <td v-if="move.type === 'move'"><span v-if="move.last">(現在の手)</span></td>
              <td v-if="move.type === 'branch'" class="branch" colspan="5">
                {{ move.ply }}手目から分岐:
              </td>
            </tr>
          </tbody>
        </table>
        <div v-show="sourceType === 'directory'" class="form-item row">
          <input ref="sourceDir" class="grow" type="text" />
          <button class="thin" @click="selectDirectory()">
            {{ t.select }}
          </button>
          <button class="thin open-dir" @click="openDirectory()">
            <Icon :icon="IconType.OPEN_FOLDER" />
          </button>
        </div>
        <div v-show="sourceType === 'file'" class="form-item row">
          <input ref="sourceFile" class="grow" type="text" />
          <button class="thin" @click="selectRecordFile()">
            {{ t.select }}
          </button>
        </div>
        <div v-show="sourceType === 'directory' || sourceType === 'file'" class="form-item row">
          <span>{{ t.fromPrefix }}</span>
          <input ref="minPly" class="small" type="number" min="0" step="1" value="0" />
          <span>{{ t.plySuffix }}{{ t.fromSuffix }}</span>
        </div>
        <div v-show="sourceType === 'directory' || sourceType === 'file'" class="form-item row">
          <span>{{ t.toPrefix }}</span>
          <input ref="maxPly" class="small" type="number" min="0" step="1" value="1000" />
          <span>{{ t.plySuffix }}{{ t.toSuffix }}</span>
        </div>
        <div v-show="sourceType === 'directory' || sourceType === 'file'" class="form-item row">
          <HorizontalSelector
            v-model:value="playerCriteria"
            :items="[
              { value: PlayerCriteria.ALL, label: '全ての対局者' },
              { value: PlayerCriteria.BLACK, label: '先手のみ' },
              { value: PlayerCriteria.WHITE, label: '後手のみ' },
              { value: PlayerCriteria.FILTER_BY_NAME, label: '名前でフィルタ' },
            ]"
          />
        </div>
        <div v-show="sourceType === 'directory' || sourceType === 'file'" class="form-item row">
          <input
            v-show="playerCriteria === 'filterByName'"
            ref="playerName"
            class="grow"
            type="text"
            placeholder="ここに対局者名の一部を入力"
          />
        </div>
      </div>
      <div v-show="sourceType === 'directory' || sourceType === 'file'">
        <button class="import" @click="importMoves">取り込む</button>
      </div>
      <div class="main-buttons">
        <button autofocus data-hotkey="Escape" @click="onClose">
          {{ t.close }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useBusyState } from "@/renderer/store/busy";
import { Color, formatMove, ImmutableNode, Move, Position } from "tsshogi";
import { useBookStore } from "@/renderer/store/book";
import { RecordCustomData } from "@/renderer/store/record";
import { useErrorStore } from "@/renderer/store/error";
import { BookMove } from "@/common/book";
import { IconType } from "@/renderer/assets/icons";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import api from "@/renderer/ipc/api";
import {
  BookImportSettings,
  PlayerCriteria,
  SourceType,
  validateBookImportSettings,
} from "@/common/settings/book";
import { readInputAsNumber } from "@/renderer/helpers/form";

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
const dialog = ref();
const sourceDir = ref();
const sourceFile = ref();
const sourceType = ref<SourceType>(SourceType.MEMORY);
const minPly = ref();
const maxPly = ref();
const playerCriteria = ref<PlayerCriteria>(PlayerCriteria.ALL);
const playerName = ref();
const inMemoryList = ref<(InMemoryMove | Branch)[]>([]);

const setupInMemoryList = async () => {
  const nodes: { node: ImmutableNode; sfen: string }[] = [];
  store.record.forEach((node, position) => {
    const move = node.move;
    if (!(move instanceof Move)) {
      return;
    }
    nodes.push({ node, sfen: position.sfen });
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
    const settings = await api.loadBookImportSettings();
    sourceType.value = settings.sourceType;
    sourceDir.value.value = settings.sourceDirectory;
    sourceFile.value.value = settings.sourceRecordFile;
    minPly.value.value = settings.minPly.toString();
    maxPly.value.value = settings.maxPly.toString();
    playerCriteria.value = settings.playerCriteria;
    playerName.value.value = settings.playerName || "";
    showModalDialog(dialog.value, onClose);
    installHotKeyForDialog(dialog.value);
  } catch (e) {
    errorStore.add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const onClose = () => {
  store.closeModalDialog();
};

const registerMove = (move: InMemoryMove) => {
  bookStore.updateMove(move.sfen, {
    ...move.book,
    score: move.score,
    depth: move.depth,
  });
  move.exists = true;
  move.scoreUpdatable = false;
};

const updateScore = (move: InMemoryMove) => {
  bookStore.updateMove(move.sfen, {
    ...move.book,
    score: move.score,
    depth: move.depth,
  });
  move.scoreUpdatable = false;
};

const selectDirectory = async () => {
  busyState.retain();
  try {
    const input = sourceDir.value as HTMLInputElement;
    const path = await api.showSelectDirectoryDialog(input.value);
    if (path) {
      input.value = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const openDirectory = () => {
  const input = sourceDir.value as HTMLInputElement;
  api.openExplorer(input.value);
};

const selectRecordFile = async () => {
  busyState.retain();
  try {
    const input = sourceFile.value as HTMLInputElement;
    const path = await api.showOpenRecordDialog();
    if (path) {
      input.value = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const importMoves = () => {
  const settings: BookImportSettings = {
    sourceType: sourceType.value,
    sourceDirectory: sourceDir.value.value,
    sourceRecordFile: sourceFile.value.value,
    minPly: readInputAsNumber(minPly.value),
    maxPly: readInputAsNumber(maxPly.value),
    playerCriteria: playerCriteria.value,
    playerName: playerName.value.value,
  };
  const error = validateBookImportSettings(settings);
  if (error) {
    useErrorStore().add(error);
    return;
  }
  bookStore.importBookMoves(settings);
};
</script>

<style scoped>
dialog {
  width: 600px;
  height: 80%;
  max-width: 100%;
  max-height: 800px;
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
button.import {
  width: 100%;
}
</style>
