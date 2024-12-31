<template>
  <div class="root">
    <!-- NOTE: 背景だけを透過させるために背景専用の要素を作る。 -->
    <div class="background" :style="{ opacity }"></div>
    <div ref="main" class="full main">
      <table class="list">
        <thead>
          <tr>
            <td class="number">No.</td>
            <td class="text">{{ t.bookMove }}</td>
            <td v-show="playable" class="menu">{{ t.play }}</td>
            <td v-show="editable" class="menu">{{ t.edit }}</td>
            <td v-show="editable" class="menu">{{ t.remove }}</td>
            <td class="number">{{ t.score }}</td>
            <td class="number">{{ t.depth }}</td>
            <td class="number">{{ t.freq }}</td>
            <td class="number"></td>
            <td class="text">{{ t.comments }}</td>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, index) of moveList" :key="entry.usi">
            <td class="number">
              <select
                :value="index"
                @change="
                  (elem) =>
                    emit('order', entry.move, Number((elem.target as HTMLSelectElement).value))
                "
              >
                <option v-for="i in moveList.length" :key="`${index}${i}`" :value="i - 1">
                  {{ i }}
                </option>
              </select>
            </td>
            <td class="text">
              <span>{{ formatMove(position, entry.move) }}</span>
            </td>
            <td v-show="playable" class="menu">
              <button @click="emit('play', entry.move)">
                <Icon :icon="IconType.PLAY" />
              </button>
            </td>
            <td v-show="editable" class="menu">
              <button @click="emit('edit', entry.move)">
                <Icon :icon="IconType.EDIT" />
              </button>
            </td>
            <td v-show="editable" class="menu">
              <button @click="emit('remove', entry.move)">
                <Icon :icon="IconType.TRASH" />
              </button>
            </td>
            <td class="number">
              <span>{{ entry.score }}</span>
            </td>
            <td class="number">
              <span>{{ entry.depth }}</span>
            </td>
            <td class="number">
              <span>{{ entry.count }}</span>
            </td>
            <td class="number small">
              <span v-if="entry.percentage !== undefined">({{ entry.percentage }}%)</span>
            </td>
            <td class="text">
              <span v-if="entry.repetition" class="in-comment-label">{{ t.repetition }}</span>
              <span>{{ entry.comment }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BookMoveEx } from "@/common/book";
import { formatMove, ImmutablePosition, Move } from "tsshogi";
import { computed, onUpdated, PropType, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { t } from "@/common/i18n";

const main = ref<HTMLElement | null>(null);

onUpdated(() => {
  if (main.value) {
    main.value.scrollTop = 0;
  }
});

const props = defineProps({
  position: {
    type: Object as PropType<ImmutablePosition>,
    required: true,
  },
  moves: {
    type: Array as PropType<BookMoveEx[]>,
    required: true,
  },
  opacity: {
    type: Number,
    required: false,
    default: 1.0,
  },
  playable: {
    type: Boolean,
    required: false,
    default: true,
  },
  editable: {
    type: Boolean,
    required: false,
    default: true,
  },
});

const emit = defineEmits<{
  play: [move: Move];
  edit: [move: Move];
  remove: [move: Move];
  order: [move: Move, order: number];
}>();

const moveList = computed(() => {
  const list = [];
  let totalCount = 0;
  for (const entry of props.moves) {
    totalCount += entry.count || 0;
  }
  for (const entry of props.moves) {
    const move = props.position.createMoveByUSI(entry.usi);
    if (move !== null) {
      list.push({
        move,
        usi: entry.usi,
        score: entry.score,
        depth: entry.depth,
        count: entry.count,
        percentage:
          entry.count !== undefined && totalCount > 0
            ? Math.round((entry.count / totalCount) * 100)
            : undefined,
        comment: entry.comment,
        repetition: entry.repetition,
      });
    }
  }
  return list;
});
</script>

<style scoped>
.root {
  position: relative;
  width: 100%;
  height: 100%;
}
.background {
  position: absolute;
  z-index: -1;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--text-bg-color);
}
.main {
  margin-top: 1px;
  overflow-y: auto;
  color: var(--text-color);
  font-size: 0.85em;
}
table.list > thead > tr > td {
  background-color: var(--text-bg-color);
  position: sticky;
  top: 0;
  left: 0;
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  margin: 0;
  padding: 0 0 0 2px;
}
table.list > tbody > tr > td {
  white-space: nowrap;
  overflow: hidden;
  margin: 0;
  padding: 0 0 0 2px;
  vertical-align: middle;
}
table.list > tbody > tr > td > * {
  vertical-align: middle;
}
td.menu {
  text-align: center;
}
td.text {
  text-align: left;
}
td.number {
  text-align: right;
}
td.small {
  font-size: 0.85em;
  line-height: 1.2em;
}
button > .icon {
  height: 1.4em;
}
.in-comment-label {
  display: inline-block;
  height: 100%;
  color: var(--main-color);
  background-color: var(--main-bg-color);
  padding-left: 5px;
  padding-right: 5px;
  margin-right: 5px;
  box-sizing: border-box;
  border: 1px solid var(--text-separator-color);
  border-radius: 5px;
}
</style>
