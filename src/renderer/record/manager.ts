import { getDateString, getDateTimeString } from "@/common/helpers/datetime.js";
import { TimeLimitSettings } from "@/common/settings/game.js";
import {
  detectRecordFormat,
  DoMoveOption,
  exportKIF,
  ImmutablePosition,
  ImmutableRecord,
  importCSA,
  importKI2,
  importKIF,
  InitialPositionType,
  initialPositionTypeToSFEN,
  Move,
  Position,
  PositionChange,
  Record,
  RecordFormatType,
  RecordMetadataKey,
  reverseColor,
  SpecialMove,
  SpecialMoveType,
  importJKFString,
  countExistingPieces,
  PieceType,
  Square,
  Piece,
  Color,
  ImmutableNode,
} from "tsshogi";
import { CommentBehavior, SearchCommentFormat } from "@/common/settings/comment.js";
import { t, localizeError } from "@/common/i18n/index.js";
import {
  ExportOptions,
  ExportResult,
  detectRecordFileFormatByPath,
  exportRecordAsBuffer,
  importRecordFromBuffer,
} from "@/common/file/record.js";
import api from "@/renderer/ipc/api.js";
import { LogLevel } from "@/common/log.js";
import { secondsToMMSS } from "@/common/helpers/time.js";
import { RecordCustomData, SearchInfo, SearchInfoSenderType } from "@/common/record/types.js";
import {
  buildFloodgateSearchComment,
  buildSearchComment,
  buildCSA3SearchComment,
  parseComment,
  buildShogiGUISearchComment,
  getPVsFromSearchComment,
} from "@/common/record/comment.js";

type replaceRecordOption = {
  path?: string;
  markAsSaved?: boolean;
};

export type ImportRecordOption = {
  type?: RecordFormatType;
  mode?: "standard" | "mergeIntoRoot" | "mergeIntoCurrent";
  markAsSaved?: boolean;
};

export type PieceSet = {
  pawn: number;
  lance: number;
  knight: number;
  silver: number;
  gold: number;
  bishop: number;
  rook: number;
  king: number;
};

function restoreCustomData(record: Record): void {
  record.forEach((node) => {
    node.customData = parseComment(node.comment, node.customData as RecordCustomData);
  });
}

function formatTimeLimitCSAV3(settings: TimeLimitSettings): string {
  return settings.timeSeconds + "+" + settings.byoyomi + "+" + settings.increment;
}

function formatTimeLimitCSAV2(settings: TimeLimitSettings): string {
  return secondsToMMSS(settings.timeSeconds) + "+" + String(settings.byoyomi).padStart(2, "0");
}

type GameStartMetadata = {
  gameTitle?: string;
  blackName?: string;
  whiteName?: string;
  blackTimeLimit: TimeLimitSettings;
  whiteTimeLimit: TimeLimitSettings;
};

type AppendMoveParams = {
  move: Move | SpecialMove | SpecialMoveType;
  moveOption?: DoMoveOption;
  elapsedMs?: number;
};

type BackupOptions = {
  returnCode?: string;
};

export type ChangePositionHandler = () => void;
export type UpdateTreeHandler = () => void;
export type UpdateCommentHandler = () => void;
export type UpdateBookmarkHandler = () => void;
export type UpdateCustomDataHandler = () => void;
export type BackupHandler = () => BackupOptions | null | void;

export class RecordManager {
  private _recordFilePath?: string;
  private _unsaved = false;
  private _sourceURL?: string;
  private _positionCounts = new Map<string, number>();
  private changePositionHandler: ChangePositionHandler | null = null;
  private updateTreeHandler: UpdateTreeHandler | null = null;
  private updateCommentHandler: UpdateCommentHandler | null = null;
  private updateBookmarkHandler: UpdateBookmarkHandler | null = null;
  private updateCustomDataHandler: UpdateCustomDataHandler | null = null;
  private backupHandler: BackupHandler | null = null;

