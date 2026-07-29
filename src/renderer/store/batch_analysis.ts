import { ImmutableRecord } from "tsshogi";
import {
  BatchAnalysisSettings,
  defaultBatchAnalysisSettings,
} from "@/common/settings/batch_analysis.js";
import { AnalysisSettings, defaultAnalysisSettings } from "@/common/settings/analysis.js";
import { TextDecodingRule } from "@/common/settings/app.js";
import { RecordCustomData } from "@/common/record/types.js";
import { t } from "@/common/i18n/index.js";
import api from "@/renderer/ipc/api.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { AnalysisManager } from "./analysis.js";
import { useAppSettings } from "./settings.js";

export type BatchAnalysisResult = {
  successTotal: number;
  failedTotal: number;
  skippedTotal: number;
};

export type BatchAnalysisProgress = BatchAnalysisResult & {
  current: number; // 1 から始まる処理中ファイルの番号
  total: number;
  path: string;
};

type FinishCallback = (result: BatchAnalysisResult) => void;
type ErrorCallback = (e: unknown) => void;
type ProgressCallback = (progress: BatchAnalysisProgress) => void;

// 解析結果 (検討または解析による評価値コメント) を持つ指し手が 1 つでもあれば解析済みとみなす。
export function hasAnalysisResult(record: ImmutableRecord): boolean {
  let found = false;
  record.forEach((node) => {
    const data = node.customData as RecordCustomData | undefined;
    if (node.ply >= 1 && data?.researchInfo) {
      found = true;
    }
  });
  return found;
}

export class BatchAnalysisManager {
  private analysisManager: AnalysisManager;
  private settings = defaultBatchAnalysisSettings();
  private analysisSettings = defaultAnalysisSettings();
  private files: string[] = [];
  private index = 0;
  private result: BatchAnalysisResult = { successTotal: 0, failedTotal: 0, skippedTotal: 0 };
  private running = false;
  private stopped = false;
  private savingPromise?: Promise<void>;
  private _progress?: BatchAnalysisProgress;
  private onFinish: FinishCallback = () => {
    /* noop */
  };
  private onError: ErrorCallback = () => {
    /* noop */
  };
  private onProgress: ProgressCallback = () => {
    /* noop */
  };

  constructor(private recordManager: RecordManager) {
    this.analysisManager = new AnalysisManager(recordManager, { keepEngine: true })
      .on("finish", () => this.onAnalysisFinish())
      .on("error", (e) => this.onAnalysisError(e));
  }

  on(event: "finish", handler: FinishCallback): this;
  on(event: "error", handler: ErrorCallback): this;
  on(event: "progress", handler: ProgressCallback): this;
  on(event: string, handler: unknown): this {
    switch (event) {
      case "finish":
        this.onFinish = handler as FinishCallback;
        break;
      case "error":
        this.onError = handler as ErrorCallback;
        break;
      case "progress":
        this.onProgress = handler as ProgressCallback;
        break;
    }
    return this;
  }

  get progress(): BatchAnalysisProgress | undefined {
    return this._progress;
  }

  async start(settings: BatchAnalysisSettings, analysisSettings: AnalysisSettings): Promise<void> {
    if (this.running) {
      throw new Error("BatchAnalysisManager#start: 既に実行中です。");
    }
    if (!analysisSettings.usi) {
      throw new Error("エンジンが設定されていません。");
    }
    const files = await api.listRecordFiles({
      directory: settings.source,
      formats: settings.sourceFormats,
      subdirectories: settings.subdirectories,
    });
    if (files.length === 0) {
      throw new Error(t.noRecordFileFound);
    }
    this.settings = settings;
    this.analysisSettings = analysisSettings;
    this.files = files;
    this.index = 0;
    this.result = { successTotal: 0, failedTotal: 0, skippedTotal: 0 };
    this.running = true;
    this.stopped = false;
    this._progress = undefined;
    setTimeout(() => this.processCurrentFile());
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    // 解析途中のファイルの結果は保存せずに終了する。
    this.stopped = true;
    // 直前のファイルの保存が進行中の場合は、書き込みが完了して結果に反映されてから終了処理を行う。
    // (保存が完了する前に終了報告すると、成功件数が表示後に変化してしまうため。)
    if (this.savingPromise) {
      this.savingPromise.finally(() => this.finish());
    } else {
      this.finish();
    }
  }

  private processCurrentFile(): void {
    if (!this.running || this.stopped) {
      return;
    }
    if (this.index >= this.files.length) {
      this.finish();
      return;
    }
    const path = this.files[this.index];
    this._progress = {
      current: this.index + 1,
      total: this.files.length,
      path,
      ...this.result,
    };
    this.onProgress(this._progress);
    this.openCurrentFile()
      .then((opened) => {
        if (!opened || this.stopped) {
          return;
        }
        if (this.settings.skipAnalyzed && hasAnalysisResult(this.recordManager.record)) {
          this.result.skippedTotal++;
          this.goNextFile();
          return;
        }
        // エンジンエラーは復旧が見込めないためバッチ全体を中断する。
        return this.analysisManager.start(this.analysisSettings).catch((e) => {
          this.onError(e);
          this.finish();
        });
      })
      .catch((e) => {
        // 想定外のエラー
        this.onError(e);
        this.finish();
      });
  }

  // 棋譜ファイルを読み込む。読み込めない場合は失敗として数え、次のファイルへ進む。
  private async openCurrentFile(): Promise<boolean> {
    const path = this.files[this.index];
    const appSettings = useAppSettings();
    try {
      const data = await api.openRecord(path);
      const error = this.recordManager.importRecordFromBuffer(data, path, {
        autoDetect: appSettings.textDecodingRule === TextDecodingRule.AUTO_DETECT,
        skipHistory: true,
      });
      if (error) {
        throw error;
      }
      return true;
    } catch (e) {
      this.onError(e);
      this.result.failedTotal++;
      this.goNextFile();
      return false;
    }
  }

  // エンジンエラーは復旧が見込めないためバッチ全体を中断する。
  // (start() の失敗と異なり、startResearch() の非同期エラーはここに届く。)
  private onAnalysisError(e: unknown): void {
    if (!this.running) {
      return;
    }
    this.onError(e);
    this.finish();
  }

  private onAnalysisFinish(): void {
    if (!this.running || this.stopped) {
      return;
    }
    this.savingPromise = this.saveCurrentFile()
      .then(() => {
        this.result.successTotal++;
      })
      .catch((e) => {
        this.onError(e);
        this.result.failedTotal++;
      })
      .finally(() => {
        this.savingPromise = undefined;
        this.goNextFile();
      });
  }

  private async saveCurrentFile(): Promise<void> {
    const path = this.files[this.index];
    const appSettings = useAppSettings();
    const result = this.recordManager.exportRecordAsBuffer(path, {
      returnCode: appSettings.returnCode,
      csa: { v3: appSettings.useCSAV3 },
      useUTF8ForKifAndKi2: appSettings.useUTF8ForKifAndKi2,
      skipHistory: true,
    });
    if (result instanceof Error) {
      throw result;
    }
    await api.saveRecord(path, result.data);
  }

  private goNextFile(): void {
    this.index++;
    setTimeout(() => this.processCurrentFile());
  }

  private finish(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.analysisManager.close();
    this.onFinish(this.result);
  }
}
