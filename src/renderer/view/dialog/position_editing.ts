import { computed, ref } from "vue";
import {
  exportBOD,
  importKIF,
  ImmutablePosition,
  Position,
  PositionChange,
  Record,
  reverseColor,
} from "tsshogi";
import { t } from "@/common/i18n";
import { useErrorStore } from "@/renderer/store/error";

// 局面編集ダイアログ (PC 版・モバイル版) で共通の編集操作と履歴 (Undo/Redo) を提供する。
export function usePositionEditor(initialPosition: ImmutablePosition) {
  const position = ref(initialPosition.clone() as Position);
  const history = ref([position.value.sfen]);
  const historyIndex = ref(0);
  const canUndo = computed(() => historyIndex.value > 0);
  const canRedo = computed(() => historyIndex.value < history.value.length - 1);

  const commitPosition = (newPosition: Position) => {
    history.value = [...history.value.slice(0, historyIndex.value + 1), newPosition.sfen];
    historyIndex.value = history.value.length - 1;
    position.value = newPosition;
  };

  const undo = () => {
    if (!canUndo.value) {
      return;
    }
    historyIndex.value--;
    position.value = Position.newBySFEN(history.value[historyIndex.value]) as Position;
  };

  const redo = () => {
    if (!canRedo.value) {
      return;
    }
    historyIndex.value++;
    position.value = Position.newBySFEN(history.value[historyIndex.value]) as Position;
  };

  const edit = (changes: PositionChange[]) => {
    const cloned = position.value.clone();
    for (const change of changes) {
      cloned.edit(change);
    }
    commitPosition(cloned);
  };

  const changeTurn = () => {
    const cloned = position.value.clone();
    cloned.setColor(reverseColor(cloned.color));
    commitPosition(cloned);
  };

  const setSFEN = (sfen: string) => {
    const newPosition = Position.newBySFEN(sfen);
    if (newPosition) {
      commitPosition(newPosition);
    }
  };

  const copySFEN = () => {
    navigator.clipboard.writeText(position.value.sfen);
  };

  const copyBOD = () => {
    navigator.clipboard.writeText(exportBOD(new Record(position.value)));
  };

  const paste = async () => {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      return;
    }
    if (Position.isValidSFEN(text)) {
      commitPosition(Position.newBySFEN(text) as Position);
      return;
    }
    const record = importKIF(text);
    if (!(record instanceof Error)) {
      commitPosition(record.position.clone());
      return;
    }
    useErrorStore().add(new Error(t.failedToDetectRecordFormat));
  };

  return {
    position,
    canUndo,
    canRedo,
    commitPosition,
    undo,
    redo,
    edit,
    changeTurn,
    setSFEN,
    copySFEN,
    copyBOD,
    paste,
  };
}
