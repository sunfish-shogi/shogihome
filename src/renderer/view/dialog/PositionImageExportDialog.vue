<template>
  <DialogFrame @cancel="onClose">
    <div class="row">
      <div ref="board" class="board" :class="appSettings.positionImageStyle">
        <div v-if="appSettings.positionImageStyle === PositionImageStyle.BOOK" class="book">
          <SimpleBoardView
            :max-size="maxSize"
            :position="store.record.position"
            :black-name="blackName"
            :white-name="whiteName"
            :hide-white-hand="
              appSettings.positionImageHandLabelType === PositionImageHandLabelType.TSUME_SHOGI
            "
            :header="header"
            :footer="store.record.current.comment"
            :last-move="lastMove"
            :typeface="appSettings.positionImageTypeface"
            :font-weight="fontWeight"
            :text-shadow="textShadow"
            :character-y="appSettings.positionImageCharacterY"
            :font-scale="appSettings.positionImageFontScale"
          />
        </div>
        <div v-else class="game">
          <BoardView
            :board-image-type="appSettings.boardImage"
            :custom-board-image-url="appSettings.boardImageFileURL"
            :board-grid-color="appSettings.boardGridColor || undefined"
            :piece-stand-image-type="appSettings.pieceStandImage"
            :custom-piece-stand-image-url="appSettings.pieceStandImageFileURL"
            :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
            :king-piece-type="appSettings.kingPieceType"
            :board-label-type="appSettings.boardLabelType"
            :max-size="maxSize"
            :position="store.record.position"
            :last-move="lastMove"
            :flip="appSettings.boardFlipping"
            :hide-clock="true"
            :black-player-name="blackPlayerName"
            :white-player-name="whitePlayerName"
          />
        </div>
      </div>
      <div
        v-if="appSettings.positionImageStyle === PositionImageStyle.BOOK"
        class="side-controls column"
      >
        <div class="form-item">
          <div>
            {{ t.typeface }}
            <HorizontalSelector
              :value="appSettings.positionImageTypeface"
              :items="[
                { value: PositionImageTypeface.GOTHIC, label: t.gothic },
                { value: PositionImageTypeface.MINCHO, label: t.mincho },
              ]"
              @update:value="changeTypeface"
            />
          </div>
          <div>
            {{ t.vertical }}
            <input
              class="number"
              type="number"
              min="-100"
              max="100"
              :value="appSettings.positionImageCharacterY"
              @change="changeCharacterY"
            />
          </div>
          <div>
            {{ t.size }}
            <input
              class="number"
              type="number"
              min="0"
              max="200"
              :value="Math.round(appSettings.positionImageFontScale * 100)"
              @change="changeFontScale"
            />
            <span class="form-item-small-label">%</span>
          </div>
          <div>
            {{ t.weight }}
            <HorizontalSelector
              :value="String(appSettings.positionImageFontWeight)"
              :items="[
                { value: PositionImageFontWeight.W400, label: t.thin },
                { value: PositionImageFontWeight.W400X, label: t.bold },
                { value: PositionImageFontWeight.W700X, label: t.extraBold },
              ]"
              @update:value="(v) => changeFontWeight(v as PositionImageFontWeight)"
            />
          </div>
        </div>
        <div class="form-item">
          {{ t.handLabel }}
          <HorizontalSelector
            :value="appSettings.positionImageHandLabelType"
            :items="[
              { value: PositionImageHandLabelType.PLAYER_NAME, label: t.playerName },
              { value: PositionImageHandLabelType.SENTE_GOTE, label: '「先手｜後手」' },
              { value: PositionImageHandLabelType.MOCHIGOMA, label: '「持駒」' },
              { value: PositionImageHandLabelType.TSUME_SHOGI, label: t.tsumeShogi },
              { value: PositionImageHandLabelType.NONE, label: t.none },
            ]"
            @update:value="changeHandLabel"
          />
        </div>
        <div class="form-item">
          {{ t.header }}
          <input
            class="header"
            :value="appSettings.positionImageHeader"
            :placeholder="t.typeCustomTitleHere"
            @input="changeHeaderText"
          />
          <ToggleButton
            :value="appSettings.useBookmarkAsPositionImageHeader"
            :label="t.useBookmarkAsHeader"
            @update:value="changeWhetherToUseBookmark"
          />
        </div>
      </div>
    </div>
    <div>
      <div class="form-item center">
        <HorizontalSelector
          :value="appSettings.positionImageStyle"
          :items="[
            { value: PositionImageStyle.BOOK, label: t.bookStyle },
            { value: PositionImageStyle.GAME, label: t.gameStyle },
          ]"
          @update:value="changeType"
        />
        <input
          class="number"
          type="number"
          min="400"
          max="2000"
          :value="appSettings.positionImageSize"
          @input="changeSize"
        />
        <span class="form-item-small-label">px</span>
      </div>
    </div>
    <div class="main-buttons">
      <button autofocus data-hotkey="Enter" @click="saveAsPNG">
        <Icon :icon="IconType.SAVE" />
        <span>PNG</span>
      </button>
      <button data-hotkey="Enter" @click="saveAsJPEG">
        <Icon :icon="IconType.SAVE" />
        <span>JPEG</span>
      </button>
      <button data-hotkey="Escape" @click="onClose">
        <Icon :icon="IconType.CLOSE" />
        <span>{{ t.close }}</span>
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { t } from "@/common/i18n";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import SimpleBoardView from "@/renderer/view/primitive/SimpleBoardView.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { useAppSettings } from "@/renderer/store/settings";
import { Rect, RectSize } from "@/common/assets/geometry";
import {
  Color,
  Move,
  formatMove,
  getBlackPlayerName,
  getBlackPlayerNamePreferShort,
  getWhitePlayerName,
  getWhitePlayerNamePreferShort,
} from "tsshogi";
import { useStore } from "@/renderer/store";
import { IconType } from "@/renderer/assets/icons";
import api from "@/renderer/ipc/api";
import { Lazy } from "@/renderer/helpers/lazy";
import {
  PositionImageHandLabelType,
  PositionImageStyle,
  PositionImageTypeface,
  getPieceImageURLTemplate,
} from "@/common/settings/app";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { readInputAsNumber } from "@/renderer/helpers/form";
import { useErrorStore } from "@/renderer/store/error";
import DialogFrame from "./DialogFrame.vue";
import { PositionImageFontWeight } from "@/common/settings/layout";

