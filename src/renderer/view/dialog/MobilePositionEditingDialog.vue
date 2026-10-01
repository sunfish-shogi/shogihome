<template>
  <dialog ref="dialog" class="mobile-position-editing" :class="{ landscape }">
    <div class="board-area">
      <BoardView
        :ghost-teleport-target="ghostTeleportTarget"
        :layout-type="layoutType"
        :board-image-type="appSettings.boardImage"
        :custom-board-image-url="
          appSettings.boardImageFileURL && fileURLToCustomSchemeURL(appSettings.boardImageFileURL)
        "
        :board-image-opacity="appSettings.enableTransparent ? appSettings.boardOpacity : 1"
        :custom-board-color="appSettings.boardColor"
        :board-grid-color="appSettings.boardGridColor || undefined"
        :piece-stand-image-type="appSettings.pieceStandImage"
        :custom-piece-stand-color="appSettings.pieceStandColor"
        :custom-piece-stand-image-url="
          appSettings.pieceStandImageFileURL &&
          fileURLToCustomSchemeURL(appSettings.pieceStandImageFileURL)
        "
        :piece-stand-image-opacity="
          appSettings.enableTransparent ? appSettings.pieceStandOpacity : 1
        "
        :hand-piece-order="appSettings.handPieceOrder"
        :board-label-type="appSettings.boardLabelType"
        :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
        :king-piece-type="appSettings.kingPieceType"
        :max-size="boardMaxSize"
        :position="position"
        :flip="appSettings.boardFlipping"
        :mobile="true"
        :allow-edit="true"
        :allow-move="false"
        :enable-drag-and-drop="appSettings.enableDragAndDrop"
        :hide-clock="true"
        :drop-shadows="false"
        :black-player-name="t.sente"
        :white-player-name="t.gote"
        @edit="edit"
      />
    </div>
    <div class="side">
      <div class="header">
        <button class="tool-button close cancel" :aria-label="t.cancel" @click="onCancel">
          <Icon :icon="IconType.CLOSE" />
          <span class="label">{{ t.cancel }}</span>
        </button>
        <button class="tool-button ok" @click="onOk">
          <Icon :icon="IconType.CHECK" />
          <span class="label">{{ t.ok }}</span>
        </button>
      </div>
      <div class="tools">
        <button
          v-for="tool of tools"
          :key="tool.label"
          class="tool-button"
          :disabled="tool.disabled"
          @click="tool.onClick"
        >
          <Icon :icon="tool.icon" />
          <span class="label">{{ tool.label }}</span>
        </button>
      </div>
    </div>
    <InitialPositionMenu
      v-if="isInitialPositionMenuVisible"
      @select="onSelectPreset"
      @close="isInitialPositionMenuVisible = false"
    />
  </dialog>
</template>

<script setup lang="ts">
// モバイル向けの局面編集ダイアログ。
//
// スマートフォンの縦画面でも盤を大きく表示できるよう、PC 版のダイアログから操作を厳選している。
// 置くのは「初期化・手番変更」「元に戻す・やり直す」「コピー・貼り付け」の 6 つだけで、
// 駒の枚数変更は使用頻度の割に場所を取るため置かない。
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry";
import { BoardLayoutType } from "@/common/settings/layout";
import { getPieceImageURLTemplate } from "@/common/settings/app";
import { fileURLToCustomSchemeURL } from "@/common/url";
import { useStore } from "@/renderer/store";
import { useAppSettings } from "@/renderer/store/settings";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { isIOS } from "@/renderer/helpers/env";
import { IconType } from "@/renderer/assets/icons";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import InitialPositionMenu from "@/renderer/view/menu/InitialPositionMenu.vue";
import { usePositionEditor } from "./position_editing";

// 1 段 (42px + 余白)
const headerHeight = 45;
// 3 列 2 段 (42px × 2 + 隙間・余白)
const toolsHeight = 93;
const sideWidth = 180;

// iOS の多くのバージョンでは safe-area-inset-bottom が 21px になる。
// それ以外の環境もマージンを持たせる。(MobileLayout と同じ値)
const safeAreaMarginY = isIOS() ? 21 : 10;

const store = useStore();
const appSettings = useAppSettings();

const dialog = ref<HTMLDialogElement>();
// ネイティブ <dialog> はトップレイヤーに描画されるため、ドラッグ中の駒ゴーストも
// body ではなくこのダイアログの中へテレポートしないとダイアログの背面に隠れてしまう。
const ghostTeleportTarget = computed(() => dialog.value ?? "body");

const { position, canUndo, canRedo, undo, redo, edit, changeTurn, setSFEN, copySFEN, paste } =
  usePositionEditor(store.record.position);
const isInitialPositionMenuVisible = ref(false);

