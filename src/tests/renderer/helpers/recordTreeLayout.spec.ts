import { Record } from "tsshogi";
import { buildRecordTreeLayout } from "@/renderer/helpers/recordTreeLayout.js";

function append(record: Record, usi: string): void {
  const move = record.position.createMoveByUSI(usi);
  if (!move || !record.append(move)) {
    throw new Error(`failed to append move: ${usi}`);
  }
}

describe("helpers/recordTreeLayout", () => {
  it("empty record", () => {
    const record = new Record();
    const layout = buildRecordTreeLayout(record);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]).toMatchObject({ ply: 0, lane: 0, onActiveLine: true, current: true });
    expect(layout.edges).toHaveLength(0);
    expect(layout.laneCount).toBe(1);
    expect(layout.maxPly).toBe(0);
  });

  it("single line without branches", () => {
    const record = new Record();
    append(record, "7g7f");
    append(record, "3c3d");
    append(record, "2g2f");
    const layout = buildRecordTreeLayout(record);
    expect(layout.nodes).toHaveLength(4);
    expect(layout.nodes.every((node) => node.lane === 0)).toBeTruthy();
    expect(layout.nodes.every((node) => node.onActiveLine)).toBeTruthy();
    expect(layout.nodes.filter((node) => node.current).map((node) => node.ply)).toStrictEqual([3]);
    expect(layout.edges).toHaveLength(3);
    expect(layout.edges.every((edge) => edge.onActiveLine)).toBeTruthy();
    expect(layout.laneCount).toBe(1);
    expect(layout.maxPly).toBe(3);
  });

  it("single branch", () => {
    const record = new Record();
    append(record, "7g7f");
    append(record, "3c3d");
    append(record, "2g2f");
    record.goto(2);
    append(record, "6g6f"); // 3手目の分岐 (アクティブになる)
    const layout = buildRecordTreeLayout(record);
    expect(layout.nodes).toHaveLength(5);
    const mainLine = layout.nodes.filter((node) => node.lane === 0);
    expect(mainLine.map((node) => node.ply)).toStrictEqual([0, 1, 2, 3]);
    const branchLine = layout.nodes.filter((node) => node.lane === 1);
    expect(branchLine.map((node) => node.ply)).toStrictEqual([3]);
    expect(branchLine[0].node.displayText).toBe("☗６六歩");
    expect(branchLine[0].onActiveLine).toBeTruthy();
    expect(branchLine[0].current).toBeTruthy();
    // 本譜の3手目はアクティブでない
    const mainPly3 = mainLine.find((node) => node.ply === 3);
    expect(mainPly3?.onActiveLine).toBeFalsy();
    // 分岐アークは (ply=2, lane=0) から (ply=3, lane=1) へ伸びる
    const branchArc = layout.edges.find((edge) => edge.to.lane === 1);
    expect(branchArc).toMatchObject({
      from: { ply: 2, lane: 0 },
      to: { ply: 3, lane: 1 },
      onActiveLine: true,
    });
    // 本譜の 2->3 のアークはアクティブでない
    const mainArc = layout.edges.find((edge) => edge.from.ply === 2 && edge.to.lane === 0);
    expect(mainArc?.onActiveLine).toBeFalsy();
    expect(layout.edges).toHaveLength(4);
    expect(layout.laneCount).toBe(2);
    expect(layout.maxPly).toBe(3);
  });

  it("nested branch", () => {
    const record = new Record();
    append(record, "7g7f");
    append(record, "3c3d");
    append(record, "2g2f");
    append(record, "8c8d");
    record.goto(2);
    append(record, "6g6f"); // 3手目の分岐
    append(record, "8c8d");
    record.goto(3);
    append(record, "4c4d"); // 分岐の中の4手目の分岐
    const layout = buildRecordTreeLayout(record);
    // 分岐ラインはレーン1、その中の分岐はレーン2に配置される
    expect(layout.nodes.filter((node) => node.lane === 1).map((node) => node.ply)).toStrictEqual([
      3, 4,
    ]);
    const nested = layout.nodes.filter((node) => node.lane === 2);
    expect(nested.map((node) => node.ply)).toStrictEqual([4]);
    expect(nested[0].node.displayText).toBe("☖４四歩");
    expect(nested[0].current).toBeTruthy();
    expect(layout.laneCount).toBe(3);
    expect(layout.maxPly).toBe(4);
  });

  it("multiple branches on the same node", () => {
    const record = new Record();
    append(record, "7g7f");
    append(record, "3c3d");
    append(record, "2g2f");
    record.goto(2);
    append(record, "6g6f");
    record.goto(2);
    append(record, "5g5f");
    const layout = buildRecordTreeLayout(record);
    // 分岐リストの並び順にレーンが割り当てられる
    const lane1 = layout.nodes.find((node) => node.lane === 1);
    const lane2 = layout.nodes.find((node) => node.lane === 2);
    expect(lane1?.node.displayText).toBe("☗６六歩");
    expect(lane2?.node.displayText).toBe("☗５六歩");
    expect(layout.laneCount).toBe(3);
  });

  it("branch longer than the active line", () => {
    const record = new Record();
    append(record, "7g7f");
    record.goto(0);
    append(record, "2g2f"); // 1手目の分岐
    append(record, "8c8d");
    append(record, "2f2e");
    record.goto(1);
    record.switchBranchByIndex(0); // 本譜に戻る
    const layout = buildRecordTreeLayout(record);
    expect(record.moves).toHaveLength(2);
    expect(layout.maxPly).toBe(3);
    expect(layout.nodes.filter((node) => node.lane === 1).map((node) => node.ply)).toStrictEqual([
      1, 2, 3,
    ]);
    expect(layout.nodes.filter((node) => node.lane === 1).some((node) => node.onActiveLine)).toBe(
      false,
    );
  });

  it("reuses a lane when intervals do not overlap", () => {
    const record = new Record();
    append(record, "7g7f");
    append(record, "3c3d");
    append(record, "2g2f");
    append(record, "8c8d");
    append(record, "2f2e");
    record.goto(1);
    append(record, "8c8d"); // 2手目の分岐 (末端は ply=2)
    record.goto(2);
    record.switchBranchByIndex(0); // 本譜に戻る
    record.goto(4);
    append(record, "6g6f"); // 5手目の分岐 (先頭は ply=5)
    const layout = buildRecordTreeLayout(record);
    // 2手目の分岐は [1, 2]、5手目の分岐は [4, 5] を占有するため、同じレーンを共有できる
    expect(layout.nodes.filter((node) => node.lane === 1).map((node) => node.ply)).toStrictEqual([
      5, 2,
    ]);
    expect(layout.laneCount).toBe(2);
  });

  it("does not reuse a lane when intervals overlap", () => {
    const record = new Record();
    append(record, "7g7f");
    append(record, "3c3d");
    append(record, "2g2f");
    append(record, "8c8d");
    record.goto(1);
    append(record, "8c8d"); // 2手目の分岐 (末端は ply=2)
    record.goto(2);
    record.switchBranchByIndex(0); // 本譜に戻る
    record.goto(2);
    append(record, "6g6f"); // 3手目の分岐 (アークの行 ply=2 で重なる)
    const layout = buildRecordTreeLayout(record);
    const lane1 = layout.nodes.filter((node) => node.lane === 1);
    const lane2 = layout.nodes.filter((node) => node.lane === 2);
    expect(lane1).toHaveLength(1);
    expect(lane2).toHaveLength(1);
    expect(layout.laneCount).toBe(3);
  });
});
