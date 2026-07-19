import { Color, ImmutablePosition, Move, Position, Record, RecordMetadataKey } from "tsshogi";
import { reactive, UnwrapNestedRefs } from "vue";
import api, { appInfo } from "@/renderer/ipc/api.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { MultiPV, USIEngine, USIMultiPV } from "@/common/settings/usi.js";
import {
  NextMoveGenerationSettings,
  validateNextMoveGenerationSettings,
} from "@/common/settings/nextmove.js";
import { detectBlunders, judgeProblemAdoption } from "@/common/nextmove/detect.js";
import {
  getProblemPositionKey,
  nextMoveCollectionFormat,
  nextMoveCollectionVersion,
  NextMoveCandidate,
  NextMoveCollection,
  NextMovePreviousMove,
  NextMoveProblem,
  normalizeProblemSFEN,
} from "@/common/nextmove/collection.js";
import {
  detectRecordFileFormatByPath,
  getStandardRecordFileFormats,
  importRecordFromBuffer,
  RecordFileFormat,
} from "@/common/file/record.js";
import { parseUSIPV, USIInfoCommand } from "@/common/game/usi.js";
import { TextDecodingRule } from "@/common/settings/app.js";
import { LogLevel } from "@/common/log.js";
import { useAppSettings } from "./settings.js";

export type NextMoveGenerationProgress = {
  totalFiles: number; // 対象ファイル数
  processedFiles: number; // 処理を終えたファイル数
  currentFile?: string; // 処理中のファイル
  blunderCount: number; // 検出した悪手候補の数
  researchedCount: number; // 再探索を終えた局面数
  adoptedCount: number; // 採用した問題数
};

export type NextMoveGenerationSummary = {
  totalFiles: number; // 対象ファイル数
  skippedFiles: number; // 読み込みに失敗したファイル数
  blunderCount: number; // 検出した悪手候補の数
  adoptedCount: number; // 採用した問題数
  aborted: boolean; // 中断されたかどうか
};

type ProgressCallback = (progress: NextMoveGenerationProgress) => void;
type FinishCallback = (collection: NextMoveCollection, summary: NextMoveGenerationSummary) => void;
type ErrorCallback = (e: unknown) => void;

export class NextMoveGenerationManager {
  private researcher?: USIPlayer;
  private settings?: NextMoveGenerationSettings;
  private aborted = false;
  private wakeUp?: () => void;
  private collectedInfo = new Map<number, USIInfoCommand>();
  private onProgress: ProgressCallback = () => {
    /* noop */
  };
  private onFinish: FinishCallback = () => {
    /* noop */
  };
  private onError: ErrorCallback = () => {
    /* noop */
  };

  on(event: "progress", handler: ProgressCallback): this;
  on(event: "finish", handler: FinishCallback): this;
  on(event: "error", handler: ErrorCallback): this;
  on(event: string, handler: unknown): this {
    switch (event) {
      case "progress":
        this.onProgress = handler as ProgressCallback;
        break;
      case "finish":
        this.onFinish = handler as FinishCallback;
        break;
      case "error":
        this.onError = handler as ErrorCallback;
        break;
    }
    return this;
  }

  async start(settings: NextMoveGenerationSettings): Promise<void> {
    const error = validateNextMoveGenerationSettings(settings);
    if (error) {
      throw error;
    }
    const files = await api.listRecordFiles({
      directory: settings.sourceDirectory,
      formats: getStandardRecordFileFormats(),
      subdirectories: true,
    });
    if (files.length === 0) {
      throw new Error("棋譜ファイルが見つかりませんでした。"); // TODO: i18n
    }
    await this.setupEngine(settings.usi as USIEngine, settings.multiPV);
    this.settings = settings;
    this.aborted = false;
    setTimeout(() => {
      this.run(files);
    });
  }

  stop(): void {
    this.aborted = true;
    this.wakeUp?.();
  }