const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));
const updateSize = () => {
  windowSize.width = window.innerWidth;
  windowSize.height = window.innerHeight;
};

// 横画面では盤の右側に操作を縦に並べ、縦画面では盤の上下に置く。
const landscape = computed(() => windowSize.width > windowSize.height);

const boardMaxSize = computed(() => {
  const height = windowSize.height - safeAreaMarginY;
  if (landscape.value) {
    return new RectSize(windowSize.width - sideWidth, height);
  }
  return new RectSize(windowSize.width, height - headerHeight - toolsHeight);
});

const layoutType = computed(() => {
  const size = boardMaxSize.value;
  if (landscape.value) {
    return size.width < size.height * 1.77 ? BoardLayoutType.PORTRAIT : BoardLayoutType.COMPACT;
  }
  return size.height >= size.width ? BoardLayoutType.PORTRAIT_SQUARE : BoardLayoutType.COMPACT;
});

const tools = computed(() => [
  {
    icon: IconType.REFRESH,
    label: t.initializePosition,
    disabled: false,
    onClick: () => {
      isInitialPositionMenuVisible.value = true;
    },
  },
  { icon: IconType.SWAP, label: t.changeTurn, disabled: false, onClick: changeTurn },
  { icon: IconType.UNDO, label: t.undo, disabled: !canUndo.value, onClick: undo },
  { icon: IconType.REDO, label: t.redo, disabled: !canRedo.value, onClick: redo },
  { icon: IconType.COPY, label: t.copy, disabled: false, onClick: copySFEN },
  { icon: IconType.PASTE, label: t.paste, disabled: false, onClick: paste },
]);

const onSelectPreset = (sfen: string) => {
  setSFEN(sfen);
  isInitialPositionMenuVisible.value = false;
};

const onOk = () => {
  store.closePositionEditingDialog(position.value);
};

const onCancel = () => {
  store.closePositionEditingDialog();
};

onMounted(() => {
  showModalDialog(dialog.value!, onCancel);
  installHotKeyForDialog(dialog.value!);
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value!);
  window.removeEventListener("resize", updateSize);
});
</script>

<style scoped>
dialog.mobile-position-editing {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  margin: 0;
  padding: 0;
  border: none;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  user-select: none;
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
dialog.mobile-position-editing.landscape {
  flex-direction: row;
  justify-content: center;
}
.board-area {
  display: flex;
  justify-content: center;
}
/* 縦画面ではヘッダーを盤の上、ツールを盤の下に置く。 */
dialog:not(.landscape) .board-area {
  order: 1;
}
dialog:not(.landscape) .side {
  display: contents;
}
dialog:not(.landscape) .header {
  order: 0;
}
dialog:not(.landscape) .tools {
  order: 2;
}
.landscape .board-area {
  align-items: flex-start;
}
.landscape .side {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
/* キャンセル / OK はツールと同じ見た目のボタンにする。
   縦画面ではすぐ下に後手の駒台が横に広がるため、誤操作を避けるようにキャンセルはアイコンだけの
   小さなボタンにして左端 (駒台ではなく対局者名の上) に置き、OK はツールの右の列に揃える。 */
.header {
  display: grid;
  grid-template-columns: 48px 1fr calc((100% - 6px) / 3);
  grid-template-rows: 42px;
  gap: 3px;
  padding: 3px 4px 0 4px;
  box-sizing: border-box;
}
.header .ok {
  grid-column: 3;
}
dialog:not(.landscape) .header .cancel .label {
  display: none;
}
.landscape .header {
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: 52px;
}
.landscape .header .ok {
  grid-column: auto;
}
/* 縦画面では横幅を確保するため 3 列 2 段に並べる。
   ボタンは対になるもの (初期化/手番変更, 元に戻す/やり直す, コピー/貼り付け) を縦に揃える。 */
.tools {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 42px);
  grid-auto-flow: column;
  gap: 3px;
  padding: 3px 4px;
  box-sizing: border-box;
}
.tool-button {
  min-width: 0;
  margin: 0;
  padding: 2px 4px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.tool-button .icon {
  flex-shrink: 0;
  height: 22px;
  width: 22px;
}
.tool-button .label {
  min-width: 0;
  font-size: 13px;
  line-height: 1.15;
  text-align: left;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
/* 横画面では盤の右側に 2 列で並べる。 */
.landscape .tools {
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: none;
  grid-auto-rows: 52px;
  grid-auto-flow: row;
}
.landscape .tool-button {
  padding: 2px;
  flex-direction: column;
  gap: 2px;
}
.landscape .tool-button .icon {
  height: 24px;
  width: 24px;
}
.landscape .tool-button .label {
  max-width: 100%;
  font-size: 10px;
  text-align: center;
  display: block;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
