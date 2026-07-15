import { mount } from "@vue/test-utils";
import { ImmutableNode, Record } from "tsshogi";
import RecordBranchTree from "@/renderer/view/primitive/RecordBranchTree.vue";

function append(record: Record, usi: string): void {
  const move = record.position.createMoveByUSI(usi);
  if (!move || !record.append(move)) {
    throw new Error(`failed to append move: ${usi}`);
  }
}

describe("RecordBranchTree", () => {
  it("renders nodes and arcs", () => {
    const record = new Record();
    append(record, "7g7f");
    append(record, "3c3d");
    append(record, "2g2f");
    record.goto(2);
    append(record, "6g6f");
    const wrapper = mount(RecordBranchTree, {
      props: { record },
    });
    expect(wrapper.findAll("circle.node")).toHaveLength(5);
    expect(wrapper.findAll("circle.node.current")).toHaveLength(1);
    expect(wrapper.findAll("circle.node.active")).toHaveLength(4);
    expect(wrapper.findAll("line.arc")).toHaveLength(4);
    expect(wrapper.findAll("line.arc.active")).toHaveLength(3);
  });

  it("shows tooltip on hover", async () => {
    const record = new Record();
    append(record, "7g7f");
    record.current.comment = "これはコメントです。";
    record.current.bookmark = "序盤";
    record.current.setElapsedMs(12000);
    const wrapper = mount(RecordBranchTree, {
      props: { record },
    });
    expect(wrapper.find(".tooltip").exists()).toBeFalsy();
    const hitAreas = wrapper.findAll("circle.hit-area");
    await hitAreas[1].trigger("mouseenter");
    const tooltip = wrapper.find(".tooltip");
    expect(tooltip.exists()).toBeTruthy();
    expect(tooltip.find(".tooltip-move").text()).toContain("７六歩");
    expect(tooltip.find(".tooltip-time").text()).toContain("0:12");
    expect(tooltip.find(".tooltip-bookmark").text()).toBe("序盤");
    expect(tooltip.find(".tooltip-comment").text()).toBe("これはコメントです。");
    const emitted = wrapper.emitted("hoverNode");
    expect(emitted).toHaveLength(1);
    await hitAreas[1].trigger("mouseleave");
    expect(wrapper.find(".tooltip").exists()).toBeFalsy();
    expect(wrapper.emitted("hoverNode")).toHaveLength(2);
  });

  it("marks nodes that have a comment or a bookmark", () => {
    const record = new Record();
    append(record, "7g7f");
    record.current.comment = "コメント";
    append(record, "3c3d");
    record.current.bookmark = "しおり";
    append(record, "2g2f");
    const wrapper = mount(RecordBranchTree, {
      props: { record },
    });
    expect(wrapper.findAll("polygon.comment-mark")).toHaveLength(1);
    expect(wrapper.findAll("polygon.bookmark-mark")).toHaveLength(1);
  });

  it("hides time and comment for the first node tooltip", async () => {
    const record = new Record();
    append(record, "7g7f");
    const wrapper = mount(RecordBranchTree, {
      props: { record },
    });
    const hitAreas = wrapper.findAll("circle.hit-area");
    await hitAreas[0].trigger("mouseenter");
    const tooltip = wrapper.find(".tooltip");
    expect(tooltip.exists()).toBeTruthy();
    expect(tooltip.find(".tooltip-move").text()).toBe("開始局面");
    expect(tooltip.find(".tooltip-time").exists()).toBeFalsy();
    expect(tooltip.find(".tooltip-comment").exists()).toBeFalsy();
  });

  it("emits clickNode on hit area click", async () => {
    const record = new Record();
    append(record, "7g7f");
    const wrapper = mount(RecordBranchTree, {
      props: { record },
    });
    const hitAreas = wrapper.findAll("circle.hit-area");
    expect(hitAreas).toHaveLength(2);
    await hitAreas[1].trigger("click");
    const emitted = wrapper.emitted("clickNode");
    expect(emitted).toHaveLength(1);
    // NOTE: props を経由すると reactive proxy になるため手数で比較する。
    expect((emitted?.[0][0] as ImmutableNode).ply).toBe(1);
  });
});
