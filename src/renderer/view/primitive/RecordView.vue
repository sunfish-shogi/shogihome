<template>
  <div class="full column record-view" :class="{ limited: showTopControl }">
    <div v-show="showTopControl" class="row control">
      <button :disabled="!operational" :data-hotkey="shortcutKeys.Begin" @click="goBegin">
        <Icon :icon="IconType.FIRST" />
      </button>
      <button :disabled="!operational" :data-hotkey="shortcutKeys.Back" @click="goBack()">
        <Icon :icon="IconType.BACK" />
      </button>
      <button :disabled="!operational" :data-hotkey="shortcutKeys.Forward" @click="goForward">
        <Icon :icon="IconType.NEXT" />
      </button>
      <button :disabled="!operational" :data-hotkey="shortcutKeys.End" @click="goEnd">
        <Icon :icon="IconType.LAST" />
      </button>
    </div>
    <div class="move-list-area">
      <!-- NOTE: 背景だけを透過させるために背景専用の要素を作る。 -->
      <div class="move-list-background" :style="{ opacity }"></div>
      <div ref="moveList" class="move-list">
        <div
          v-for="move in record.moves"
          :key="move.ply"
          class="row move-element"
          :class="{ 'has-branch': move.hasBranch, selected: move.ply === record.current.ply }"
          @click="changePly(move.ply)"
        >
          <div class="move-number">
            {{ move.ply !== 0 ? move.ply : "" }}
          </div>
          <div class="move-text">{{ move.displayText }}</div>
          <div v-if="showElapsedTime" class="move-time">{{ move.ply ? move.timeText : "" }}</div>
          <div v-if="showComment" class="move-comment">
            <button
              v-if="operational && (positionCounts.get(move.sfen) || 0) >= 2"
              class="duplicate"
              @click.stop="showDuplicatePositions(move.sfen)"
            >
              {{ t.duplicatePos }}
            </button>
            <span v-if="move.bookmark" class="bookmark">{{ move.bookmark }}</span>
            {{ move.comment }}
          </div>
        </div>
      </div>
    </div>
    <div v-if="showSubArea" class="row sub-area">
      <slot name="sub-area"></slot>
    </div>
    <div v-else-if="showBranches" class="row branch-list-area">
      <!-- NOTE: 背景だけを透過させるために背景専用の要素を作る。 -->
      <div class="move-list-background" :style="{ opacity }"></div>
      <div class="auto column regular-interval branch-list-main">
        <div ref="branchList" class="auto full branch-list">
          <div
            v-for="(branch, index) in branches"
            :key="index"
            class="row move-element"
            :class="{ selected: branch.activeBranch }"
            @click="changeBranch(index)"
          >
            <div class="move-text">{{ branch.displayText }}</div>
            <div v-if="showComment" class="move-comment">
              <button
                v-if="operational && (positionCounts.get(branch.sfen) || 0) >= 2"
                class="duplicate"
                @click.stop="showDuplicatePositions(branch.sfen)"
              >
                {{ t.duplicatePos }}
              </button>
              <span v-if="branch.bookmark" class="bookmark">{{ branch.bookmark }}</span>
              {{ branch.comment }}
            </div>
          </div>
        </div>
        <div v-if="!isMainBranch">
          <button
            class="branch-bottom-control"
            :disabled="!operational"
            @click="emit('backToMainBranch')"
          >
            {{ t.backToMainBranch }}
          </button>
        </div>
      </div>
      <div class="column branch-side-control">
        <button :disabled="!operational" @click="swapWithPreviousBranch()">
          <Icon :icon="IconType.ARROW_UP" />
        </button>
        <button :disabled="!operational" @click="swapWithNextBranch()">
          <Icon :icon="IconType.ARROW_DROP" />
        </button>
      </div>
    </div>
    <div v-if="showBottomControl" class="row wrap options">
      <div v-if="subAreaToggleLabel" class="option">
        <ToggleButton v-model:value="showSubArea" :label="subAreaToggleLabel" />
      </div>
      <div class="option">
        <ToggleButton
          :label="t.elapsedTime"
          :value="showElapsedTime"
          @update:value="(enabled: boolean) => emit('toggleShowElapsedTime', enabled)"
        />
      </div>
      <div class="option">
        <ToggleButton
          :label="t.commentsAndBookmarks"
          :value="showComment"
          @update:value="(enabled: boolean) => emit('toggleShowComment', enabled)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ImmutableRecord, ImmutableNode } from "tsshogi";
import { computed, ref, PropType, onUpdated } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import ToggleButton from "./ToggleButton.vue";
import { RecordShortcutKeys } from "./board/shortcut";
import { t } from "@/common/i18n";

const props = defineProps({
  record: {
    type: Object as PropType<ImmutableRecord>,
    required: true,
  },
  positionCounts: {
    type: Object as PropType<ReadonlyMap<string, number>>,
    default: () => new Map<string, number>(),
  },
  operational: {
    type: Boolean,
    required: false,
  },
  showElapsedTime: {
    type: Boolean,
    required: false,
  },
  showComment: {
    type: Boolean,
    required: false,
  },
  subAreaToggleLabel: {
    type: String,
    required: false,
    default: undefined,
  },
  opacity: {
    type: Number,
    required: false,
    default: 1.0,
  },
  showTopControl: {
    type: Boolean,
    required: false,
    default: true,
  },
  showBottomControl: {
    type: Boolean,
    required: false,
    default: true,
  },
  showBranches: {
    type: Boolean,
    required: false,
    default: true,
  },
  shortcutKeys: {
    type: Object as PropType<RecordShortcutKeys>,
    required: true,
  },
});

