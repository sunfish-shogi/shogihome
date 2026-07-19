import {
  getProblemPositionKey,
  nextMoveCollectionFormat,
  nextMoveCollectionVersion,
  NextMoveCollection,
  normalizeProblemSFEN,
  parseNextMoveCollection,
  serializeNextMoveCollection,
} from "@/common/nextmove/collection.js";

const validCollection: NextMoveCollection = {
  format: nextMoveCollectionFormat,
  version: nextMoveCollectionVersion,
  metadata: {
    title: "テスト問題集",
    createdAt: "2026-07-11T10:30:00+09:00",
    engine: { name: "Test Engine", multiPV: 3, maxSecondsPerPosition: 10 },
  },
  problems: [
    {
      sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      candidates: [
        { usi: "2g2f", score: 50, depth: 20, accepted: true, pv: ["2g2f", "8c8d"] },
        { usi: "7g7f", score: 30, depth: 20, accepted: false, pv: ["7g7f", "3c3d"] },
      ],
      actualMove: { usi: "9g9f", score: -100, scoreSource: "research" },
      analysis: { scoreBeforeMove: 40, scoreAfterMove: -120 },
      source: { path: "/path/to/file.kif", ply: 1, blackPlayer: "先手", whitePlayer: "後手" },
    },
  ],
};

const problemWithPreviousMove = {
  sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
  candidates: [{ usi: "8c8d", score: -20, accepted: true }],
  actualMove: { usi: "9c9d", score: 100 },
  previousMove: {
    usi: "7g7f",
    sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
  },
};

describe("common/nextmove/collection", () => {
  it("normalizeProblemSFEN", () => {
    expect(
      normalizeProblemSFEN("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 42"),
    ).toBe("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1");
  });

  it("getProblemPositionKey", () => {
    const key1 = getProblemPositionKey(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 42",
    );
    const key2 = getProblemPositionKey(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
    expect(key1).toBe(key2);
    expect(key1).toBe("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b -");
  });

  it("serialize/parse", () => {
    const json = serializeNextMoveCollection(validCollection);
    const parsed = parseNextMoveCollection(json);
    expect(parsed).toStrictEqual(validCollection);
  });

  it("parse/invalidJSON", () => {
    expect(() => parseNextMoveCollection("{invalid")).toThrow("JSON として解釈できませんでした。");
  });

  it("parse/invalidFormat", () => {
    expect(() => parseNextMoveCollection(JSON.stringify({ format: "unknown" }))).toThrow(
      "次の一手問題集ではありません。",
    );
  });

  it("parse/unsupportedVersion", () => {
    const json = JSON.stringify({ ...validCollection, version: 2 });
    expect(() => parseNextMoveCollection(json)).toThrow("未対応のバージョンです: 2");
  });

  it("parse/invalidSFEN", () => {
    const json = JSON.stringify({
      ...validCollection,
      problems: [{ ...validCollection.problems[0], sfen: "invalid sfen" }],
    });
    expect(() => parseNextMoveCollection(json)).toThrow("不正な SFEN です");
  });

  it("parse/invalidCandidateMove", () => {
    const json = JSON.stringify({
      ...validCollection,
      problems: [
        {
          ...validCollection.problems[0],
          candidates: [{ usi: "2h2f" }], // 飛車は2六へ移動できるが2七に歩があるため不正
        },
      ],
    });
    expect(() => parseNextMoveCollection(json)).toThrow("不正な指し手です");
  });

  it("parse/invalidActualMove", () => {
    const json = JSON.stringify({
      ...validCollection,
      problems: [
        {
          ...validCollection.problems[0],
          actualMove: { usi: "xxxx" },
        },
      ],
    });
    expect(() => parseNextMoveCollection(json)).toThrow("不正な指し手です");
  });

  it("parse/emptyCandidates", () => {
    const json = JSON.stringify({
      ...validCollection,
      problems: [{ ...validCollection.problems[0], candidates: [] }],
    });
    expect(() => parseNextMoveCollection(json)).toThrow("candidates がありません。");
  });

  it("parse/nullProblem", () => {
    const json = JSON.stringify({
      ...validCollection,
      problems: [null],
    });
    expect(() => parseNextMoveCollection(json)).toThrow("不正な問題データです。");
  });

  it("parse/nullCandidate", () => {
    const json = JSON.stringify({
      ...validCollection,
      problems: [{ ...validCollection.problems[0], candidates: [null] }],
    });
    expect(() => parseNextMoveCollection(json)).toThrow("不正な指し手です");
  });

  it("parse/previousMove", () => {
    const json = JSON.stringify({ ...validCollection, problems: [problemWithPreviousMove] });
    const parsed = parseNextMoveCollection(json);
    expect(parsed.problems[0].previousMove).toStrictEqual(problemWithPreviousMove.previousMove);
  });

  it("parse/invalidPreviousMove", () => {
    const json = JSON.stringify({
      ...validCollection,
      problems: [
        {
          ...problemWithPreviousMove,
          previousMove: { ...problemWithPreviousMove.previousMove, usi: "xxxx" },
        },
      ],
    });
    expect(() => parseNextMoveCollection(json)).toThrow("不正な指し手です");
  });

  it("parse/inconsistentPreviousMove", () => {
    // 直前の指し手を進めても出題局面と一致しない場合はエラーとする。
    const json = JSON.stringify({
      ...validCollection,
      problems: [
        {
          ...problemWithPreviousMove,
          previousMove: { ...problemWithPreviousMove.previousMove, usi: "2g2f" },
        },
      ],
    });
    expect(() => parseNextMoveCollection(json)).toThrow(
      "指し手を進めた局面が出題局面と一致しません。",
    );
  });

  it("parse/unknownFieldsIgnored", () => {
    const data = JSON.parse(serializeNextMoveCollection(validCollection));
    data.unknownField = "value";
    data.problems[0].unknownField = 123;
    const parsed = parseNextMoveCollection(JSON.stringify(data));
    expect(parsed.problems).toHaveLength(1);
  });
});