  constructor(private _record: Record = new Record()) {
    this.resetPositionCounts();
    this.bindRecordHandlers();
  }

  get record(): ImmutableRecord {
    return this._record;
  }

  get recordFilePath(): string | undefined {
    return this._recordFilePath;
  }

  get unsaved(): boolean {
    return this._unsaved;
  }

  get sourceURL(): string | undefined {
    return this._sourceURL;
  }

  get positionCounts(): ReadonlyMap<string, number> {
    return this._positionCounts;
  }

  private updateRecordFilePath(recordFilePath: string | undefined): void {
    this._unsaved = false;
    if (recordFilePath === this._recordFilePath) {
      return;
    }
    this._recordFilePath = recordFilePath;
    if (recordFilePath) {
      api.addRecordFileHistory(recordFilePath);
    }
  }

  async saveBackup(): Promise<void> {
    if (!this.unsaved) {
      return;
    }
    const opts = this.onBackup();
    const kif = exportKIF(this.record, opts || {});
    await api.saveRecordFileBackup(kif);
  }

  private saveBackupOnBackground(): void {
    this.saveBackup().catch((e) => {
      api.log(LogLevel.ERROR, `RecordManager#saveBackupOnBackground: failed to save backup: ${e}`);
    });
  }

  private clearRecord(position?: ImmutablePosition): void {
    this.saveBackupOnBackground();
    this._record.clear(position);
    this._unsaved = false;
    this._recordFilePath = undefined;
    this._sourceURL = undefined;
    this.onChangePosition();
    this.onUpdateTree();
  }

  private replaceRecord(record: Record, option?: replaceRecordOption): void {
    this.saveBackupOnBackground();
    this._record = record;
    this.resetPositionCounts();
    this.bindRecordHandlers();
    this.updateRecordFilePath(option?.path);
    this._unsaved = !option?.markAsSaved;
    this._sourceURL = undefined;
    restoreCustomData(this._record);
    this.onChangePosition();
    this.onUpdateTree();
  }

  reset(): void {
    this.clearRecord();
  }

  resetByInitialPositionType(startPosition: InitialPositionType): void {
    this.resetBySFEN(initialPositionTypeToSFEN(startPosition));
  }

  resetBySFEN(sfen: string): boolean {
    const position = new Position();
    if (!position.resetBySFEN(sfen)) {
      return false;
    }
    this.clearRecord(position);
    return true;
  }

  resetByUSEN(usen: string, branch?: number, ply?: number): Error | undefined {
    const record = Record.newByUSEN(usen, branch, ply);
    if (record instanceof Error) {
      return record;
    }
    this.replaceRecord(record, { markAsSaved: true });
  }

  resetByCurrentPosition(): void {
    this.clearRecord(this._record.position);
  }

  private parseRecordData(data: string, type?: RecordFormatType): Record | Error {
    let recordOrError: Record | Error;
    switch (type || detectRecordFormat(data)) {
      case RecordFormatType.SFEN: {
        const position = Position.newBySFEN(data);
        recordOrError = position ? new Record(position) : new Error(t.failedToParseSFEN);
        break;
      }
      case RecordFormatType.USI:
        recordOrError = Record.newByUSI(data);
        break;
      case RecordFormatType.KIF:
        recordOrError = importKIF(data);
        break;
      case RecordFormatType.KI2:
        recordOrError = importKI2(data);
        break;
      case RecordFormatType.CSA:
        recordOrError = importCSA(data);
        break;
      case RecordFormatType.JKF:
        recordOrError = importJKFString(data);
        break;
      case RecordFormatType.USEN:
        recordOrError = Record.newByUSEN(data);
        break;
      default:
        recordOrError = new Error(t.failedToDetectRecordFormat);
        break;
    }
    if (recordOrError instanceof Error) {
      return localizeError(recordOrError);
    }
    return recordOrError;
  }

