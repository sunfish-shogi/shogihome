import { SearchInfo } from "@/renderer/players/player.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { AnalysisSettings, defaultAnalysisSettings } from "@/common/settings/analysis.js";
import { AppSettings } from "@/common/settings/app.js";
import { USIEngine } from "@/common/settings/usi.js";
import { Color, Move, reverseColor } from "tsshogi";
import { RecordManager, SearchInfoSenderType } from "./record.js";
import { scoreToPercentage } from "./score.js";
import { useAppSettings } from "./settings.js";
import { t } from "@/common/i18n/index.js";

type FinishCallback = () => void;
type ErrorCallback = (e: unknown) => void;

export class AnalysisManager {
  private researcher?: USIPlayer;
  private settings = defaultAnalysisSettings();
  private lastSearchInfo?: SearchInfo;
  private searchInfo?: SearchInfo;
  private timerHandle?: number;
  private onFinish: FinishCallback = () => {
    /* noop */
  };
  private onError: ErrorCallback = () => {
    /* noop */
  };

  constructor(private recordManager: RecordManager) {}

  on(event: "finish", handler: FinishCallback): this;
  on(event: "error", handler: ErrorCallback): this;
  on(event: string, handler: unknown): this {
    switch (event) {
      case "finish":
        this.onFinish = handler as FinishCallback;
        break;
      case "error":
        this.onError = handler as ErrorCallback;
        break;
    }
    return this;
  }


  async start(settings: AnalysisSettings): Promise<void> {
    if (!settings.usi) {
      throw new Error("エンジンが設定されていません。");
    }
    await this.setupEngine(settings.usi as USIEngine);
    this.settings = settings;
    this.lastSearchInfo = undefined;
    this.searchInfo = undefined;
    this.recordManager.changePly(this.firstPly());
    if (this.settings.descending && !(this.recordManager.record.current.move instanceof Move)) {
      // 降順の場合に「投了」や「中断」などの特殊な指し手はスキップする。
      this.recordManager.goBack();
    }
    setTimeout(() => this.search());
  }

  private firstPly(): number {
    if (!this.settings.descending) {
      // 昇順の場合
      if (this.settings.startCriteria.enableNumber) {
        // 開始手数が指定されている場合はそれに従う。
        return this.settings.startCriteria.number - 1;
      } else {
        // 開始手数が指定されていない場合は棋譜の先頭から開始する。
        return 0;
      }
    } else {
      // 降順の場合
      if (this.settings.endCriteria.enableNumber) {
        // 終了手数が指定されている場合はそれに従う。
        return this.settings.endCriteria.number;
      } else {
        // 終了手数が指定されていない場合は棋譜の末尾から開始する。
        return this.recordManager.record.length;
      }
    }
  }

  close(): void {
    this.clearTimer();
    this.closeEngine().catch((e) => {
      this.onError(e);
    });
  }

  private async setupEngine(engine: USIEngine): Promise<void> {
    if (this.researcher) {
      throw new Error(
        "AnalysisManager#setupEngine: 前回のエンジンが終了していません。数秒待ってからもう一度試してください。",
      );
    }
    const appSettings = useAppSettings();
    const researcher = new USIPlayer(
      engine,
      appSettings.engineTimeoutSeconds,
      this.updateSearchInfo.bind(this),
    );
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

  private searchNextPosition() {
    // 次の局面へ移動する。
    const lastPly = this.recordManager.record.current.ply;
    if (!this.settings.descending) {
      // 昇順の場合
      this.recordManager.goForward();
      // 終了条件を満たしている場合はここで打ち切る。
      if (
        this.settings.endCriteria.enableNumber &&
        this.recordManager.record.current.ply > this.settings.endCriteria.number
      ) {
        this.finish();
        return;
      }
    } else {
      // 降順の場合
      this.recordManager.goBack();
      // 終了条件を満たしている場合はここで打ち切る。
      if (
        this.settings.startCriteria.enableNumber &&
        this.recordManager.record.current.ply < this.settings.startCriteria.number - 1
      ) {
        this.finish();
        return;
      }
    }
    // 局面が変わっていない場合は終了する。
    const record = this.recordManager.record;
    if (record.current.ply === lastPly) {
      this.finish();
      return;
    }
    this.search();
  }

  private search(): void {
    // タイマーを解除する。
    this.clearTimer();
    // エンジンが初期化されていない場合は終了する。
    if (!this.researcher) {
      this.onError(new Error("エンジンが初期化されていません。"));
      this.finish();
      return;
    }
    // 探索情報をシフトする。
    this.lastSearchInfo = this.searchInfo;
    this.searchInfo = undefined;
    // 最終局面の場合は終了する。
    const record = this.recordManager.record;
    if (!record.current.next && !(record.current.move instanceof Move)) {
      this.finish();
      return;
    }
    // タイマーをセットする。
    this.setTimer();
    // 探索を開始する。
    this.researcher
      .startResearch(this.recordManager.record.position, this.recordManager.record.usi)
      .catch((e) => {
        this.onError(e);
      });
  }

  private finish(): void {
    this.onFinish();
    this.close();
  }

  private setTimer(): void {
    this.timerHandle = window.setTimeout(() => {
      this.onResult();
      this.searchNextPosition();
    }, this.settings.perMoveCriteria.maxSeconds * 1e3);
  }

  private clearTimer(): void {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = undefined;
    }
  }

