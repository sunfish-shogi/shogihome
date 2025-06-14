import { RectSize } from "@/common/assets/geometry.js";
import { getPieceImageAssetName, pieceAssetTypes } from "@/common/assets/pieces.js";
import {
  BoardImageType,
  BoardLabelType,
  KingPieceType,
  PieceStandImageType,
  PromotionSelectorStyle,
} from "@/common/settings/app.js";
import preloadImage from "@/renderer/assets/preload.js";
import { Color, PieceType } from "tsshogi";

type PieceImages = {
  [color in Color]: {
    [pieceType in PieceType | "king2"]: string;
  };
};

export type Config = {
  boardImageType: BoardImageType;
  pieceStandImageType: PieceStandImageType;
  kingPieceType: KingPieceType;
  pieceImages: PieceImages;
  boardGridColor: string;
  boardTextureImage: string | null;
  pieceStandImage: string | null;
  boardImageOpacity: number;
  pieceStandImageOpacity: number;
  promotionSelectorStyle: PromotionSelectorStyle;
  boardLabelType: BoardLabelType;
  upperSizeLimit: RectSize;
  flip?: boolean;
  hideClock?: boolean;
};

export function newConfig(params: {
  boardImageType: BoardImageType;
  customBoardImageURL?: string;
  pieceStandImageType: PieceStandImageType;
  customPieceStandImageURL?: string;
  pieceImageURLTemplate: string;
  kingPieceType: KingPieceType;
  boardImageOpacity: number;
  pieceStandImageOpacity: number;
  promotionSelectorStyle: PromotionSelectorStyle;
  boardLabelType: BoardLabelType;
  upperSizeLimit: RectSize;
  flip?: boolean;
  hideClock?: boolean;
}): Config {
  const config = {
    boardImageType: params.boardImageType,
    pieceStandImageType: params.pieceStandImageType,
    kingPieceType: params.kingPieceType,
    pieceImages: getPieceTextureMap(params.pieceImageURLTemplate, params.kingPieceType),
    boardGridColor: getBoardGridColor(params.boardImageType),
    boardTextureImage: getBoardTextureURL(params.boardImageType, params.customBoardImageURL),
    pieceStandImage: getPieceStandTextureURL(
      params.pieceStandImageType,
      params.customPieceStandImageURL,
    ),
    boardImageOpacity: params.boardImageOpacity,
    pieceStandImageOpacity: params.pieceStandImageOpacity,
    promotionSelectorStyle: params.promotionSelectorStyle,
    boardLabelType: params.boardLabelType,
    upperSizeLimit: params.upperSizeLimit,
    flip: params.flip,
    hideClock: params.hideClock,
  };
  if (config.boardTextureImage) {
    preloadImage(config.boardTextureImage);
  }
  if (config.pieceStandImage) {
    preloadImage(config.pieceStandImage);
  }
  Object.values(config.pieceImages.black).forEach(preloadImage);
  Object.values(config.pieceImages.white).forEach(preloadImage);
  return config;
}

function getPieceStandTextureURL(type: PieceStandImageType, customURL?: string): string | null {
  switch (type) {
    case PieceStandImageType.DARK_WOOD:
      return "./stand/wood_dark.png";
    case PieceStandImageType.CUSTOM_IMAGE:
      return customURL || null;
  }
  return null;
}

function getPieceTextureMap(template: string, kingPieceType: KingPieceType): PieceImages {
  const black: { [key: string]: string } = {};
  const white: { [key: string]: string } = {};
  for (const type of pieceAssetTypes) {
    black[type] = template.replaceAll("${piece}", getPieceImageAssetName(Color.BLACK, type));
    white[type] = template.replaceAll("${piece}", getPieceImageAssetName(Color.WHITE, type));
  }
  const m = {
    black,
    white,
  } as PieceImages;
  if (kingPieceType === KingPieceType.GYOKU_AND_GYOKU) {
    m.black.king = m.black.king2;
    m.white.king = m.white.king2;
  }
  return m;
}

function getBoardGridColor(type: BoardImageType): string {
  switch (type) {
    default:
      return "black";
    case BoardImageType.DARK:
      return "white";
  }
}

function getBoardTextureURL(type: BoardImageType, customURL?: string): string | null {
  switch (type) {
    case BoardImageType.LIGHT:
      return "./board/wood_light.png";
    case BoardImageType.LIGHT2:
      return "./board/wood_light2.png";
    case BoardImageType.LIGHT3:
      return "./board/wood_light3.png";
    case BoardImageType.WARM:
      return "./board/wood_warm.png";
    case BoardImageType.WARM2:
      return "./board/wood_warm2.png";
    case BoardImageType.CUSTOM_IMAGE:
      return customURL || null;
  }
  return null;
}