  private async setupEngine(engine: USIEngine, multiPV: number): Promise<void> {
    if (this.researcher) {
      throw new Error(
        "NextMoveGenerationManager#setupEngine: 前回のエンジンが終了していません。数秒待ってからもう一度試してください。",
      );
    }
    const options = engine.options;
    if (options[USIMultiPV]?.type === "spin") {
      options[USIMultiPV].value = multiPV;
    } else if (options[MultiPV]?.type === "spin") {
      options[MultiPV].value = multiPV;
    } else {
      throw new Error("エンジンが MultiPV オプションに対応していません。"); // TODO: i18n
    }
    const appSettings = useAppSettings();
    // 定跡がヒットするとエンジンによる再探索が行われないため、定跡は使用しない。
    const researcher = new USIPlayer(
      { ...engine, options, extraBook: undefined },
      { timeoutSeconds: appSettings.engineTimeoutSeconds },
    );
    researcher.setUSIInfoCommandHandler((position, info) => {
      if (!info.pv?.length || (info.scoreCP === undefined && info.scoreMate === undefined)) {
        return;
      }
      this.collectedInfo.set(info.multipv || 1, info);
    });
    await researcher.launch();
    await researcher.readyNewGame();
    this.researcher = researcher;
  }

  private async closeEngine(): Promise<void> {
    if (this.researcher) {
      await this.researcher.close();
      this.researcher = undefined;
    }
  }

  private async run(files: string[]): Promise<void> {
    const settings = this.settings as NextMoveGenerationSettings;
    const appSettings = useAppSettings();
    const progress: NextMoveGenerationProgress = {
      totalFiles: files.length,
      processedFiles: 0,
      blunderCount: 0,
      researchedCount: 0,
      adoptedCount: 0,
    };
    let skippedFiles = 0;
    const problems: NextMoveProblem[] = [];
    const positionKeys = new Set<string>();
    try {
      for (const file of files) {
        if (this.aborted || problems.length >= settings.maxProblems) {
          break;
        }
        progress.currentFile = file;
        this.onProgress({ ...progress });
        const record = await this.loadRecord(file, appSettings.textDecodingRule);
        if (!record) {
          skippedFiles++;
          progress.processedFiles++;
          continue;
        }
        const blunders = detectBlunders(record, {
          winRateDropThreshold: settings.winRateDropThreshold,
          minWinRate: settings.minWinRate,
          coefficientInSigmoid: appSettings.coefficientInSigmoid,
          minPly: settings.minPly,
          maxPly: settings.maxPly,
          playerCriteria: settings.playerCriteria,
          playerName: settings.playerName,
        });
        progress.blunderCount += blunders.length;
        this.onProgress({ ...progress });
        for (const blunder of blunders) {
          if (this.aborted || problems.length >= settings.maxProblems) {
            break;
          }
          record.goto(blunder.ply);
          const actualMove = record.current.move;
          if (!(actualMove instanceof Move)) {
            continue;
          }
          // 出題時に盤面へ表示するため、出題局面に至る直前の指し手と
          // その指し手を指す前の局面を記録する。
          record.goto(blunder.ply - 1);
          const previousMove = record.current.move instanceof Move ? record.current.move : null;
          let previousMoveInfo: NextMovePreviousMove | undefined;
          if (previousMove) {
            record.goto(blunder.ply - 2);
            previousMoveInfo = {
              usi: previousMove.usi,
              sfen: normalizeProblemSFEN(record.position.sfen),
            };
            record.goto(blunder.ply - 1);
          }
          const position = record.position;
          const key = getProblemPositionKey(position.sfen);
          if (positionKeys.has(key)) {
            continue;
          }
          const candidates = await this.researchPosition(position, record.usi);
          progress.researchedCount++;
          if (this.aborted) {
            break;
          }
          const problem = this.buildProblem(
            record,
            file,
            position,
            actualMove,
            previousMoveInfo,
            blunder,
            candidates,
          );
          if (problem) {
            problems.push(problem);
            positionKeys.add(key);
            progress.adoptedCount++;
          }
          this.onProgress({ ...progress });
        }
        progress.processedFiles++;
        this.onProgress({ ...progress });
      }
    } catch (e) {
      this.aborted = true;
      this.onError(e);
    }
    // エンジンの終了を待ってから完了を通知する。待たずに通知すると、
    // 直後に開始された次回の生成が前回のエンジンの終了待ちでエラーになる。
    await this.closeEngine().catch((e) => {
      this.onError(e);
    });
    const collection = this.buildCollection(settings, problems);
    this.onFinish(collection, {
      totalFiles: files.length,
      skippedFiles,
      blunderCount: progress.blunderCount,
      adoptedCount: progress.adoptedCount,
      aborted: this.aborted,
    });
  }

