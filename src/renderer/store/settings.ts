import {
  AppSettings,
  AppSettingsUpdate,
  BackgroundImageType,
  BoardImageType,
  BoardLabelType,
  ClockSoundTarget,
  EvaluationViewFrom,
  KingPieceType,
  LeftSideControlType,
  PieceImageType,
  PieceStandImageType,
  PositionImageFontWeight,
  PositionImageHandLabelType,
  PositionImageStyle,
  PositionImageTypeface,
  RightSideControlType,
  Tab,
  TabPaneType,
  TextDecodingRule,
  Thema,
  buildUpdatedAppSettings,
  defaultAppSettings,
  validateAppSettings,
} from "@/common/settings/app";
import { UnwrapNestedRefs, reactive } from "vue";
import api from "@/renderer/ipc/api";
import { LogLevel } from "@/common/log";
import { Language } from "@/common/i18n";
import { RecordFileFormat } from "@/common/file/record";
import { BoardLayoutType } from "@/common/settings/layout";

class AppSettingsStore {
  private settings = defaultAppSettings();
  private merged: AppSettings = this.settings;

  get clone(): AppSettings {
    return { ...this.merged };
  }

  get language(): Language {
    return this.merged.language;
  }
  get thema(): Thema {
    return this.merged.thema;
  }
  get pieceImage(): PieceImageType {
    return this.merged.pieceImage;
  }
  get kingPieceType(): KingPieceType {
    return this.merged.kingPieceType;
  }
  get backgroundImageType(): BackgroundImageType {
    return this.merged.backgroundImageType;
  }
  get backgroundImageFileURL(): string | undefined {
    return this.merged.backgroundImageFileURL;
  }
  get boardLayoutType(): BoardLayoutType {
    return this.merged.boardLayoutType;
  }
  get boardImage(): BoardImageType {
    return this.merged.boardImage;
  }
  get croppedPieceImageBaseURL(): string | undefined {
    return this.merged.croppedPieceImageBaseURL;
  }
  get croppedPieceImageQuery(): string | undefined {
    return this.merged.croppedPieceImageQuery;
  }
  get pieceImageFileURL(): string | undefined {
    return this.merged.pieceImageFileURL;
  }
  get deletePieceImageMargin(): boolean {
    return this.merged.deletePieceImageMargin;
  }
  get boardImageFileURL(): string | undefined {
    return this.merged.boardImageFileURL;
  }
  get pieceStandImage(): PieceStandImageType {
    return this.merged.pieceStandImage;
  }
  get pieceStandImageFileURL(): string | undefined {
    return this.merged.pieceStandImageFileURL;
  }
  get enableTransparent(): boolean {
    return this.merged.enableTransparent;
  }
  get boardOpacity(): number {
    return this.merged.boardOpacity;
  }
  get pieceStandOpacity(): number {
    return this.merged.pieceStandOpacity;
  }
  get recordOpacity(): number {
    return this.merged.recordOpacity;
  }
  get boardLabelType(): BoardLabelType {
    return this.merged.boardLabelType;
  }
  get leftSideControlType(): LeftSideControlType {
    return this.merged.leftSideControlType;
  }
  get rightSideControlType(): RightSideControlType {
    return this.merged.rightSideControlType;
  }
  get pieceVolume(): number {
    return this.merged.pieceVolume;
  }
  get clockVolume(): number {
    return this.merged.clockVolume;
  }
  get clockPitch(): number {
    return this.merged.clockPitch;
  }
  get clockSoundTarget(): ClockSoundTarget {
    return this.merged.clockSoundTarget;
  }
  get boardFlipping(): boolean {
    return this.merged.boardFlipping;
  }
  get tabPaneType(): TabPaneType {
    return this.merged.tabPaneType;
  }
  get tab(): Tab {
    return this.merged.tab;
  }
  get tab2(): Tab {
    return this.merged.tab2;
  }
  get topPaneHeightPercentage(): number {
    return this.merged.topPaneHeightPercentage;
  }
  get topPanePreviousHeightPercentage(): number {
    return this.merged.topPanePreviousHeightPercentage;
  }
  get bottomLeftPaneWidthPercentage(): number {
    return this.merged.bottomLeftPaneWidthPercentage;
  }
  get defaultRecordFileFormat(): RecordFileFormat {
    return this.merged.defaultRecordFileFormat;
  }
  get textDecodingRule(): TextDecodingRule {
    return this.merged.textDecodingRule;
  }
  get returnCode(): string {
    return this.merged.returnCode;
  }
  get autoSaveDirectory(): string {
    return this.merged.autoSaveDirectory;
  }
  get recordFileNameTemplate(): string {
    return this.merged.recordFileNameTemplate;
  }
  get useCSAV3(): boolean {
    return this.merged.useCSAV3;
  }
  get enableUSIFileStartpos(): boolean {
    return this.merged.enableUSIFileStartpos;
  }
  get enableUSIFileResign(): boolean {
    return this.merged.enableUSIFileResign;
  }
  get bookOnTheFlyThresholdMB(): number {
    return this.merged.bookOnTheFlyThresholdMB;
  }
  get translateEngineOptionName(): boolean {
    return this.merged.translateEngineOptionName;
  }
  get engineTimeoutSeconds(): number {
    return this.merged.engineTimeoutSeconds;
  }
  get evaluationViewFrom(): EvaluationViewFrom {
    return this.merged.evaluationViewFrom;
  }
  get maxArrowsPerEngine(): number {
    return this.merged.maxArrowsPerEngine;
  }
  get coefficientInSigmoid(): number {
    return this.merged.coefficientInSigmoid;
  }
  get badMoveLevelThreshold1(): number {
    return this.merged.badMoveLevelThreshold1;
  }
  get badMoveLevelThreshold2(): number {
    return this.merged.badMoveLevelThreshold2;
  }
  get badMoveLevelThreshold3(): number {
    return this.merged.badMoveLevelThreshold3;
  }
  get badMoveLevelThreshold4(): number {
    return this.merged.badMoveLevelThreshold4;
  }
  get maxPVTextLength(): number {
    return this.merged.maxPVTextLength;
  }
  get showElapsedTimeInRecordView(): boolean {
    return this.merged.showElapsedTimeInRecordView;
  }
  get showCommentInRecordView(): boolean {
    return this.merged.showCommentInRecordView;
  }
  get enableAppLog(): boolean {
    return this.merged.enableAppLog;
  }
  get enableUSILog(): boolean {
    return this.merged.enableUSILog;
  }
  get enableCSALog(): boolean {
    return this.merged.enableCSALog;
  }
  get logLevel(): LogLevel {
    return this.merged.logLevel;
  }
  get positionImageStyle(): PositionImageStyle {
    return this.merged.positionImageStyle;
  }
  get positionImageSize(): number {
    return this.merged.positionImageSize;
  }
  get positionImageTypeface(): PositionImageTypeface {
    return this.merged.positionImageTypeface;
  }
  get positionImageHandLabelType(): PositionImageHandLabelType {
    return this.merged.positionImageHandLabelType;
  }
  get useBookmarkAsPositionImageHeader(): boolean {
    return this.merged.useBookmarkAsPositionImageHeader;
  }
  get positionImageHeader(): string {
    return this.merged.positionImageHeader;
  }
  get positionImageCharacterY(): number {
    return this.merged.positionImageCharacterY;
  }
  get positionImageFontScale(): number {
    return this.merged.positionImageFontScale;
  }
  get positionImageFontWeight(): PositionImageFontWeight {
    return this.merged.positionImageFontWeight;
  }
  get lastRecordFilePath(): string {
    return this.merged.lastRecordFilePath;
  }
  get lastBookFilePath(): string {
    return this.merged.lastBookFilePath;
  }
  get lastUSIEngineFilePath(): string {
    return this.merged.lastUSIEngineFilePath;
  }
  get lastImageExportFilePath(): string {
    return this.merged.lastImageExportFilePath;
  }
  get lastOtherFilePath(): string {
    return this.merged.lastOtherFilePath;
  }
  get emptyRecordInfoVisibility(): boolean {
    return this.merged.emptyRecordInfoVisibility;
  }

