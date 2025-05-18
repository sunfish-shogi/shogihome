import { ResearchSettings, defaultResearchSettings } from "@/common/settings/research.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { SearchInfo } from "@/renderer/players/player.js";
import { ImmutableRecord } from "tsshogi";
import { MultiPV, USIEngine, USIMultiPV } from "@/common/settings/usi.js";
import { SearchInfoSenderType } from "./record.js";
import { useAppSettings } from "./settings.js";
import { Lazy } from "@/renderer/helpers/lazy.js";

function getSenderTypeByIndex(index: number): SearchInfoSenderType | undefined {
  switch (index) {
    case 0:
      return SearchInfoSenderType.RESEARCHER;
    case 1:
      return SearchInfoSenderType.RESEARCHER_2;
    case 2:
      return SearchInfoSenderType.RESEARCHER_3;
    case 3:
      return SearchInfoSenderType.RESEARCHER_4;
    default:
      return undefined;
  }
}

type UpdateSearchInfoCallback = (type: SearchInfoSenderType, info: SearchInfo) => void;

type Engine = {
  usi: USIPlayer;
  timer?: NodeJS.Timeout;
  paused: boolean;
};

export class ResearchManager {
  private settings = defaultResearchSettings();
  private engines: Engine[] = [];
  private ready: boolean = false;
  private onUpdateSearchInfo: UpdateSearchInfoCallback = () => {
    /* noop */
  };
  private onError: ErrorCallback = () => {
    /* noop */
  };
  private record?: ImmutableRecord;
  private lazyPositionUpdate = new Lazy();
  private synced = true;

  on(event: "updateSearchInfo", handler: UpdateSearchInfoCallback): this;
  on(event: "error", handler: ErrorCallback): this;
  on(event: string, handler: unknown): this {
    switch (event) {
      case "updateSearchInfo":
        this.onUpdateSearchInfo = handler as UpdateSearchInfoCallback;
        break;
      case "error":
        this.onError = handler as ErrorCallback;
        break;
    }
    return this;
  }

  async launch(settings: ResearchSettings) {
    this.settings = settings;

    // Validation
    if (settings.usi === undefined) {
      throw new Error("ResearchManager#launch: USIエンジンの設定は必須です。");
    }
    for (const s of settings.secondaries || []) {
      if (s.usi === undefined) {
        throw new Error("ResearchManager#launch: USIエンジンの設定は必須です。");
      }
    }
    if (this.engines.length > 0) {
      throw new Error(
        "ResearchManager#launch: 前回のエンジンが終了していません。数秒待ってからもう一度試してください。",
      );
    }

    // エンジンを設定する。
    const appSettings = useAppSettings();
    const usiEngines = [settings.usi, ...(settings.secondaries?.map((s) => s.usi) || [])];
    this.engines = usiEngines.map((usi, index) => {
      const options = usi!.options;
      if (settings.overrideMultiPV) {
        if (options[USIMultiPV]?.type === "spin") {
          options[USIMultiPV].value = settings.multiPV;
        } else if (options[MultiPV]?.type === "spin") {
          options[MultiPV].value = settings.multiPV;
        }
      }
      const usiEngine: USIEngine = { ...usi!, options };
      const type = getSenderTypeByIndex(index);
      return {
        usi: new USIPlayer(usiEngine, appSettings.engineTimeoutSeconds, (info) => {
          if (type !== undefined && this.synced) {
            this.onUpdateSearchInfo(type, info);
          }
        }),
        paused: false,
      };
    });

    // エンジンを起動する。
    try {
      await Promise.all(this.engines.map((engine) => engine.usi.launch()));
      await Promise.all(this.engines.map((engine) => engine.usi.readyNewGame()));
      this.ready = true;
    } catch (e) {
      this.close();
      throw e;
    }
  }

  updatePosition(record: ImmutableRecord) {
    // 反映を遅延させるので同期済みフラグを下ろす。
    this.synced = false;
    // 200ms 以内に複数回更新されたら最後の 1 回だけを処理する。
    this.lazyPositionUpdate.after(() => {
      // 初期化処理が終わっていない場合は何もしない。
      if (!this.ready) {
        return;
      }
      // 一時停止中のエンジンを除いて探索を開始する。
      this.engines.forEach((engine) => {
        if (engine.paused) {
          return;
        }
        engine.usi.startResearch(record.position, record.usi).catch((e) => {
          this.onError(e);
        });
        // タイマーを初期化する。
        this.setupTimer(engine);
      });
      // 同期済みフラグを立てる。
      this.synced = true;
      // 一時停止からの再開のために棋譜を覚えておく。
      this.record = record;
    }, 200);
  }

  isPaused(sessionID: number): boolean {
    return this.engines.find((engine) => engine.usi.sessionID === sessionID)?.paused || false;
  }

  pause(sessionID: number) {
    const engine = this.engines.find((engine) => engine.usi.sessionID === sessionID);
    if (!engine) {
      return;
    }
    engine.paused = true;
    engine.usi.stop().catch((e) => {
      this.onError(e);
    });
  }

  unpause(sessionID: number) {
    const engine = this.engines.find((engine) => engine.usi.sessionID === sessionID);
    if (!engine) {
      return;
    }
    engine.paused = false;
    if (this.record) {
      engine.usi.startResearch(this.record.position, this.record.usi).catch((e) => {
        this.onError(e);
      });
      // タイマーを初期化する。
      this.setupTimer(engine);
    }
  }

  getMultiPV(sessionID: number): number | undefined {
    return this.engines.find((engine) => engine.usi.sessionID === sessionID)?.usi.multiPV;
  }

  setMultiPV(sessionID: number, multiPV: number) {
    const engine = this.engines.find((engine) => engine.usi.sessionID === sessionID);
    if (!engine?.usi.multiPV) {
      return;
    }
    // Send stop command to let the engine change the multiPV.
    // Then, start the search again.
    engine.usi
      .setMultiPV(multiPV)
      .then(() => engine.usi.stop())
      .then(() => {
        if (this.record && !engine.paused) {
          engine.usi.startResearch(this.record.position, this.record.usi).catch((e) => {
            this.onError(e);
          });
          // タイマーを初期化する。
          this.setupTimer(engine);
        }
      })
      .catch((e) => {
        this.onError(e);
      });
  }

  isSessionExists(sessionID: number): boolean {
    return this.engines.some((engine) => engine.usi.sessionID === sessionID);
  }

  private setupTimer(engine: Engine) {
    clearTimeout(engine.timer);
    if (this.settings.enableMaxSeconds && this.settings.maxSeconds > 0) {
      engine.timer = setTimeout(() => {
        engine.usi.stop().catch((e) => {
          this.onError(e);
        });
      }, this.settings.maxSeconds * 1e3);
    }
  }

  close() {
    this.lazyPositionUpdate.clear();
    this.engines.forEach((engine) => clearTimeout(engine.timer));
    Promise.allSettled(this.engines.map((engine) => engine.usi.close()))
      .then(() => {
        this.engines = [];
        this.ready = false;
      })
      .catch((e) => {
        this.onError(e);
      });
  }
}