  private async loadRecord(
    file: string,
    textDecodingRule: TextDecodingRule,
  ): Promise<Record | null> {
    try {
      const format = detectRecordFileFormatByPath(file) as RecordFileFormat;
      const data = await api.openRecord(file);
      const record = importRecordFromBuffer(data, format, {
        autoDetect: textDecodingRule === TextDecodingRule.AUTO_DETECT,
      });
      if (record instanceof Error) {
        throw record;
      }
      return record;
    } catch (e) {
      api.log(LogLevel.WARN, `次の一手問題集: 棋譜の読み込みに失敗しました: ${file}: ${e}`);
      return null;
    }
  }

  private async researchPosition(
    position: ImmutablePosition,
    usi: string,
  ): Promise<NextMoveCandidate[]> {
    const researcher = this.researcher as USIPlayer;
    this.collectedInfo = new Map();
    await researcher.startResearch(position, usi);
    await this.sleep((this.settings as NextMoveGenerationSettings).maxSecondsPerPosition * 1e3);
    // 次の局面の再探索が始まるまで無駄に探索を続けないように停止する。
    await researcher.stop();
    // 収集した情報のスナップショットを取り、順位でソートして候補手に変換する。
    const infos = [...this.collectedInfo.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, info]) => info);
    const sign = position.color === Color.BLACK ? 1 : -1;
    const candidates: NextMoveCandidate[] = [];
    for (const info of infos) {
      const pv = parseUSIPV(position, info.pv as string[]);
      if (pv.length === 0) {
        continue;
      }
      candidates.push({
        usi: pv[0].usi,
        score: info.scoreCP !== undefined ? info.scoreCP * sign : undefined,
        mate: info.scoreMate !== undefined ? info.scoreMate * sign : undefined,
        depth: info.depth,
        pv: pv.map((move) => move.usi),
      });
    }
    return candidates;
  }

  private buildProblem(
    record: Record,
    file: string,
    position: ImmutablePosition,
    actualMove: Move,
    previousMove: NextMovePreviousMove | undefined,
    blunder: { ply: number; scoreBeforeMove: number; scoreAfterMove: number },
    candidates: NextMoveCandidate[],
  ): NextMoveProblem | undefined {
    const settings = this.settings as NextMoveGenerationSettings;
    const actualCandidate = candidates.find((candidate) => candidate.usi === actualMove.usi);
    const result = judgeProblemAdoption({
      color: position.color,
      candidates,
      actualMove: actualCandidate || { usi: actualMove.usi, score: blunder.scoreAfterMove },
      criteria: {
        adoptionWinRateDiff: settings.adoptionWinRateDiff,
        acceptableWinRateDiff: settings.acceptableWinRateDiff,
        minWinRate: settings.minWinRate,
        coefficientInSigmoid: useAppSettings().coefficientInSigmoid,
      },
    });
    if (!result.adopted) {
      return;
    }
    const metadata = record.metadata;
    return {
      sfen: normalizeProblemSFEN(position.sfen),
      candidates: result.candidates,
      actualMove: actualCandidate
        ? {
            usi: actualMove.usi,
            score: actualCandidate.score,
            mate: actualCandidate.mate,
            scoreSource: "research",
          }
        : {
            usi: actualMove.usi,
            score: blunder.scoreAfterMove,
            scoreSource: "comment",
          },
      previousMove,
      analysis: {
        scoreBeforeMove: blunder.scoreBeforeMove,
        scoreAfterMove: blunder.scoreAfterMove,
      },
      source: {
        path: file,
        ply: blunder.ply,
        blackPlayer: metadata.getStandardMetadata(RecordMetadataKey.BLACK_NAME),
        whitePlayer: metadata.getStandardMetadata(RecordMetadataKey.WHITE_NAME),
        date:
          metadata.getStandardMetadata(RecordMetadataKey.DATE) ||
          metadata.getStandardMetadata(RecordMetadataKey.START_DATETIME),
      },
    };
  }

  private buildCollection(
    settings: NextMoveGenerationSettings,
    problems: NextMoveProblem[],
  ): NextMoveCollection {
    return {
      format: nextMoveCollectionFormat,
      version: nextMoveCollectionVersion,
      metadata: {
        createdAt: new Date().toISOString(),
        appVersion: appInfo.appVersion,
        engine: {
          name: settings.usi?.name,
          multiPV: settings.multiPV,
          maxSecondsPerPosition: settings.maxSecondsPerPosition,
        },
        criteria: {
          winRateDropThreshold: settings.winRateDropThreshold,
          adoptionWinRateDiff: settings.adoptionWinRateDiff,
          acceptableWinRateDiff: settings.acceptableWinRateDiff,
          minWinRate: settings.minWinRate,
          coefficientInSigmoid: useAppSettings().coefficientInSigmoid,
          minPly: settings.minPly,
          maxPly: settings.maxPly,
        },
      },
      problems,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.wakeUp = undefined;
        resolve();
      }, ms);
      this.wakeUp = () => {
        clearTimeout(timer);
        this.wakeUp = undefined;
        resolve();
      };
    });
  }
}