  importRecord(data: string, option?: ImportRecordOption): Error | undefined {
    const recordOrError = this.parseRecordData(data, option?.type);
    if (recordOrError instanceof Error) {
      return recordOrError;
    }
    switch (option?.mode || "standard") {
      case "standard":
        this.replaceRecord(recordOrError, option);
        break;
      case "mergeIntoRoot":
        return this.mergeRecord(recordOrError);
      case "mergeIntoCurrent":
        return this.mergeRecordIntoCurrent(recordOrError);
    }
  }

  importRecordFromBuffer(
    data: Uint8Array,
    path: string,
    option?: { autoDetect?: boolean },
  ): Error | undefined {
    const format = detectRecordFileFormatByPath(path);
    if (!format) {
      return new Error(`${t.unknownFileExtension}: ${path}`);
    }
    const recordOrError = importRecordFromBuffer(data, format, option);
    if (recordOrError instanceof Error) {
      return localizeError(recordOrError);
    }
    this.replaceRecord(recordOrError, { path, markAsSaved: true });
    return;
  }

  async importRecordFromRemoteURL(url?: string): Promise<void> {
    const replaceMode = !!url;
    url = url || this._sourceURL;
    if (!url) {
      throw new Error("RecordManager#importRecordFromRemoteURL: source URL is not set");
    }
    const data = await api.loadRemoteTextFile(url);
    const recordOrError = this.parseRecordData(data);
    if (recordOrError instanceof Error) {
      throw recordOrError;
    }
    if (replaceMode) {
      this.replaceRecord(recordOrError);
      this._sourceURL = url;
      return;
    }
    const error = this.mergeRecord(recordOrError);
    if (error) {
      throw error;
    }
  }

  exportRecordAsBuffer(path: string, opt: ExportOptions): ExportResult | Error {
    const format = detectRecordFileFormatByPath(path);
    if (!format) {
      return new Error(`${t.unknownFileExtension}: ${path}`);
    }
    const result = exportRecordAsBuffer(this._record, format, opt);
    this.updateRecordFilePath(path);
    return result;
  }

  private applyPosition(position: ImmutablePosition): void {
    this._record.clear(position);
    this._unsaved = true;
    this._recordFilePath = undefined;
    this.onChangePosition();
  }

  swapNextTurn(): void {
    const position = this.record.position.clone();
    position.setColor(reverseColor(position.color));
    this.applyPosition(position);
  }

  changePosition(change: PositionChange): void {
    const position = this.record.position.clone();
    position.edit(change);
    this.applyPosition(position);
  }

  changePieceSet(pieceSet: PieceSet): void {
    const position = this.record.position.clone();
    const counts = countExistingPieces(this.record.position);
    const updates = {
      king: pieceSet.king - counts.king,
      rook: pieceSet.rook - (counts.rook + counts.dragon),
      bishop: pieceSet.bishop - (counts.bishop + counts.horse),
      gold: pieceSet.gold - counts.gold,
      silver: pieceSet.silver - (counts.silver + counts.promSilver),
      knight: pieceSet.knight - (counts.knight + counts.promKnight),
      lance: pieceSet.lance - (counts.lance + counts.promLance),
      pawn: pieceSet.pawn - (counts.pawn + counts.promPawn),
    };
    Object.entries(updates)
      .filter(([, update]) => update < 0)
      .forEach(([key, update]) => {
        const pieceType = key as PieceType;
        for (let u = 0; u > update; u--) {
          const square = Square.all.find(
            (square) => position.board.at(square)?.unpromoted().type === pieceType,
          );
          if (square) {
            position.board.remove(square);
          } else if (pieceType !== PieceType.KING) {
            if (position.blackHand.count(pieceType) > position.whiteHand.count(pieceType)) {
              position.blackHand.reduce(pieceType, 1);
            } else {
              position.whiteHand.reduce(pieceType, 1);
            }
          }
        }
      });
    Object.entries(updates)
      .filter(([, update]) => update > 0)
      .forEach(([key, update]) => {
        const pieceType = key as PieceType;
        for (let u = 0; u < update; u++) {
          const square = Square.all.find((square) => !position.board.at(square));
          if (square) {
            position.board.set(square, new Piece(Color.BLACK, pieceType));
          } else if (pieceType !== PieceType.KING) {
            if (position.blackHand.count(pieceType) <= position.whiteHand.count(pieceType)) {
              position.blackHand.add(pieceType, 1);
            } else {
              position.whiteHand.add(pieceType, 1);
            }
          }
        }
      });
    this.applyPosition(position);
  }