const lazyUpdateDelay = 100;
const windowMarginHor = 150;
const windowMarginVer = 200;
const frameMargin = 2; // 境界部分の丸めによる周囲の映り込みを防ぐ
const aspectRatio = 16 / 9;

const store = useStore();
const appSettings = useAppSettings();
const blackPlayerName = computed(() => getBlackPlayerName(store.record.metadata) || t.sente);
const whitePlayerName = computed(() => getWhitePlayerName(store.record.metadata) || t.gote);
const lastMove = computed(() => {
  const record = store.record;
  return record.current.move instanceof Move ? record.current.move : null;
});
const board = ref();
const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));
const zoom = ref(window.devicePixelRatio);

const windowLazyUpdate = new Lazy();
const updateSize = () => {
  windowLazyUpdate.after(() => {
    windowSize.width = window.innerWidth;
    windowSize.height = window.innerHeight;
  }, lazyUpdateDelay);
  zoom.value = window.devicePixelRatio;
};

onMounted(() => {
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSize);
});

const fontWeight = computed(() => {
  switch (appSettings.positionImageFontWeight) {
    default:
      return 400;
    case PositionImageFontWeight.W700X:
      return 700;
  }
});

const textShadow = computed(() => {
  switch (appSettings.positionImageFontWeight) {
    default:
      return false;
    case PositionImageFontWeight.W400X:
    case PositionImageFontWeight.W700X:
      return true;
  }
});

const maxSize = computed(() => {
  const height = appSettings.positionImageSize / zoom.value - frameMargin * 2;
  const width = height * aspectRatio + frameMargin * 2;
  const maxWidth = windowSize.width - windowMarginHor;
  const maxHeight = windowSize.height - windowMarginVer;
  return new RectSize(Math.min(width, maxWidth), Math.min(height, maxHeight));
});

