import { NextMoveProblem } from "./collection.js";

/** 出題時の解答の判定結果。 */
export type NextMoveQuizJudgement =
  | "best" // 最善手
  | "accepted" // 最善手以外の正解
  | "actual" // 実戦で指された手 (不正解)
  | "incorrect"; // その他の不正解

/** 出題時に表示する選択肢 (ヒント) の 1 つ。 */
export type NextMoveQuizChoice = {
  usi: string; // 指し手 (USI 形式)
  correct: boolean; // 正解として扱う手かどうか
};

/** 選択肢の最大数 */
const maxChoiceCount = 4;

/**
 * 解答の手 (USI 形式) を判定します。
 */
export function judgeNextMoveQuizAnswer(
  problem: NextMoveProblem,
  usi: string,
): NextMoveQuizJudgement {
  const index = problem.candidates.findIndex((candidate) => candidate.usi === usi);
  if (index === 0) {
    // 先頭の候補手 (最善手) は常に正解として扱う。
    return "best";
  }
  if (index > 0 && problem.candidates[index].accepted) {
    return "accepted";
  }
  if (problem.actualMove.usi === usi) {
    return "actual";
  }
  return "incorrect";
}

/**
 * 判定結果が正解かどうかを返します。
 */
export function isCorrectNextMoveQuizJudgement(judgement: NextMoveQuizJudgement): boolean {
  return judgement === "best" || judgement === "accepted";
}

/**
 * 出題時に表示する選択肢 (ヒント) を作成します。
 *
 * - 最善手と実戦の手は必ず含める。
 * - 実戦の手と異なる不正解の候補手がわかっていれば 3 つ目の選択肢として加える。
 * - 正解と不正解が半々になる場合に限り、最善手以外の正解手を 4 つ目の選択肢として加える。
 * - 並び順から正解がわからないようにシャッフルする。
 *
 * 正解と不正解を 1 つずつ以上含められない問題では空配列を返します。
 */
export function buildNextMoveQuizChoices(
  problem: NextMoveProblem,
  random: () => number = Math.random,
): NextMoveQuizChoice[] {
  const correct: NextMoveQuizChoice[] = [];
  const incorrect: NextMoveQuizChoice[] = [];
  const used = new Set<string>();
  const add = (usi: string) => {
    if (used.has(usi)) {
      return;
    }
    used.add(usi);
    const choice = {
      usi,
      correct: isCorrectNextMoveQuizJudgement(judgeNextMoveQuizAnswer(problem, usi)),
    };
    (choice.correct ? correct : incorrect).push(choice);
  };
  const findCandidate = (accepted: boolean) =>
    problem.candidates.find(
      (candidate, index) =>
        index > 0 && !!candidate.accepted === accepted && !used.has(candidate.usi),
    );
  if (problem.candidates.length) {
    add(problem.candidates[0].usi);
  }
  add(problem.actualMove.usi);
  // 実戦の手以外の不正解手がわかっていれば選択肢に加える。
  const otherIncorrect = used.size < maxChoiceCount && findCandidate(false);
  if (otherIncorrect) {
    add(otherIncorrect.usi);
  }
  // 不正解の方が多い場合は、不正解が 50% になるように正解手を加える。
  const otherAccepted =
    used.size < maxChoiceCount && incorrect.length > correct.length && findCandidate(true);
  if (otherAccepted) {
    add(otherAccepted.usi);
  }
  // 正解と不正解を 1 つずつ以上含められない場合は選択肢を表示しない。
  if (!correct.length || !incorrect.length) {
    return [];
  }
  // 並び順で正解がわかってしまわないようにシャッフルする。
  const choices = [...correct, ...incorrect];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}
