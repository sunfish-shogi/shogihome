import { mergeUpdatedEngine, planEngineListChange } from "@/renderer/helpers/enginePackage.js";
import { emptyUSIEngine, USIEngine } from "@/common/settings/usi.js";

const V1 = "/engines/sunfish4-lite@v1/engine.json";
const V2 = "/engines/sunfish4-lite@v2/engine.json";
const OTHER = "/engines/YaneuraOu";

describe("helpers/enginePackage", () => {
  it("新しくインストールした場合は追加する", () => {
    expect(planEngineListChange([OTHER], V1, [])).toEqual({ type: "add" });
  });

  it("同じ版が編集中の一覧にあれば変えない (修復)", () => {
    expect(planEngineListChange([OTHER, V1], V1, [])).toEqual({ type: "none" });
  });

  // 一覧から削除して保存せずに再ダウンロードした場合。保存済みの一覧に残っていても、
  // 編集中の一覧に無ければ追加する。
  it("編集中の一覧から削除した後の再ダウンロードは追加する", () => {
    expect(planEngineListChange([OTHER], V1, [])).toEqual({ type: "add" });
  });

  it("古い版が編集中の一覧にあれば新しい版へ向ける", () => {
    expect(planEngineListChange([OTHER, V1], V2, [V1])).toEqual({
      type: "update",
      oldEnginePaths: [V1],
    });
  });

  it("同じ版と古い版の両方が一覧にあれば変えない (修復)", () => {
    expect(planEngineListChange([OTHER, V1, V2], V2, [V1])).toEqual({ type: "none" });
  });

  it("古い版が手元にあっても編集中の一覧に無ければ追加する", () => {
    expect(planEngineListChange([OTHER], V2, [V1])).toEqual({ type: "add" });
  });

  it("mergeUpdatedEngine", () => {
    const local: USIEngine = {
      ...emptyUSIEngine(),
      uri: "es://usi-engine/local",
      name: "利用者が付けた名前",
      defaultName: "Sunfish4-Lite",
      author: "old author",
      path: V1,
      options: {
        // 新しい版にも残り、型も同じ。利用者の値を引き継ぐ。
        MaxDepth: { name: "MaxDepth", type: "spin", order: 100, default: 64, value: 5 },
        // 新しい版で削除された。
        Removed: { name: "Removed", type: "check", order: 101, default: "true" },
        // 新しい版で型が変わった。値は引き継がない。
        Style: { name: "Style", type: "string", order: 102, default: "a", value: "b" },
      },
      tags: ["自分で付けたタグ"],
    };
    const fresh: USIEngine = {
      ...emptyUSIEngine(),
      uri: "es://usi-engine/fresh",
      name: "Sunfish4-Lite v2",
      defaultName: "Sunfish4-Lite v2",
      author: "new author",
      path: V2,
      options: {
        MaxDepth: { name: "MaxDepth", type: "spin", order: 100, default: 32, max: 128 },
        Style: { name: "Style", type: "combo", order: 101, default: "x", vars: ["x", "y"] },
        Added: { name: "Added", type: "spin", order: 102, default: 1 },
      },
      tags: ["ダウンロード"],
    };
    const merged = mergeUpdatedEngine(local, fresh);
    expect(merged.uri).toBe("es://usi-engine/local");
    expect(merged.name).toBe("利用者が付けた名前");
    expect(merged.defaultName).toBe("Sunfish4-Lite v2");
    expect(merged.author).toBe("new author");
    expect(merged.path).toBe(V2);
    expect(merged.tags).toEqual(["自分で付けたタグ"]);
    expect(Object.keys(merged.options).sort()).toEqual(["Added", "MaxDepth", "Style"]);
    expect(merged.options.MaxDepth).toEqual({
      name: "MaxDepth",
      type: "spin",
      order: 100,
      default: 32,
      max: 128,
      value: 5,
    });
    expect(merged.options.Style).not.toHaveProperty("value");
    // 渡したものは書き換えない。
    expect(fresh.uri).toBe("es://usi-engine/fresh");
    expect(local.path).toBe(V1);
  });
});