export type NextMoveQuizJudgement =
  | "best" // 最善手
  | "accepted" // 最善手以外の正解
  | "actual" // 実戦で指された手 (不正解)
  | "incorrect"; // その他の不正解

type NextMoveQuizProblemState = {
  done: boolean; // 解答済み (正解または「答えを見る」)
  correct: boolean; // 最初の解答で正解したかどうか
  answered: boolean; // 成績にカウント済みかどうか
};

export class NextMoveQuizState {
  private _collection?: NextMoveCollection;
  private _filePath?: string;
  private order: number[] = [];
  private cursor = 0;
  private problemStates: NextMoveQuizProblemState[] = [];
  private _position?: Position;
  private _previousMove?: Move;
  private _playedMove?: Move;
  private _positionAfterPlayedMove?: Position;
  private _lastJudgement?: NextMoveQuizJudgement;
  private _shuffled = false;
  private _visible = false;

  /** 出題セッションを保持しているかどうかを返します。非表示中も true です。 */
  get isActive(): boolean {
    return !!this._collection;
  }

  /** 出題ダイアログを表示するべきかどうかを返します。 */
  get visible(): boolean {
    return this._visible;
  }

  get collection(): NextMoveCollection | undefined {
    return this._collection;
  }

  get filePath(): string | undefined {
    return this._filePath;
  }

  open(collection: NextMoveCollection, filePath: string, shuffle: boolean): void {
    if (collection.problems.length === 0) {
      throw new Error("問題がありません。"); // TODO: i18n
    }
    this._collection = collection;
    this._filePath = filePath;
    this.order = collection.problems.map((_, index) => index);
    if (shuffle) {
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }
    this.problemStates = collection.problems.map(() => ({
      done: false,
      correct: false,
      answered: false,
    }));
    this.cursor = 0;
    this._shuffled = shuffle;
    this._lastJudgement = undefined;
    this._visible = true;
    this.updatePosition();
  }

  get shuffled(): boolean {
    return this._shuffled;
  }

  /**
   * 出題順を変更します。成績はリセットされます。
   */
  setShuffled(shuffle: boolean): void {
    if (this._collection && this._filePath !== undefined) {
      this.open(this._collection, this._filePath, shuffle);
    }
  }

  /**
   * 出題ダイアログを閉じます。セッション (出題順・成績・現在位置) は保持され、
   * resume() で再開できます。セッションは別の問題集を開くか新規に作成したときに
   * 置き換えられます。
   */
  hide(): void {
    this._visible = false;
  }

  /**
   * 保持中のセッションの出題ダイアログを再表示します。
   */
  resume(): void {
    if (this._collection) {
      this._visible = true;
    }
  }

  private get problemIndex(): number {
    return this.order[this.cursor];
  }

  get problem(): NextMoveProblem | undefined {
    return this._collection?.problems[this.problemIndex];
  }

  get position(): ImmutablePosition | undefined {
    return this._position;
  }

  /**
   * 盤面に表示する局面を返します。
   * 解答の手が指されている場合はその手を指した後の局面を返します。
   */
  get displayPosition(): ImmutablePosition | undefined {
    return this._positionAfterPlayedMove || this._position;
  }

  get playedMove(): Move | undefined {
    return this._playedMove;
  }

