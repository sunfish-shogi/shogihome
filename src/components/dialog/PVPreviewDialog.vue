<template>
  <div>
    <dialog ref="dialog">
      <BoardView
        class="board"
        :piece-image-type="appSetting.pieceImage"
        :board-image-type="appSetting.boardImage"
        :board-label-type="appSetting.boardLabelType"
        :max-size="maxSize"
        :position="pos"
        :last-move="lastMove"
        :flip="flip"
      >
        <template #right-control>
          <div class="control top">
            <div class="control-row">
              <button
                class="control-item"
                data-hotkey="Control+t"
                @click="doFlip"
              >
                <ButtonIcon class="icon" :icon="Icon.FLIP" />
              </button>
              <button
                class="control-item"
                autofocus
                data-hotkey="Escape"
                @click="close"
              >
                <ButtonIcon class="icon" :icon="Icon.CLOSE" />
              </button>
            </div>
            <div class="control-row">
              <button
                class="control-item"
                data-hotkey="ArrowLeft"
                @click="goBegin"
              >
                <ButtonIcon class="icon" :icon="Icon.FIRST" />
              </button>
              <button
                class="control-item"
                data-hotkey="ArrowRight"
                @click="goEnd"
              >
                <ButtonIcon class="icon" :icon="Icon.LAST" />
              </button>
            </div>
            <div class="control-row">
              <button
                class="control-item"
                data-hotkey="ArrowUp"
                @click="goBack"
              >
                <ButtonIcon class="icon" :icon="Icon.BACK" />
              </button>
              <button
                class="control-item"
                data-hotkey="ArrowDown"
                @click="goForward"
              >
                <ButtonIcon class="icon" :icon="Icon.NEXT" />
              </button>
            </div>
          </div>
        </template>
      </BoardView>
      <div class="informations">
        <div v-for="info in infos" :key="info" class="information">
          {{ info }}
        </div>
        <div class="information">
          <span v-for="move in displayPV" :key="move.number">
            <span class="move-element" :class="{ selected: move.selected }"
              >&nbsp;{{ move.text }}&nbsp;</span
            >
          </span>
        </div>
      </div>
    </dialog>
  </div>
</template>

<script lang="ts">
import { Move, Position, Record } from "@/shogi";
import { useStore } from "@/store";
import {
  defineComponent,
  onMounted,
  PropType,
  Ref,
  ref,
  reactive,
  watch,
  onBeforeUnmount,
} from "vue";
import BoardView from "@/components/primitive/BoardView.vue";
import ButtonIcon from "@/components/primitive/ButtonIcon.vue";
import { RectSize } from "@/components/primitive/Types";
import { computed } from "vue";
import { showModalDialog } from "@/helpers/dialog";
import { Icon } from "@/assets/icons";
import { installHotKey, uninstallHotKey } from "@/helpers/hotkey";

export default defineComponent({
  name: "PVPreviewDialog",
  components: { BoardView, ButtonIcon },
  props: {
    position: {
      type: String,
      required: true,
    },
    pv: {
      type: Object as PropType<string[]>,
      required: true,
    },
    infos: {
      type: Object as PropType<string[]>,
      default: [] as string[],
      required: false,
    },
  },
  emits: ["close"],
  setup(props, context) {
    const store = useStore();
    const dialog: Ref = ref(null);
    const maxSize = reactive(new RectSize(0, 0));
    const record = reactive(new Record());
    const flip: Ref<boolean> = ref(store.appSetting.boardFlipping);

    const updateSize = () => {
      maxSize.width = window.innerWidth * 0.8;
      maxSize.height = window.innerHeight * 0.8 - 80;
    };

    const updateRecord = () => {
      const position = Position.newBySFEN(props.position);
      if (!position) {
        return;
      }
      record.clear(position);
      for (const sfen of props.pv) {
        const move = record.position.createMoveBySFEN(sfen);
        if (!move) {
          break;
        }
        record.append(move, { ignoreValidation: true });
      }
      record.goto(1);
    };

    onMounted(async () => {
      updateSize();
      updateRecord();
      window.addEventListener("resize", updateSize);
      showModalDialog(dialog.value);
      installHotKey(dialog.value);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("resize", updateSize);
      uninstallHotKey(dialog.value);
    });

    watch([() => props.position, () => props.pv], () => {
      updateRecord();
      showModalDialog(dialog.value);
    });

    const close = () => {
      context.emit("close");
    };

    const goBegin = () => {
      record.goto(0);
    };

    const goEnd = () => {
      record.goto(Number.MAX_SAFE_INTEGER);
    };

    const goBack = () => {
      record.goBack();
    };

    const goForward = () => {
      record.goForward();
    };

    const doFlip = () => {
      flip.value = !flip.value;
    };

    const pos = computed(() => record.position);
    const lastMove = computed(() =>
      record.current.move instanceof Move ? record.current.move : null
    );

    const displayPV = computed(() => {
      return record.moves.slice(1).map((move) => {
        return {
          number: move.number,
          text: move.displayText,
          selected: move.number === record.current.number,
        };
      });
    });

    return {
      dialog,
      appSetting: store.appSetting,
      pos,
      lastMove,
      maxSize,
      flip,
      displayPV,
      close,
      goBegin,
      goEnd,
      goBack,
      goForward,
      doFlip,
      Icon,
    };
  },
});
</script>

<style scoped>
.board {
  margin-left: auto;
  margin-right: auto;
}
.control {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.control-row {
  width: 100%;
  height: 25%;
  margin: 0px;
  display: flex;
  flex-direction: row;
}
.control .control-item {
  width: 50%;
  height: 100%;
  margin: 0px;
  font-size: 100%;
  padding: 0 5% 0 5%;
}
.control.top .control-row:not(:last-child) {
  margin-bottom: 2%;
}
.control.top .control-item:not(:last-child) {
  margin-right: 2%;
}
.control .control-item .icon {
  height: 80%;
  width: auto;
  vertical-align: top;
}
.informations {
  height: 120px;
  width: 80vw;
  overflow-y: scroll;
  margin-left: auto;
  margin-right: auto;
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
.information {
  font-size: 14px;
  margin: 2px;
  text-align: left;
}
.move-element.selected {
  background-color: var(--text-bg-color-selected);
}
</style>
