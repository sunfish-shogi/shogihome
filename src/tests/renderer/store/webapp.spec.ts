import { createStore } from "@/renderer/store/index.js";
import { Move } from "tsshogi";

describe("store/webapp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("withUSENParam", () => {
    vi.stubGlobal("window", {
      location: {
        toString: () =>
          "http://localhost/?usen=~0.7ku2jm6y20e45t2.&branch=0&ply=2&bname=bbb&wname=www",
      },
    });
    const store = createStore();
    expect(store.isRecordFileUnsaved).toBeFalsy();
    expect(store.record.getUSI({ allMoves: true })).toBe(
      "position startpos moves 7g7f 3c3d 2g2f 4a3b 2f2e",
    );
    expect(store.record.moves).toHaveLength(6);
    expect(store.record.current.ply).toBe(2);
  });

  it("pcWeb/withoutLocalStorage", () => {
    vi.stubGlobal("window", {
      location: {
        toString: () => "http://localhost/",
      },
      history: {
        replaceState: vi.fn(),
      },
    });
    const store = createStore();
    store.doMove(store.record.position.createMoveByUSI("5g5f") as Move);
    const store2 = createStore();
    expect(store2.record.getUSI({ allMoves: true })).toBe("position startpos");
  });

  it("mobileWeb/localStorage", () => {
    vi.stubGlobal("window", {
      location: {
        toString: () => "http://localhost/?mobile",
      },
      history: {
        replaceState: vi.fn(),
      },
    });
    const store = createStore();
    store.doMove(store.record.position.createMoveByUSI("5g5f") as Move);
    const store2 = createStore();
    expect(store2.record.getUSI({ allMoves: true })).toBe("position startpos moves 5g5f");
  });
});