  /** 出題局面に至る直前の指し手を返します。 */
  get previousMove(): Move | undefined {
    return this._previousMove;
  }

  private updatePosition(): void {
    const problem = this.problem;
    this._position = problem ? Position.newBySFEN(problem.sfen) || undefined : undefined;
    this._previousMove = undefined;
    if (problem?.previousMove) {
      const previousPosition = Position.newBySFEN(problem.previousMove.sfen);
      this._previousMove = previousPosition?.createMoveByUSI(problem.previousMove.usi) || undefined;
    }
    this._playedMove = undefined;
    this._positionAfterPlayedMove = undefined;
  }

  get problemNumber(): number {
    return this.cursor + 1;
  }

  get problemCount(): number {
    return this._collection?.problems.length || 0;
  }

  get hasPrevious(): boolean {
    return this.cursor > 0;
  }

  get hasNext(): boolean {
    return this.cursor + 1 < this.problemCount;
  }

  get done(): boolean {
    return this.problemStates[this.problemIndex]?.done || false;
  }

  get lastJudgement(): NextMoveQuizJudgement | undefined {
    return this._lastJudgement;
  }

  get answeredCount(): number {
    return this.problemStates.filter((state) => state.answered).length;
  }

  get correctCount(): number {
    return this.problemStates.filter((state) => state.correct).length;
  }

  /**
   * 盤上で指された手を判定します。
   * 指した手は盤面に反映されます。正解の場合は結果表示に移り、
   * 不正解の場合は retry() で出題局面に戻って再挑戦できます。
   */
  answer(move: Move): NextMoveQuizJudgement | undefined {
    const problem = this.problem;
    const state = this.problemStates[this.problemIndex];
    if (!problem || !state || state.done || this._playedMove || !this._position) {
      return;
    }
    // 指した手を盤面に反映する。
    const positionAfterPlayedMove = this._position.clone();
    if (!positionAfterPlayedMove.doMove(move)) {
      return;
    }
    this._playedMove = move;
    this._positionAfterPlayedMove = positionAfterPlayedMove;
    const usi = move.usi;
    const candidateIndex = problem.candidates.findIndex((candidate) => candidate.usi === usi);
    let judgement: NextMoveQuizJudgement;
    if (candidateIndex === 0) {
      // 先頭の候補手 (最善手) は常に正解として扱う。
      judgement = "best";
    } else if (candidateIndex > 0 && problem.candidates[candidateIndex].accepted) {
      judgement = "accepted";
    } else if (problem.actualMove.usi === usi) {
      judgement = "actual";
    } else {
      judgement = "incorrect";
    }
    const correct = judgement === "best" || judgement === "accepted";
    if (!state.answered) {
      state.answered = true;
      state.correct = correct;
    }
    if (correct) {
      state.done = true;
    }
    this._lastJudgement = judgement;
    return judgement;
  }

  /**
   * 不正解の後に出題局面に戻って再挑戦します。
   */
  retry(): void {
    const state = this.problemStates[this.problemIndex];
    if (!state || state.done) {
      return;
    }
    this._playedMove = undefined;
    this._positionAfterPlayedMove = undefined;
    this._lastJudgement = undefined;
  }

  /**
   * 解答を打ち切って結果を表示します。
   */
  reveal(): void {
    const state = this.problemStates[this.problemIndex];
    if (!state || state.done) {
      return;
    }
    state.answered = true;
    state.done = true;
    this._playedMove = undefined;
    this._positionAfterPlayedMove = undefined;
    this._lastJudgement = undefined;
  }

  goNext(): void {
    if (this.hasNext) {
      this.cursor++;
      this._lastJudgement = undefined;
      this.updatePosition();
    }
  }

  goPrevious(): void {
    if (this.hasPrevious) {
      this.cursor--;
      this._lastJudgement = undefined;
      this.updatePosition();
    }
  }
}

export function createNextMoveQuizStore(): UnwrapNestedRefs<NextMoveQuizState> {
  return reactive(new NextMoveQuizState());
}

let quizStore: UnwrapNestedRefs<NextMoveQuizState>;

export function useNextMoveQuizStore(): UnwrapNestedRefs<NextMoveQuizState> {
  if (!quizStore) {
    quizStore = createNextMoveQuizStore();
  }
  return quizStore;
}
