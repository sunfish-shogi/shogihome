<template>
  <DialogFrame limited @cancel="onCancel">
    <div class="title">{{ t.duplicatePositions }}</div>
    <div class="content form-group scroll">
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>{{ t.via }}</th>
            <th>{{ t.lastMove }}</th>
            <th>{{ t.nextMoves }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(position, pi) of positions" :key="pi">
            <td>{{ pi + 1 }}</td>
            <td>
              <div v-for="(variation, vi) of position.variation" :key="vi">
                {{ variation }}
              </div>
            </td>
            <td>{{ position.lastMove }}</td>
            <td>
              <div v-for="(nextMove, ni) of position.nextMoves" :key="ni">
                {{ nextMove }}
              </div>
            </td>
            <td>
              <span v-if="position.active">{{ t.currentPosition }}</span>
              <button v-else @click="emit('select', position.node)">
                {{ t.goToThisPosition }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="card-list">
        <div v-for="(position, pi) of positions" :key="pi" class="card">
          <hr v-if="pi !== 0" />
          <div class="card-header">
            <span class="card-index">{{ pi + 1 }}</span>
            <span v-if="position.active">{{ t.currentPosition }}</span>
            <button v-else @click="emit('select', position.node)">
              {{ t.goToThisPosition }}
            </button>
          </div>
          <div v-if="position.variation.length" class="card-field">
            <div class="card-field-label">{{ t.via }}</div>
            <div class="card-field-value">
              <div v-for="(variation, vi) of position.variation" :key="vi">
                {{ variation }}
              </div>
            </div>
          </div>
          <div class="card-field">
            <div class="card-field-label">{{ t.lastMove }}</div>
            <div class="card-field-value">{{ position.lastMove }}</div>
          </div>
          <div v-if="position.nextMoves.length" class="card-field">
            <div class="card-field-label">{{ t.nextMoves }}</div>
            <div class="card-field-value next-moves">
              <span v-for="(nextMove, ni) of position.nextMoves" :key="ni">
                {{ nextMove }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Escape" @click="onCancel">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DialogFrame from "./DialogFrame.vue";
import { useStore } from "@/renderer/store";
import { t } from "@/common/i18n";
import { ImmutableNode } from "tsshogi";

const props = defineProps({
  sfen: {
    type: String,
    required: true,
  },
});

const emit = defineEmits<{
  select: [node: ImmutableNode];
  close: [];
}>();

const store = useStore();

const positions = computed(() => {
  const positions: {
    lastMove: string;
    variation: string[];
    nextMoves: string[];
    active: boolean;
    node: ImmutableNode;
  }[] = [];
  store.record.forEach((node) => {
    if (node.sfen !== props.sfen) {
      return;
    }
    const lastMove = `${t.plyPrefix}${node.ply}${t.plySuffix} ${node.displayText}`;
    const variation: string[] = [];
    for (let p = node.prev; p; p = p.prev) {
      if (p.hasBranch) {
        variation.unshift(`${t.plyPrefix}${p.ply}${t.plySuffix} ${p.displayText}`);
      }
    }
    const nextMoves: string[] = [];
    for (let branch = node.next; branch; branch = branch.branch) {
      nextMoves.push(branch.displayText);
    }
    const active = node === store.record.current;
    positions.push({ lastMove, variation, nextMoves, active, node });
  });
  return positions;
});

function onCancel() {
  emit("close");
}
</script>

<style scoped>
.content {
  max-width: calc(100vw - 80px);
  max-height: 60vh;
}
th {
  padding: 0px 20px 5px 0px;
}
th:not(:last-child) {
  text-align: left;
}
th:last-child {
  text-align: center;
  padding-right: 0px;
}
td {
  vertical-align: top;
  border-top: 1px dashed var(--dialog-border-color);
  padding: 5px 20px 5px 0px;
}
td:not(:last-child) {
  text-align: left;
}
td:first-child {
  white-space: nowrap;
}
td:last-child {
  text-align: center;
  padding-right: 0px;
  white-space: nowrap;
}
.card-list {
  display: none;
  flex-direction: column;
  text-align: left;
}
.card-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin: 5px 0px 5px 0px;
}
.card-index {
  font-weight: bold;
}
.card-field {
  display: flex;
  flex-direction: row;
  margin: 2px 0px 2px 0px;
}
.card-field-label {
  flex: none;
  width: 6.5em;
  font-size: 0.9em;
}
.card-field-value {
  flex: 1;
  word-break: break-word;
}
.next-moves {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0px 0.75em;
}
/* 5 カラムのテーブルとダイアログの余白を収めるのに必要な概算幅。
   これを下回る場合はテーブルではなくカードリストで表示する。 */
@media (max-width: 600px) {
  table {
    display: none;
  }
  .card-list {
    display: flex;
  }
}
</style>
