import { Color, PieceType, Position } from "tsshogi";
import { RectSize } from "@/common/assets/geometry.js";
import {
  BoardImageType,
  BoardLabelType,
  HandPieceOrder,
  KingPieceType,
  PieceStandImageType,
  PromotionSelectorStyle,
} from "@/common/settings/app.js";
import { newConfig } from "@/renderer/view/primitive/board/config";
import { HandLayoutBuilder } from "@/renderer/view/primitive/board/hand";

const buildConfig = (handPieceOrder: HandPieceOrder, flip?: boolean) => {
  return newConfig({
    boardImageType: BoardImageType.LIGHT,
    pieceStandImageType: PieceStandImageType.STANDARD,
    handPieceOrder,
    pieceImageURLTemplate: "./piece/hitomoji/${piece}.png",
    kingPieceType: KingPieceType.GYOKU_AND_OSHO,
    boardImageOpacity: 1,
    pieceStandImageOpacity: 1,
    promotionSelectorStyle: PromotionSelectorStyle.HORIZONTAL,
    boardLabelType: BoardLabelType.STANDARD,
    upperSizeLimit: new RectSize(800, 600),
    flip,
  });
};

// 全ての持ち駒を先手が持つ局面
const position = Position.newBySFEN("4k4/9/9/9/9/9/9/9/4K4 b RB2G2S2N2L18P 1") as Position;
const hand = position.hand(Color.BLACK);

const centerX = (builder: HandLayoutBuilder, type: PieceType) => {
  return builder.centerOfPieceType(hand, Color.BLACK, type).x;
};

describe("HandLayoutBuilder", () => {
  it("strongerToLeft", () => {
    // デフォルトでは飛・金・桂が対局者から見て左（先手の駒台では画面左）に並ぶ。
    const builder = new HandLayoutBuilder(buildConfig(HandPieceOrder.STRONGER_TO_LEFT), 1);
    expect(centerX(builder, PieceType.ROOK)).toBeLessThan(centerX(builder, PieceType.BISHOP));
    expect(centerX(builder, PieceType.GOLD)).toBeLessThan(centerX(builder, PieceType.SILVER));
    expect(centerX(builder, PieceType.KNIGHT)).toBeLessThan(centerX(builder, PieceType.LANCE));
  });

  it("strongerToRight", () => {
    const builder = new HandLayoutBuilder(buildConfig(HandPieceOrder.STRONGER_TO_RIGHT), 1);
    expect(centerX(builder, PieceType.ROOK)).toBeGreaterThan(centerX(builder, PieceType.BISHOP));
    expect(centerX(builder, PieceType.GOLD)).toBeGreaterThan(centerX(builder, PieceType.SILVER));
    expect(centerX(builder, PieceType.KNIGHT)).toBeGreaterThan(centerX(builder, PieceType.LANCE));
  });

  it("strongerToLeft/flip", () => {
    // 盤面反転時は先手の駒台が後手の位置（画面上部）に表示されるため左右が入れ替わる。
    const builder = new HandLayoutBuilder(buildConfig(HandPieceOrder.STRONGER_TO_LEFT, true), 1);
    expect(centerX(builder, PieceType.ROOK)).toBeGreaterThan(centerX(builder, PieceType.BISHOP));
    expect(centerX(builder, PieceType.GOLD)).toBeGreaterThan(centerX(builder, PieceType.SILVER));
    expect(centerX(builder, PieceType.KNIGHT)).toBeGreaterThan(centerX(builder, PieceType.LANCE));
  });

  it("pawn position is not affected", () => {
    const left = new HandLayoutBuilder(buildConfig(HandPieceOrder.STRONGER_TO_LEFT), 1);
    const right = new HandLayoutBuilder(buildConfig(HandPieceOrder.STRONGER_TO_RIGHT), 1);
    expect(centerX(left, PieceType.PAWN)).toBe(centerX(right, PieceType.PAWN));
  });
});
