<template>
  <div>
    <dialog ref="dialog">
      <div class="row">
        <div ref="board" class="board" :class="appSetting.positionImageStyle">
          <div v-if="appSetting.positionImageStyle === PositionImageStyle.BOOK" class="book">
            <SimpleBoardView
              :max-size="maxSize"
              :position="store.record.position"
              :black-name="blackName"
              :white-name="whiteName"
              :hide-white-hand="
                appSetting.positionImageHandLabelType === PositionImageHandLabelType.TSUME_SHOGI
              "
              :header="header"
              :footer="store.record.current.comment"
              :last-move="lastMove"
              :typeface="appSetting.positionImageTypeface"
              :font-weight="fontWeight"
              :text-shadow="textShadow"
              :character-y="appSetting.positionImageCharacterY"
              :font-scale="appSetting.positionImageFontScale"
            />
          </div>
          <div v-else class="game">
            <BoardView
              :board-image-type="appSetting.boardImage"
              :piece-stand-image-type="appSetting.pieceStandImage"
              :board-label-type="appSetting.boardLabelType"
              :piece-image-url-template="getPieceImageURLTemplate(appSetting)"
              :king-piece-type="appSetting.kingPieceType"
              :custom-board-image-url="appSetting.boardImageFileURL"
              :custom-piece-stand-image-url="appSetting.pieceStandImageFileURL"
              :max-size="maxSize"
              :position="store.record.position"
              :last-move="lastMove"
              :flip="appSetting.boardFlipping"
              :hide-clock="true"
              :black-player-name="blackPlayerName"
              :white-player-name="whitePlayerName"
            />
          </div>
        </div>
        <div
          v-if="appSetting.positionImageStyle === PositionImageStyle.BOOK"
          class="side-controls column"
        >
          <div class="form-item">
            <div>
              {{ t.typeface }}
              <HorizontalSelector
                :value="appSetting.positionImageTypeface"
                :items="[
                  { value: PositionImageTypeface.GOTHIC, label: t.gothic },
                  { value: PositionImageTypeface.MINCHO, label: t.mincho },
                ]"
                @change="changeTypeface"
              />
            </div>
            <div>
              {{ t.vertical }}
              <input
                class="number"
                type="number"
                min="-100"
                max="100"
                :value="appSetting.positionImageCharacterY"
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
                :value="Math.round(appSetting.positionImageFontScale * 100)"
                @change="changeFontScale"
              />
              <span class="form-item-small-label">%</span>
            </div>
            <div>
              {{ t.weight }}
              <HorizontalSelector
                :value="String(appSetting.positionImageFontWeight)"
                :items="[
                  { value: PositionImageFontWeight.W400, label: t.thin },
                  { value: PositionImageFontWeight.W400X, label: t.bold },
                  { value: PositionImageFontWeight.W700X, label: t.extraBold },
                ]"
                @change="(v) => changeFontWeight(v as PositionImageFontWeight)"
              />
            </div>
          </div>
          <div class="form-item">
            {{ t.handLabel }}
            <HorizontalSelector
              :value="appSetting.positionImageHandLabelType"
              :items="[
                { value: PositionImageHandLabelType.PLAYER_NAME, label: t.playerName },
                { value: PositionImageHandLabelType.SENTE_GOTE, label: '「先手｜後手」' },
                { value: PositionImageHandLabelType.MOCHIGOMA, label: '「持駒」' },
                { value: PositionImageHandLabelType.TSUME_SHOGI, label: t.tsumeShogi },
                { value: PositionImageHandLabelType.NONE, label: t.none },
              ]"
              @change="changeHandLabel"
            />
          </div>
          <div class="form-item">
            {{ t.header }}
            <input
              class="header"
              :value="appSetting.positionImageHeader"
              :placeholder="t.typeCustomTitleHere"
              @input="changeHeaderText"
            />
            <ToggleButton
              :value="appSetting.useBookmarkAsPositionImageHeader"
              :label="t.useBookmarkAsHeader"
              @change="changeWhetherToUseBookmark"
            />
          </div>
        </div>
      </div>
      <div>
        <div class="form-item center">
          <HorizontalSelector
            :value="appSetting.positionImageStyle"
            :items="[
              { value: PositionImageStyle.BOOK, label: t.bookStyle },
              { value: PositionImageStyle.GAME, label: t.gameStyle },
            ]"
            @change="changeType"
          />
          <input
            class="number"
            type="number"
            min="400"
            max="2000"
            :value="appSetting.positionImageSize"
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
        <button autofocus data-hotkey="Enter" @click="saveAsJPEG">
          <Icon :icon="IconType.SAVE" />
          <span>JPEG</span>
        </button>
        <button autofocus data-hotkey="Escape" @click="onClose">
          <Icon :icon="IconType.CLOSE" />
          <span>{{ t.close }}</span>
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { t } from "@/common/i18n";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import SimpleBoardView from "@/renderer/view/primitive/SimpleBoardView.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useAppSetting } from "@/renderer/store/setting";
import { Rect, RectSize } from "@/common/assets/geometry";
import {
  Color,
  Move,
  formatMove,
  getBlackPlayerName,
  getBlackPlayerNamePreferShort,
  getWhitePlayerName,
  getWhitePlayerNamePreferShort,
} from "electron-shogi-core";
import { useStore } from "@/renderer/store";
import { IconType } from "@/renderer/assets/icons";
import api from "@/renderer/ipc/api";
import { Lazy } from "@/renderer/helpers/lazy";
import {
  PositionImageHandLabelType,
  PositionImageStyle,
  PositionImageTypeface,
  PositionImageFontWeight,
  getPieceImageURLTemplate,
} from "@/common/settings/app";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { readInputAsNumber } from "@/renderer/helpers/form";