  async loadAppSettings(): Promise<void> {
    this.settings = await api.loadAppSettings();
    this.merged = this.settings;
  }

  private applyCustomPieceImages(settings: AppSettings): AppSettings | Promise<AppSettings> {
    if (
      settings.pieceImage === PieceImageType.CUSTOM_IMAGE &&
      settings.pieceImageFileURL &&
      (settings.pieceImageFileURL !== this.pieceImageFileURL ||
        settings.deletePieceImageMargin !== this.deletePieceImageMargin)
    ) {
      return api
        .cropPieceImage(settings.pieceImageFileURL, !!settings.deletePieceImageMargin)
        .then((result) => {
          return {
            ...settings,
            croppedPieceImageBaseURL: result,
          };
        });
    }
    return {
      ...settings,
      croppedPieceImageBaseURL: this.croppedPieceImageBaseURL,
    };
  }

  async updateAppSettings(update: AppSettingsUpdate) {
    const candidate = buildUpdatedAppSettings(this.settings, update);
    const error = validateAppSettings(candidate);
    if (error instanceof Error) {
      throw error;
    }
    const updated = await this.applyCustomPieceImages(candidate);
    await api.saveAppSettings(updated);
    this.merged = this.settings = updated;
  }

  setTemporaryUpdate(update: AppSettingsUpdate): void | Error | Promise<void> {
    const candidate = buildUpdatedAppSettings(this.merged, update);
    const error = validateAppSettings(candidate);
    if (error instanceof Error) {
      return error;
    }
    const updated = this.applyCustomPieceImages(candidate);
    if (updated instanceof Promise) {
      return updated.then((updated) => {
        this.merged = updated;
      });
    }
    this.merged = updated;
  }

  clearTemporaryUpdate(): void {
    this.merged = this.settings;
  }

  flipBoard(): void {
    this.merged.boardFlipping = this.settings.boardFlipping = !this.settings.boardFlipping;
    api.saveAppSettings(this.settings);
  }
}

export function createAppSettings(): UnwrapNestedRefs<AppSettingsStore> {
  return reactive(new AppSettingsStore());
}

let app: UnwrapNestedRefs<AppSettingsStore>;

export function useAppSettings(): UnwrapNestedRefs<AppSettingsStore> {
  if (!app) {
    app = createAppSettings();
  }
  return app;
}