  private onResult(): void {
    //@LoveKapibarasan
    if (!this.searchInfo) {
    // ダミーの SearchInfo を生成
      this.searchInfo = {
        usi: "",        // 必須なので空文字で埋める
      };
    }
    if (!this.lastSearchInfo) {
      this.lastSearchInfo = {
        usi: "",
      };
    }
    //=====
    const searchInfo1 = this.settings.descending ? this.searchInfo : this.lastSearchInfo;
    const searchInfo2 = this.settings.descending ? this.lastSearchInfo : this.searchInfo;
    // 逆順の場合は 1 手後の局面に結果を書き込む
    const orgPly = this.recordManager.record.current.ply;
    if (this.settings.descending) {
      this.recordManager.changePly(orgPly + 1);
    }
    // 直前の指し手の結果を出すので、次の手番に対して反転した値を使用する。
    const color = reverseColor(this.recordManager.record.position.color);
    const sign = color === Color.BLACK ? 1 : -1;
    // 手番側から見た評価値
    const negaScore = searchInfo2.score !== undefined ? searchInfo2.score * sign : undefined;
    // 1 手前の局面からの評価値の変動
    const scoreDelta =
      searchInfo2.score !== undefined && searchInfo1.score !== undefined
        ? (searchInfo2.score - searchInfo1.score) * sign
        : undefined;
    // エンジンが示す最善手と一致しているかどうか
    const actualMove = this.recordManager.record.current.move;
    const isBestMove =
      actualMove instanceof Move && searchInfo1.pv ? actualMove.equals(searchInfo1.pv[0]) : false;
    // コメントの先頭に付与するヘッダーを作成する。
    const appSettings = useAppSettings();
    let header = "";
    if (scoreDelta !== undefined && negaScore !== undefined && !isBestMove) {
      const text = getMoveAccuracyText(negaScore - scoreDelta, negaScore, appSettings);
      if (text) {
        header = `【${text}】`;
      }
    }
    // コメントを書き込む。
    this.recordManager.appendSearchComment(
      SearchInfoSenderType.RESEARCHER,
      appSettings.searchCommentFormat,
      searchInfo2,
      this.settings.commentBehavior,
      {
        header,
        engineName: this.settings.usi?.name,
      },
    );
    // 逆順の場合は元の局面に戻す。
    if (this.settings.descending) {
      this.recordManager.changePly(orgPly);
    }
  }

  updateSearchInfo(info: SearchInfo): void {
    this.recordManager.updateSearchInfo(SearchInfoSenderType.RESEARCHER, info);
    this.searchInfo = info;
  }
}

function getMoveAccuracyText(
  before: number,
  after: number,
  appSettings: AppSettings,
): string | null {
  const loss =
    scoreToPercentage(before, appSettings.coefficientInSigmoid) -
    scoreToPercentage(after, appSettings.coefficientInSigmoid);
  if (loss >= appSettings.badMoveLevelThreshold4) {
    return t.blunder;
  } else if (loss >= appSettings.badMoveLevelThreshold3) {
    return t.mistake;
  } else if (loss >= appSettings.badMoveLevelThreshold2) {
    return t.dubious;
  } else if (loss >= appSettings.badMoveLevelThreshold1) {
    return t.inaccuracy;
  }
  return null;
}