  goForward(): void {
    this._record.goForward();
  }

  goBack(): void {
    this._record.goBack();
  }

  changePly(ply: number): void {
    this._record.goto(ply);
  }

  changeBranch(index: number): boolean {
    return this._record.switchBranchByIndex(index);
  }

  changeNode(node: ImmutableNode): boolean {
    return this._record.gotoNode(node);
  }

  swapWithNextBranch(): boolean {
    if (this._record.swapWithNextBranch()) {
      this._unsaved = true;
      return true;
    }
    return false;
  }

  swapWithPreviousBranch(): boolean {
    if (this._record.swapWithPreviousBranch()) {
      this._unsaved = true;
      return true;
    }
    return false;
  }

  resetAllBranchSelection() {
    this._record.resetAllBranchSelection();
  }

  removeCurrentMove(): boolean {
    if (this._record.removeCurrentMove()) {
      this._unsaved = true;
      this.onUpdateTree();
      return true;
    }
    return false;
  }

  removeNextMove(): boolean {
    if (this._record.removeNextMove()) {
      this._unsaved = true;
      this.onUpdateTree();
      return true;
    }
    return false;
  }

  jumpToBookmark(bookmark: string): boolean {
    return this._record.jumpToBookmark(bookmark);
  }

  updateComment(comment: string): void {
    this._record.current.comment = comment;
    this._unsaved = true;
    this.onUpdateComment();
  }

  updateBookmark(bookmark: string): void {
    this._record.current.bookmark = bookmark;
    this._unsaved = true;
    this.onUpdateBookmark();
  }

  appendComment(add: string, behavior: CommentBehavior): void {
    if (!add) {
      return;
    }
    const org = this._record.current.comment;
    const sep = this.record.current.comment ? "\n" : "";
    switch (behavior) {
      case CommentBehavior.NONE:
        break;
      case CommentBehavior.INSERT:
        this._record.current.comment = add + sep + org;
        break;
      case CommentBehavior.APPEND:
        this._record.current.comment = org + sep + add;
        break;
      case CommentBehavior.OVERWRITE:
        this._record.current.comment = add;
        break;
    }
    this._unsaved = true;
    this.onUpdateComment();
  }

  appendSearchComment(
    type: SearchInfoSenderType,
    format: SearchCommentFormat,
    searchInfo: SearchInfo,
    behavior: CommentBehavior,
    options?: {
      header?: string;
      engineName?: string;
    },
  ): void {
    let comment: string;
    switch (format) {
      case SearchCommentFormat.SHOGIHOME:
        comment = buildSearchComment(this.record.position, type, searchInfo, options);
        break;
      case SearchCommentFormat.FLOODGATE:
        comment = buildFloodgateSearchComment(searchInfo);
        break;
      case SearchCommentFormat.CSA3:
        comment = buildCSA3SearchComment(searchInfo);
        break;
      case SearchCommentFormat.SHOGIGUI:
        comment = buildShogiGUISearchComment(type, searchInfo);
        break;
    }
    if (options?.header) {
      comment = options.header + "\n" + comment;
    }
    this.appendComment(comment, behavior);
    this._unsaved = true;
  }

  get inCommentPVs(): Move[][] {
    return getPVsFromSearchComment(this.record.position, this.record.current.comment);
  }

