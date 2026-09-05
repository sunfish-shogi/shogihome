import { buildNextMoveQuizChoices, judgeNextMoveQuizAnswer } from "@/common/nextmove/quiz.js";
import { NextMoveProblem } from "@/common/nextmove/collection.js";

const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

// シャッフルを打ち消してソートせずに比較できるようにする。
const noShuffle = () => 0.9999999;

describe("common/nextmove/quiz", () => {
  describe("judgeNextMoveQuizAnswer", () => {
    const problem: NextMoveProblem = {
      sfen,
      candidates: [
        { usi: "2g2f", accepted: true },
        { usi: "7g7f", accepted: true },
        { usi: "5g5f", accepted: false },
      ],
      actualMove: { usi: "9g9f" },
    };

    it("judge", () => {
      expect(judgeNextMoveQuizAnswer(problem, "2g2f")).toBe("best");
      expect(judgeNextMoveQuizAnswer(problem, "7g7f")).toBe("accepted");
      expect(judgeNextMoveQuizAnswer(problem, "5g5f")).toBe("incorrect");
      expect(judgeNextMoveQuizAnswer(problem, "9g9f")).toBe("actual");
      expect(judgeNextMoveQuizAnswer(problem, "1g1f")).toBe("incorrect");
    });
  });

  describe("buildNextMoveQuizChoices", () => {
    it("bestAndActualOnly", () => {
      // 実戦の手以外の不正解手がない場合は最善手と実戦の手の 2 択になる。
      const choices = buildNextMoveQuizChoices(
        {
          sfen,
          candidates: [{ usi: "2g2f", accepted: true }],
          actualMove: { usi: "9g9f" },
        },
        noShuffle,
      );
      expect(choices).toEqual([
        { usi: "2g2f", correct: true },
        { usi: "9g9f", correct: false },
      ]);
    });

    it("withOtherIncorrect", () => {
      // 実戦の手と異なる不正解手がわかっていれば 3 つ目の選択肢を出す。
      // 最善手以外の正解手がないため 4 つ目は出せない。
      const choices = buildNextMoveQuizChoices(
        {
          sfen,
          candidates: [
            { usi: "2g2f", accepted: true },
            { usi: "5g5f", accepted: false },
            { usi: "1g1f", accepted: false },
          ],
          actualMove: { usi: "9g9f" },
        },
        noShuffle,
      );
      expect(choices).toEqual([
        { usi: "2g2f", correct: true },
        { usi: "9g9f", correct: false },
        { usi: "5g5f", correct: false },
      ]);
    });

    it("withOtherIncorrectAndAccepted", () => {
      // 正解が複数ある場合は 4 つ目の選択肢を出し、不正解を 50% にする。
      const choices = buildNextMoveQuizChoices(
        {
          sfen,
          candidates: [
            { usi: "2g2f", accepted: true },
            { usi: "7g7f", accepted: true },
            { usi: "5g5f", accepted: false },
            { usi: "1g1f", accepted: false },
          ],
          actualMove: { usi: "9g9f" },
        },
        noShuffle,
      );
      expect(choices).toEqual([
        { usi: "2g2f", correct: true },
        { usi: "7g7f", correct: true },
        { usi: "9g9f", correct: false },
        { usi: "5g5f", correct: false },
      ]);
    });

    it("noOtherIncorrect/multipleAccepted", () => {
      // 3 つ目 (不正解) を出せない場合は 4 つ目 (正解) も出さず、2 択に留める。
      const choices = buildNextMoveQuizChoices(
        {
          sfen,
          candidates: [
            { usi: "2g2f", accepted: true },
            { usi: "7g7f", accepted: true },
          ],
          actualMove: { usi: "9g9f" },
        },
        noShuffle,
      );
      expect(choices).toEqual([
        { usi: "2g2f", correct: true },
        { usi: "9g9f", correct: false },
      ]);
    });

    it("actualMoveIsAccepted", () => {
      // 実戦の手が正解に含まれる場合でも不正解を 1 つ以上含める。
      const choices = buildNextMoveQuizChoices(
        {
          sfen,
          candidates: [
            { usi: "2g2f", accepted: true },
            { usi: "9g9f", accepted: true },
            { usi: "5g5f", accepted: false },
          ],
          actualMove: { usi: "9g9f" },
        },
        noShuffle,
      );
      expect(choices).toEqual([
        { usi: "2g2f", correct: true },
        { usi: "9g9f", correct: true },
        { usi: "5g5f", correct: false },
      ]);
    });

    it("noIncorrect", () => {
      // 不正解を含められない場合は選択肢を表示しない。
      expect(
        buildNextMoveQuizChoices(
          {
            sfen,
            candidates: [
              { usi: "2g2f", accepted: true },
              { usi: "9g9f", accepted: true },
            ],
            actualMove: { usi: "9g9f" },
          },
          noShuffle,
        ),
      ).toEqual([]);
    });

    it("shuffle", () => {
      const problem: NextMoveProblem = {
        sfen,
        candidates: [
          { usi: "2g2f", accepted: true },
          { usi: "7g7f", accepted: true },
          { usi: "5g5f", accepted: false },
        ],
        actualMove: { usi: "9g9f" },
      };
      // 並び順から正解がわからないように、先頭が最善手になるとは限らない。
      const orders = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const choices = buildNextMoveQuizChoices(problem);
        // 選択肢の集合は常に同じで、正解と不正解が半々になる。
        expect(choices).toHaveLength(4);
        expect([...choices].map((choice) => choice.usi).sort()).toEqual([
          "2g2f",
          "5g5f",
          "7g7f",
          "9g9f",
        ]);
        expect(choices.filter((choice) => choice.correct)).toHaveLength(2);
        orders.add(choices.map((choice) => choice.usi).join(","));
      }
      expect(orders.size).toBeGreaterThan(1);
    });
  });
});