const header = computed(() => {
  const record = store.record;
  return (
    (appSettings.useBookmarkAsPositionImageHeader && record.current.bookmark) ||
    appSettings.positionImageHeader ||
    (lastMove.value
      ? `${record.current.ply}手目 ${formatMove(record.position, lastMove.value)}まで`
      : record.current.nextColor === Color.BLACK
        ? "先手番"
        : "後手番")
  );
});

const blackName = computed(() => {
  const record = store.record;
  switch (appSettings.positionImageHandLabelType) {
    case PositionImageHandLabelType.PLAYER_NAME:
      return getBlackPlayerNamePreferShort(record.metadata) || "先手";
    case PositionImageHandLabelType.SENTE_GOTE:
      return "先手";
    case PositionImageHandLabelType.MOCHIGOMA:
    case PositionImageHandLabelType.TSUME_SHOGI:
      return "持駒";
    default:
      return undefined;
  }
});

const whiteName = computed(() => {
  const record = store.record;
  switch (appSettings.positionImageHandLabelType) {
    case PositionImageHandLabelType.PLAYER_NAME:
      return getWhitePlayerNamePreferShort(record.metadata) || "後手";
    case PositionImageHandLabelType.SENTE_GOTE:
      return "後手";
    case PositionImageHandLabelType.MOCHIGOMA:
      return "持駒";
    default:
      return undefined;
  }
});

const changeSize = (e: Event) => {
  const elem = e.target as HTMLInputElement;
  appSettings.updateAppSettings({
    positionImageSize: parseInt(elem.value) || 400,
  });
};

const changeTypeface = (value: string) => {
  appSettings.updateAppSettings({ positionImageTypeface: value as PositionImageTypeface });
};

const changeHandLabel = (value: string) => {
  appSettings.updateAppSettings({
    positionImageHandLabelType: value as PositionImageHandLabelType,
  });
};

const changeHeaderText = (e: Event) => {
  const elem = e.target as HTMLInputElement;
  appSettings.updateAppSettings({
    positionImageHeader: elem.value,
  });
};

const changeWhetherToUseBookmark = (value: boolean) => {
  appSettings.updateAppSettings({
    useBookmarkAsPositionImageHeader: value,
  });
};

const changeCharacterY = (e: Event) => {
  appSettings.updateAppSettings({
    positionImageCharacterY: readInputAsNumber(e.target as HTMLInputElement),
  });
};

const changeFontScale = (e: Event) => {
  appSettings.updateAppSettings({
    positionImageFontScale: readInputAsNumber(e.target as HTMLInputElement) / 100,
  });
};

const changeFontWeight = (value: PositionImageFontWeight) => {
  appSettings.updateAppSettings({
    positionImageFontWeight: value,
  });
};

const changeType = (value: string) => {
  appSettings.updateAppSettings({ positionImageStyle: value as PositionImageStyle });
};

const getRect = () => {
  const elem = board.value as HTMLElement;
  const domRect = elem.getBoundingClientRect();
  return new Rect(
    domRect.x + frameMargin,
    domRect.y + frameMargin,
    domRect.width - frameMargin * 2,
    domRect.height - frameMargin * 2,
  );
};

const saveAsPNG = () => {
  api.exportCaptureAsPNG(getRect()).catch((e) => {
    useErrorStore().add(e);
  });
};

const saveAsJPEG = () => {
  api.exportCaptureAsJPEG(getRect()).catch((e) => {
    useErrorStore().add(e);
  });
};

const onClose = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.board {
  padding: 5px;
  margin: auto;
}
.board.game {
  background-color: var(--main-bg-color);
}
.board.book {
  background-color: white;
}
.side-controls {
  margin-left: 10px;
  width: 300px;
}
.side-controls > .form-item {
  display: flex;
  flex-direction: column;
}
.side-controls > .form-item > :not(:first-child) {
  margin-top: 5px;
}
.form-item > * {
  vertical-align: middle;
}
input.number {
  width: 50px;
  text-align: right;
}
input.header {
  width: 100%;
}
</style>