  setGameStartMetadata(metadata: GameStartMetadata): void {
    if (metadata.gameTitle) {
      this._record.metadata.setStandardMetadata(RecordMetadataKey.TITLE, metadata.gameTitle);
    }
    if (metadata.blackName) {
      this._record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, metadata.blackName);
    }
    if (metadata.whiteName) {
      this._record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, metadata.whiteName);
    }
    this._record.metadata.setStandardMetadata(RecordMetadataKey.DATE, getDateString());
    this._record.metadata.setStandardMetadata(
      RecordMetadataKey.START_DATETIME,
      getDateTimeString(),
    );
    const useCSAV3Time = metadata.blackTimeLimit.increment || metadata.whiteTimeLimit.increment;
    const formatTimeLimit = useCSAV3Time ? formatTimeLimitCSAV3 : formatTimeLimitCSAV2;
    const blackTime = formatTimeLimit(metadata.blackTimeLimit);
    const whiteTime = formatTimeLimit(metadata.whiteTimeLimit);
    if (blackTime === whiteTime) {
      this._record.metadata.setStandardMetadata(RecordMetadataKey.TIME_LIMIT, blackTime);
    } else {
      this._record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_TIME_LIMIT, blackTime);
      this._record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_TIME_LIMIT, whiteTime);
    }
    this._unsaved = true;
  }

  setGameEndMetadata(): void {
    this._record.metadata.setStandardMetadata(RecordMetadataKey.END_DATETIME, getDateTimeString());
    this._unsaved = true;
  }

  updateSearchInfo(type: SearchInfoSenderType, searchInfo: SearchInfo): void {
    const data = (this.record.current.customData || {}) as RecordCustomData;
    switch (type) {
      case SearchInfoSenderType.PLAYER:
        data.playerSearchInfo = searchInfo;
        break;
      case SearchInfoSenderType.OPPONENT:
        data.opponentSearchInfo = searchInfo;
        break;
      case SearchInfoSenderType.RESEARCHER:
        if ((searchInfo.depth || 0) >= (data.researchInfo?.depth || 0)) {
          data.researchInfo = searchInfo;
        }
        break;
      case SearchInfoSenderType.RESEARCHER_2:
        if ((searchInfo.depth || 0) >= (data.researchInfo2?.depth || 0)) {
          data.researchInfo2 = searchInfo;
        }
        break;
      case SearchInfoSenderType.RESEARCHER_3:
        if ((searchInfo.depth || 0) >= (data.researchInfo3?.depth || 0)) {
          data.researchInfo3 = searchInfo;
        }
        break;
      case SearchInfoSenderType.RESEARCHER_4:
        if ((searchInfo.depth || 0) >= (data.researchInfo4?.depth || 0)) {
          data.researchInfo4 = searchInfo;
        }
        break;
    }
    this._record.current.customData = data;
    this.onUpdateCustomData();
  }

  appendMove(params: AppendMoveParams): boolean {
    const ok = this._record.append(params.move, params.moveOption);
    if (!ok) {
      return false;
    }
    if (params.elapsedMs !== undefined) {
      this._record.current.setElapsedMs(params.elapsedMs);
    }
    this._unsaved = true;
    return true;
  }

  appendMovesSilently(moves: Move[], opt?: DoMoveOption): number {
    this.unbindChangePositionHandler();
    try {
      let n = 0;
      const ply = this._record.current.ply;
      for (const move of moves) {
        if (!this._record.append(move, opt)) {
          break;
        }
        n++;
      }
      this._record.goto(ply);
      this._unsaved = true;
      this.onUpdateTree();
      return n;
    } finally {
      this.bindRecordHandlers();
    }
  }

  mergeRecord(record: ImmutableRecord): Error | undefined {
    if (this._record.initialPosition.sfen !== record.initialPosition.sfen) {
      return new Error(t.failedToMergeRecordWithDifferentInitialPosition);
    }
    this._record.merge(record);
    this._unsaved = true;
    restoreCustomData(this._record);
    this.onUpdateTree();
  }

  mergeRecordIntoCurrent(record: ImmutableRecord): Error | undefined {
    if (this._record.position.color !== record.initialPosition.color) {
      return new Error(t.failedToMergeRecordWithDifferentTurn);
    }
    const { successCount, skipCount } = this._record.mergeIntoCurrentPosition(record);
    this._unsaved = true;
    restoreCustomData(this._record);
    this.onUpdateTree();
    if (skipCount > 0) {
      return new Error(t.skippedMovesInMerge(skipCount, successCount + skipCount));
    }
  }

  updateStandardMetadata(update: { key: RecordMetadataKey; value: string }): void {
    this._record.metadata.setStandardMetadata(update.key, update.value);
    this._unsaved = true;
  }

  on(event: "changePosition", handler: () => void): this;
  on(event: "updateTree", handler: () => void): this;
  on(event: "updateComment", handler: () => void): this;
  on(event: "updateCustomData", handler: () => void): this;
  on(event: "updateBookmark", handler: () => void): this;
  on(event: "backup", handler: BackupHandler): this;
  on(event: string, handler: unknown): this {
    switch (event) {
      case "changePosition":
        this.changePositionHandler = handler as () => void;
        break;
      case "updateTree":
        this.updateTreeHandler = handler as () => void;
        break;
      case "updateComment":
        this.updateCommentHandler = handler as () => void;
        break;
      case "updateBookmark":
        this.updateBookmarkHandler = handler as () => void;
        break;
      case "updateCustomData":
        this.updateCustomDataHandler = handler as () => void;
        break;
      case "backup":
        this.backupHandler = handler as BackupHandler;
        break;
    }
    return this;
  }

  private onChangePosition() {
    if (this.changePositionHandler) {
      this.changePositionHandler();
    }
  }

  private onUpdateTree() {
    if (this.updateTreeHandler) {
      this.updateTreeHandler();
    }
  }

  private onUpdateComment() {
    if (this.updateCommentHandler) {
      this.updateCommentHandler();
    }
  }

  private onUpdateBookmark() {
    if (this.updateBookmarkHandler) {
      this.updateBookmarkHandler();
    }
  }

  private onUpdateCustomData() {
    if (this.updateCustomDataHandler) {
      this.updateCustomDataHandler();
    }
  }

  private onBackup(): BackupOptions | null | void {
    return this.backupHandler ? this.backupHandler() : null;
  }

  private resetPositionCounts(): void {
    this._positionCounts.clear();
    this._record.forEach((node) => {
      this.addPositionCount(node);
    });
  }

  private isPositionCountTarget(node: ImmutableNode): boolean {
    // 「投了」や「中断」を含めると直前の局面と重複登録になってしまうので除外する。
    return node.ply === 0 || node.move instanceof Move;
  }

  private addPositionCount(node: ImmutableNode) {
    if (!this.isPositionCountTarget(node)) {
      return;
    }
    const old = this._positionCounts.get(node.sfen) || 0;
    this._positionCounts.set(node.sfen, old + 1);
  }

  private reducePositionCount(node: ImmutableNode) {
    if (!this.isPositionCountTarget(node)) {
      return;
    }
    const old = this._positionCounts.get(node.sfen) || 0;
    if (old > 1) {
      this._positionCounts.set(node.sfen, old - 1);
    } else {
      this._positionCounts.delete(node.sfen);
    }
  }

  private bindRecordHandlers(): void {
    this._record.on("changePosition", this.onChangePosition.bind(this));
    this._record.on("clear", this.resetPositionCounts.bind(this));
    this._record.on("addNode", (node) => {
      this.addPositionCount(node);
    });
    this._record.on("removeNode", (node) => {
      this.reducePositionCount(node);
    });
  }

  private unbindChangePositionHandler(): void {
    this._record.on("changePosition", () => {
      /* noop */
    });
  }
}