const lazyUpdateDelay = 100;
const marginHor = 150;
const marginVer = 200;
const aspectRatio = 16 / 9;

const store = useStore();
const appSetting = useAppSetting();
const blackPlayerName = computed(() => getBlackPlayerName(store.record.metadata) || t.sente);
const whitePlayerName = computed(() => getWhitePlayerName(store.record.metadata) || t.gote);
const lastMove = computed(() => {
  const record = store.record;
  return record.current.move instanceof Move ? record.current.move : null;
});
const dialog = ref();
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
  showModalDialog(dialog.value, onClose);
  installHotKeyForDialog(dialog.value);
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
  window.removeEventListener("resize", updateSize);
});

const fontWeight = computed(() => {
  switch (appSetting.positionImageFontWeight) {
    default:
      return 400;
    case PositionImageFontWeight.W700X:
      return 700;
  }
});

const textShadow = computed(() => {
  switch (appSetting.positionImageFontWeight) {
    default:
      return false;
    case PositionImageFontWeight.W400X:
    case PositionImageFontWeight.W700X:
      return true;
  }
});

const maxSize = computed(() => {
  const height = appSetting.positionImageSize / zoom.value;
  const width = height * aspectRatio;
  const maxWidth = windowSize.width - marginHor;
  const maxHeight = windowSize.height - marginVer;
  return new RectSize(Math.min(width, maxWidth), Math.min(height, maxHeight));
});

const header = computed(() => {
  const record = store.record;
  return (
    (appSetting.useBookmarkAsPositionImageHeader && record.current.bookmark) ||
    appSetting.positionImageHeader ||
    (lastMove.value
      ? `${record.current.ply}手目 ${formatMove(record.position, lastMove.value)}まで`
      : record.current.nextColor === Color.BLACK
        ? "先手番"
        : "後手番")
  );
});

const blackName = computed(() => {
  const record = store.record;
  switch (appSetting.positionImageHandLabelType) {
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
  switch (appSetting.positionImageHandLabelType) {
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
  appSetting.updateAppSetting({
    positionImageSize: parseInt(elem.value) || 400,
  });
};

const changeTypeface = (value: string) => {
  appSetting.updateAppSetting({ positionImageTypeface: value as PositionImageTypeface });
};

const changeHandLabel = (value: string) => {
  appSetting.updateAppSetting({ positionImageHandLabelType: value as PositionImageHandLabelType });
};

const changeHeaderText = (e: Event) => {
  const elem = e.target as HTMLInputElement;
  appSetting.updateAppSetting({
    positionImageHeader: elem.value,
  });
};

const changeWhetherToUseBookmark = (value: boolean) => {
  appSetting.updateAppSetting({
    useBookmarkAsPositionImageHeader: value,
  });
};

const changeCharacterY = (e: Event) => {
  appSetting.updateAppSetting({
    positionImageCharacterY: readInputAsNumber(e.target as HTMLInputElement),
  });
};

const changeFontScale = (e: Event) => {
  appSetting.updateAppSetting({
    positionImageFontScale: readInputAsNumber(e.target as HTMLInputElement) / 100,
  });
};

const changeFontWeight = (value: PositionImageFontWeight) => {
  appSetting.updateAppSetting({
    positionImageFontWeight: value,
  });
};

const changeType = (value: string) => {
  appSetting.updateAppSetting({ positionImageStyle: value as PositionImageStyle });
};

const getRect = () => {
  const elem = board.value as HTMLElement;
  const domRect = elem.getBoundingClientRect();
  return new Rect(domRect.x, domRect.y, domRect.width, domRect.height);
};

const saveAsPNG = () => {
  api.exportCaptureAsPNG(getRect()).catch((e) => {
    store.pushError(e);
  });
};

const saveAsJPEG = () => {
  api.exportCaptureAsJPEG(getRect()).catch((e) => {
    store.pushError(e);
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
