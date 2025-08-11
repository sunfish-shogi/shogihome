<template>
  <DialogFrame limited @cancel="onCancel">
    <div class="title">{{ t.duplicatePositions }}</div>
    <div class="frame form-group">
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
.frame {
  max-width: calc(100vw - 80px);
}
th {
  padding: 0px 40px 5px 0px;
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
  padding: 5px 40px 5px 0px;
}
td:not(:last-child) {
  text-align: left;
}
td:last-child {
  text-align: center;
  padding-right: 0px;
}
</style>
