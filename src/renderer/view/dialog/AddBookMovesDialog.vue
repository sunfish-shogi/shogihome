<template>
  <div>
    <dialog ref="dialog">
      <div class="title">定跡手追加</div>
      <div>
        <HorizontalSelector
          :value="sourceType"
          :items="[
            { value: 'memory', label: '現在の棋譜から' },
            { value: 'file', label: 'ファイルから' },
          ]"
          @change="
            (value) => {
              sourceType = value as SourceType;
            }
          "
        />
      </div>
      <div class="form-group scroll">
        <div v-show="sourceType === 'memory'">
          <div v-if="inMemoryList.length === 0">指し手がありません。</div>
          <table v-else class="move-list">
            <tbody>
              <tr v-for="move of inMemoryList" :key="move.ply">
                <td v-if="move.type === 'move'">{{ move.ply }}</td>
                <td v-if="move.type === 'move'">{{ move.text }}</td>
                <td v-if="move.type === 'move'">
                  <span v-if="move.score !== undefined">{{ t.eval }} {{ move.score }}</span>
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
        </div>
        <div v-show="sourceType === 'file'">TODO</div>
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
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { useBusyState } from "@/renderer/store/busy";
import { Color, formatMove, ImmutableNode, Move, Position } from "tsshogi";
import { useBookStore } from "@/renderer/store/book";
import { RecordCustomData } from "@/renderer/store/record";
import { useErrorStore } from "@/renderer/store/error";
import { BookMove } from "@/common/book";

type SourceType = "memory" | "file";
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
const bussy = useBusyState();
const dialog = ref();
const sourceType = ref<SourceType>("memory");
const inMemoryList = ref<(InMemoryMove | Branch)[]>([]);

bussy.retain();

onMounted(async () => {
  try {
    showModalDialog(dialog.value, onClose);
    installHotKeyForDialog(dialog.value);
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
  } catch (e) {
    errorStore.add(e);
  } finally {
    bussy.release();
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
</style>