const emit = defineEmits<{
  goBegin: [];
  goBack: [];
  goForward: [];
  goEnd: [];
  selectMove: [ply: number];
  selectBranch: [index: number];
  backToMainBranch: [];
  swapWithPreviousBranch: [];
  swapWithNextBranch: [];
  showDuplicatePositions: [sfen: string];
  toggleShowElapsedTime: [enabled: boolean];
  toggleShowComment: [enabled: boolean];
}>();

const moveList = ref(null as HTMLDivElement | null);
const branchList = ref(null as HTMLDivElement | null);
const showSubArea = ref(false);

const goBegin = () => {
  if (props.operational) {
    emit("goBegin");
  }
};

const goBack = () => {
  if (props.operational) {
    emit("goBack");
  }
};

const goForward = () => {
  if (props.operational) {
    emit("goForward");
  }
};

const goEnd = () => {
  if (props.operational) {
    emit("goEnd");
  }
};

const changePly = (number: number) => {
  if (props.operational) {
    emit("selectMove", Number(number));
  }
};

const changeBranch = (index: number) => {
  if (props.operational) {
    emit("selectBranch", Number(index));
  }
};

const swapWithPreviousBranch = () => {
  if (props.operational) {
    emit("swapWithPreviousBranch");
  }
};

const swapWithNextBranch = () => {
  if (props.operational) {
    emit("swapWithNextBranch");
  }
};

const showDuplicatePositions = (sfen: string) => {
  if (props.operational) {
    emit("showDuplicatePositions", sfen);
  }
};

const isMainBranch = computed(() => {
  for (
    let node: ImmutableNode | null = props.record.first;
    node && node.activeBranch;
    node = node.next
  ) {
    if (node === props.record.current) {
      return true;
    }
  }
  return false;
});

const branches = computed(() => {
  if (!props.record.branchBegin.branch) {
    return null;
  }
  const ret: ImmutableNode[] = [];
  let p: ImmutableNode | null;
  for (p = props.record.branchBegin; p; p = p.branch) {
    ret.push(p);
  }
  return ret;
});

onUpdated(() => {
  const moveListElement = moveList.value;
  moveListElement?.childNodes.forEach((elem) => {
    if (elem instanceof HTMLElement && elem.classList.contains("selected")) {
      elem.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  });
  const branchListElement = branchList.value as HTMLElement;
  branchListElement?.childNodes.forEach((elem) => {
    if (elem instanceof HTMLElement && elem.classList.contains("selected")) {
      elem.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  });
});
</script>

<style scoped>
.record-view {
  user-select: none;
}
.record-view.limited {
  max-width: calc(max(100vh, 600px));
}
.control {
  width: 100%;
  height: 8.6%;
  min-height: 23px;
}
.control button {
  height: 100%;
  width: 25%;
  padding: 0px;
}
.move-list-background {
  position: absolute;
  z-index: -1;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--text-bg-color);
}
.move-list-area {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 0%;
  flex: auto;
}
.move-list {
  margin-top: 1px;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--text-color);
}
.sub-area {
  position: relative;
  z-index: 1;
  margin-top: 2px;
  width: 100%;
  height: calc(40% - 15px);
  min-height: 40px;
}
.branch-list-area {
  position: relative;
  z-index: 1;
  margin-top: 2px;
  width: 100%;
  height: calc(26.2% - 15px);
  min-height: 40px;
}
.branch-list-main {
  width: auto;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
}
.branch-list {
  color: var(--text-color);
}
.branch-bottom-control {
  width: 100%;
  padding: 2px;
}
.branch-side-control {
  width: 40px;
  height: 100%;
}
.branch-side-control button {
  height: 50%;
  width: 100%;
  padding: 0;
}
.branch-side-control button .icon {
  height: 40px;
  max-height: 100%;
}
.move-element {
  height: 1.4em;
  width: 100%;
  line-height: 1.4em;
  font-size: 0.85em;
  scroll-margin: 1em;
}
.move-element.has-branch:not(.selected) {
  background-color: var(--text-bg-color-warning);
}
.move-element.selected {
  background-color: var(--text-bg-color-selected);
}
.move-element:last-child {
  margin-bottom: 1em;
}
.move-number {
  min-width: 38px;
  height: 100%;
  padding-right: 5px;
  text-align: right;
  vertical-align: baseline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}
.move-text {
  min-width: 100px;
  height: 100%;
  padding-right: 5px;
  text-align: left;
  vertical-align: baseline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}
.move-time {
  min-width: fit-content;
  height: 100%;
  padding-right: 5px;
  text-align: left;
  vertical-align: baseline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}
.move-comment {
  height: 100%;
  text-align: left;
  vertical-align: baseline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
button.duplicate {
  display: inline-block;
  height: 100%;
  font-size: 0.85em;
  padding-left: 5px;
  padding-right: 5px;
  box-sizing: border-box;
  margin: 0px 3px 0px 0px;
  vertical-align: top;
}
.bookmark {
  display: inline-block;
  height: 100%;
  color: var(--main-color);
  background-color: var(--main-bg-color);
  padding-left: 5px;
  padding-right: 5px;
  box-sizing: border-box;
  border: 1px solid var(--text-separator-color);
  border-radius: 5px;
  vertical-align: top;
}
.options {
  width: 100%;
  margin: 0;
  padding: 2px 0 0 0;
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
.option {
  padding: 0 6px 0 6px;
  margin-right: 4px;
}
</style>
