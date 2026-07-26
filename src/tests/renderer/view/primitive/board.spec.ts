import { shallowMount } from "@vue/test-utils";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import { ImmutablePosition, Position, PositionChange, Square } from "tsshogi";
import { RectSize } from "@/common/assets/geometry.js";
import {
  BoardImageType,
  BoardLabelType,
  KingPieceType,
  PieceStandImageType,
} from "@/common/settings/app.js";

const mountEditable = (position: ImmutablePosition) =>
  shallowMount(BoardView, {
    props: {
      boardImageType: BoardImageType.LIGHT,
      pieceStandImageType: PieceStandImageType.STANDARD,
      pieceImageUrlTemplate: "./piece/hitomoji/${piece}.png",
      kingPieceType: KingPieceType.GYOKU_AND_OSHO,
      boardLabelType: BoardLabelType.STANDARD,
      maxSize: new RectSize(800, 600),
      position,
      allowEdit: true,
    },
  });

describe("BoardView", () => {
  it("hitomoji", () => {
    const position = new Position();
    const wrapper = shallowMount(BoardView, {
      props: {
        boardImageType: BoardImageType.LIGHT,
        pieceStandImageType: PieceStandImageType.STANDARD,
        pieceImageUrlTemplate: "./piece/hitomoji/${piece}.png",
        kingPieceType: KingPieceType.GYOKU_AND_OSHO,
        boardLabelType: BoardLabelType.STANDARD,
        maxSize: new RectSize(800, 600),
        position,
      },
    });
    const imgs = wrapper.findAll("img");
    expect(imgs.filter((img) => img.attributes()["src"] === "./board/wood_light.png")).toHaveLength(
      1,
    );
    expect(
      imgs.filter((img) => img.attributes()["src"] === "./piece/hitomoji/white_bishop.png"),
    ).toHaveLength(1);
    expect(
      imgs.filter((img) => img.attributes()["src"] === "./piece/hitomoji/black_rook.png"),
    ).toHaveLength(1);
    expect(
      imgs.filter((img) => img.attributes()["src"] === "./piece/hitomoji/black_gold.png"),
    ).toHaveLength(2);
    expect(
      imgs.filter((img) => img.attributes()["src"] === "./piece/hitomoji_gothic/black_gold.png"),
    ).toHaveLength(0);
  });

  describe("局面編集", () => {
    // 2つのマスを順番にクリックして emit される変更の列を取得する。
    const editSquares = async (position: ImmutablePosition, from: Square, to: Square) => {
      const wrapper = mountEditable(position);
      const squares = wrapper.find(".board.operation").findAll("div");
      await squares[from.index].trigger("click");
      await squares[to.index].trigger("click");
      const events = wrapper.emitted("edit") as [PositionChange[]][];
      expect(events).toHaveLength(1);
      return events[0][0];
    };

    it("移動先に駒がある場合は移動する駒の側の駒台へ移す", async () => {
      const position = new Position();
      const changes = await editSquares(position, new Square(8, 8), new Square(8, 3));
      expect(changes).toEqual([
        { move: { from: new Square(8, 3), to: "black" } },
        { move: { from: new Square(8, 8), to: new Square(8, 3) } },
      ]);
      const edited = position.clone();
      for (const change of changes) {
        expect(edited.edit(change)).toBeTruthy();
      }
      expect(edited.sfen).toBe("lnsgkgsnl/1r5b1/pBppppppp/9/9/9/PPPPPPPPP/7R1/LNSGKGSNL b P 1");
    });

    it("移動先に同じ側の駒がある場合も駒台へ移す", async () => {
      const position = new Position();
      const changes = await editSquares(position, new Square(8, 8), new Square(7, 7));
      expect(changes).toEqual([
        { move: { from: new Square(7, 7), to: "black" } },
        { move: { from: new Square(8, 8), to: new Square(7, 7) } },
      ]);
    });

    it("移動先が玉の場合は入れ替える", async () => {
      const position = new Position();
      const changes = await editSquares(position, new Square(8, 8), new Square(5, 1));
      expect(changes).toEqual([{ move: { from: new Square(8, 8), to: new Square(5, 1) } }]);
    });

    it("移動先が空のマスの場合は移動のみ", async () => {
      const position = new Position();
      const changes = await editSquares(position, new Square(8, 8), new Square(5, 5));
      expect(changes).toEqual([{ move: { from: new Square(8, 8), to: new Square(5, 5) } }]);
    });
  });
});
