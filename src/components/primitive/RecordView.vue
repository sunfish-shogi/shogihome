<template>
  <div ref="root" class="record-view">
    <div class="controller">
      <button
        class="control-button"
        :disabled="!operational"
        data-hotkey="ArrowLeft"
        @click="goBegin()"
      >
        <ButtonIcon class="icon" :icon="Icon.FIRST" />
      </button>
      <button
        class="control-button"
        :disabled="!operational"
        data-hotkey="ArrowUp"
        @click="goBack()"
      >
        <ButtonIcon class="icon" :icon="Icon.BACK" />
      </button>
      <button
        class="control-button"
        :disabled="!operational"
        data-hotkey="ArrowDown"
        @click="goForward()"
      >
        <ButtonIcon class="icon" :icon="Icon.NEXT" />
      </button>
      <button
        class="control-button"
        :disabled="!operational"
        data-hotkey="ArrowRight"
        @click="goEnd()"
      >
        <ButtonIcon class="icon" :icon="Icon.LAST" />
      </button>
    </div>
    <div ref="moveList" class="move-list">
      <div
        v-for="move in moves"
        :key="move.number"
        class="move-element"
        :class="{ 'has-branch': move.hasBranch, selected: move.selected }"
        :value="move.number"
        @click="changeNumber(move.number)"
      >
        <div class="move-number">
          {{ move.number !== 0 ? move.number : "" }}
        </div>
        <div class="move-text">{{ move.text }}</div>
        <div v-if="showElapsedTime" class="move-time">{{ move.time }}</div>
        <div v-if="showComment" class="move-comment">{{ move.comment }}</div>
      </div>
    </div>
    <div ref="branchList" class="branch-list">
      <div
        v-for="branch in branches"
        :key="branch.index"
        class="move-element"
        :class="{ selected: branch.selected }"
        :value="branch.index"
        @click="changeBranch(branch.index)"
      >
        <div class="move-text">{{ branch.text }}</div>
        <div v-if="showComment" class="move-comment">{{ branch.comment }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { ImmutableRecord, ImmutableNode } from "@/shogi";
import {
  computed,
  ref,
  defineComponent,
  Ref,
  PropType,
  onUpdated,
  onMounted,
  onBeforeUnmount,
} from "vue";
import ButtonIcon from "@/components/primitive/ButtonIcon.vue";
import { Icon } from "@/assets/icons";
import { installHotKey, uninstallHotKey } from "@/helpers/hotkey";

export default defineComponent({
  name: "RecordView",
  components: {
    ButtonIcon,
  },
  props: {
    record: {
      type: Object as PropType<ImmutableRecord>,
      required: true,
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
  },
  emits: [
    "goBegin",
    "goBack",
    "goForward",
    "goEnd",
    "selectMove",
    "selectBranch",
  ],
  setup(props, context) {
    const root: Ref = ref(null);
    const moveList: Ref<HTMLDivElement | null> = ref(null);
    const branchList: Ref = ref(null);

    const goBegin = () => {
      if (props.operational) {
        context.emit("goBegin");
      }
    };

    const goBack = () => {
      if (props.operational) {
        context.emit("goBack");
      }
    };

    const goForward = () => {
      if (props.operational) {
        context.emit("goForward");
      }
    };

    const goEnd = () => {
      if (props.operational) {
        context.emit("goEnd");
      }
    };

    const changeNumber = (number: number) => {
      if (props.operational) {
        context.emit("selectMove", Number(number));
      }
    };

    const changeBranch = (index: number) => {
      if (props.operational) {
        context.emit("selectBranch", Number(index));
      }
    };

    const beginPosSelected = computed(() => props.record.current.number === 0);

    const moves = computed(() => {
      const ret: {
        number: number;
        text: string;
        time: string;
        hasBranch: boolean;
        comment: string;
        selected: boolean;
      }[] = [];
      props.record.moves.forEach((elem) => {
        ret.push({
          number: elem.number,
          text: elem.displayText,
          time: elem.number != 0 ? elem.timeText : "",
          hasBranch: elem.hasBranch,
          comment: elem.comment,
          selected: elem === props.record.current,
        });
      });
      return ret;
    });

    const branches = computed(() => {
      if (!props.record.branchBegin.branch) {
        return null;
      }
      const ret: {
        index: number;
        text: string;
        comment: string;
        selected: boolean;
      }[] = [];
      let p: ImmutableNode | null;
      for (p = props.record.branchBegin; p && p.move; p = p.branch) {
        ret.push({
          index: ret.length,
          text: p.displayText,
          comment: p.comment,
          selected: p.activeBranch,
        });
      }
      return ret;
    });

    onMounted(() => {
      installHotKey(root.value);
    });

    onBeforeUnmount(() => {
      uninstallHotKey(root.value);
    });

    onUpdated(() => {
      const moveListElement = moveList.value as HTMLElement;
      moveListElement.childNodes.forEach((elem) => {
        if (
          elem instanceof HTMLElement &&
          elem.classList.contains("selected")
        ) {
          elem.scrollIntoView({ behavior: "auto", block: "nearest" });
        }
      });
    });

    return {
      root,
      beginPosSelected,
      moves,
      branches,
      moveList,
      branchList,
      goBegin,
      goBack,
      goForward,
      goEnd,
      changeNumber,
      changeBranch,
      Icon,
    };
  },
});
</script>

<style scoped>
.record-view {
  max-width: 600px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  user-select: none;
}
.controller {
  width: 100%;
  height: 40px;
}
.control-button {
  height: 100%;
  width: 25%;
  padding: 0px;
}
.move-list {
  margin-top: 1px;
  width: 100%;
  height: calc(70% - 30px);
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
.branch-list {
  flex: auto;
  margin-top: 2px;
  width: 100%;
  height: calc(30% - 10px);
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
.move-element {
  height: 1.4em;
  width: 100%;
  display: flex;
  flex-direction: row;
  line-height: 1.4em;
  font-size: 0.85em;
}
.move-element.has-branch:not(.selected) {
  background-color: var(--text-bg-color-warning);
}
.move-element.selected {
  background-color: var(--text-bg-color-selected);
}
.move-number {
  min-width: 38px;
  height: 100%;
  padding-right: 5px;
  text-align: right;
  vertical-align: baseline;
}
.move-text {
  min-width: 100px;
  height: 100%;
  padding-right: 5px;
  text-align: left;
  vertical-align: baseline;
}
.move-time {
  min-width: 90px;
  height: 100%;
  padding-right: 5px;
  text-align: left;
  vertical-align: baseline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.move-comment {
  min-width: 0px;
  height: 100%;
  text-align: left;
  vertical-align: baseline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
