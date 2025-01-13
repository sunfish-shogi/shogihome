<template>
  <div>
    <dialog ref="dialog">
      <div class="title">{{ t.appSettings }}</div>
      <div class="form-group scroll settings">
        <!-- 表示 -->
        <div class="section">
          <div class="section-title">{{ t.view }}</div>
          <!-- 言語 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.language }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.language"
              :items="[
                { label: '日本語', value: Language.JA },
                { label: 'English', value: Language.EN },
                { label: '繁體中文', value: Language.ZH_TW },
                { label: 'Tiếng Việt', value: Language.VI },
              ]"
              @change="
                (value: string) => {
                  update.language = value as Language;
                }
              "
            />
          </div>
          <div class="form-group warning">
            <div class="note">
              {{ t.translationHelpNeeded }}
              {{
                t.translationHelpNeeded != en.translationHelpNeeded ? en.translationHelpNeeded : ""
              }}
            </div>
            <div class="note">
              {{ t.restartRequiredAfterLocaleChange }}
              {{
                t.restartRequiredAfterLocaleChange != en.restartRequiredAfterLocaleChange
                  ? en.restartRequiredAfterLocaleChange
                  : ""
              }}
            </div>
          </div>
          <!-- テーマ -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.theme }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.thema"
              :items="[
                { label: t.green, value: Thema.STANDARD },
                { label: t.cherryBlossom, value: Thema.CHERRY_BLOSSOM },
                { label: t.autumn, value: Thema.AUTUMN },
                { label: t.snow, value: Thema.SNOW },
                { label: t.darkGreen, value: Thema.DARK_GREEN },
                { label: t.dark, value: Thema.DARK },
              ]"
              @change="
                (value: string) => {
                  update.thema = value as Thema;
                }
              "
            />
          </div>
          <!-- 背景画像 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.backgroundImage }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.backgroundImageType"
              :items="[
                { label: t.none, value: BackgroundImageType.NONE },
                { label: t.bgCover, value: BackgroundImageType.COVER },
                { label: t.bgContain, value: BackgroundImageType.CONTAIN },
                { label: t.bgTile, value: BackgroundImageType.TILE },
              ]"
              @change="
                (value: string) => {
                  update.backgroundImageType = value as BackgroundImageType;
                }
              "
            />
          </div>
          <div
            v-show="
              (update.backgroundImageType ?? original.backgroundImageType) !==
              BackgroundImageType.NONE
            "
            class="form-item"
          >
            <div class="form-item-label-wide"></div>
            <ImageSelector
              class="image-selector"
              :default-url="original.backgroundImageFileURL"
              @select="(url: string) => (update.backgroundImageFileURL = url)"
            />
          </div>
          <!-- 盤レイアウト -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.boardLayout }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.boardLayoutType"
              :items="[
                { label: t.standard, value: BoardLayoutType.STANDARD },
                { label: t.compact, value: BoardLayoutType.COMPACT },
                { label: t.portrait, value: BoardLayoutType.PORTRAIT },
              ]"
              @change="
                (value: string) => {
                  update.boardLayoutType = value as BoardLayoutType;
                }
              "
            />
          </div>
          <!-- 駒画像 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.piece }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.pieceImage"
              :items="[
                { label: t.singleKanjiPiece, value: PieceImageType.HITOMOJI },
                {
                  label: t.singleKanjiGothicPiece,
                  value: PieceImageType.HITOMOJI_GOTHIC,
                },
                {
                  label: t.singleKanjiDarkPiece,
                  value: PieceImageType.HITOMOJI_DARK,
                },
                {
                  label: t.singleKanjiGothicDarkPiece,
                  value: PieceImageType.HITOMOJI_GOTHIC_DARK,
                },
                { label: t.customImage, value: PieceImageType.CUSTOM_IMAGE },
              ]"
              @change="
                (value: string) => {
                  update.pieceImage = value as PieceImageType;
                }
              "
            />
            <div
              v-show="(update.pieceImage ?? original.pieceImage) === PieceImageType.CUSTOM_IMAGE"
              ref="pieceImageSelector"
              class="form-item"
            >
              <div class="form-item-label-wide"></div>
              <ImageSelector
                class="image-selector"
                :default-url="original.pieceImageFileURL"
                @select="(url: string) => (update.pieceImageFileURL = url)"
              />
            </div>
            <div
              v-show="(update.pieceImage ?? original.pieceImage) === PieceImageType.CUSTOM_IMAGE"
              class="form-item"
            >
              <div class="form-item-label-wide"></div>
              <ToggleButton
                :label="t.imageHasMarginsRemoveForLargerDisplay"
                :value="original.deletePieceImageMargin"
                @change="(checked: boolean) => (update.deletePieceImageMargin = checked)"
              />
            </div>
          </div>
          <!-- 盤画像 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.board }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.boardImage"
              :items="[
                { label: t.lightWoodyTexture, value: BoardImageType.LIGHT },
                { label: t.warmWoodTexture, value: BoardImageType.WARM },
                { label: t.resin, value: BoardImageType.RESIN },
                { label: t.resin + '2', value: BoardImageType.RESIN2 },
                { label: t.resin + '3', value: BoardImageType.RESIN3 },
                { label: t.green, value: BoardImageType.GREEN },
                {
                  label: t.cherryBlossom,
                  value: BoardImageType.CHERRY_BLOSSOM,
                },
                { label: t.autumn, value: BoardImageType.AUTUMN },
                { label: t.snow, value: BoardImageType.SNOW },
                { label: t.darkGreen, value: BoardImageType.DARK_GREEN },
                { label: t.dark, value: BoardImageType.DARK },
                { label: t.customImage, value: BoardImageType.CUSTOM_IMAGE },
              ]"
              @change="
                (value: string) => {
                  update.boardImage = value as BoardImageType;
                }
              "
            />
          </div>
          <div
            v-show="(update.boardImage ?? original.boardImage) === BoardImageType.CUSTOM_IMAGE"
            class="form-item"
          >
            <div class="form-item-label-wide"></div>
            <ImageSelector
              class="image-selector"
              :default-url="original.boardImageFileURL"
              @select="(url: string) => (update.boardImageFileURL = url)"
            />
          </div>
          <!-- 駒台画像 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.pieceStand }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.pieceStandImage"
              :items="[
                { label: t.standard, value: PieceStandImageType.STANDARD },
                { label: t.green, value: PieceStandImageType.GREEN },
                {
                  label: t.cherryBlossom,
                  value: PieceStandImageType.CHERRY_BLOSSOM,
                },
                { label: t.autumn, value: PieceStandImageType.AUTUMN },
                { label: t.snow, value: PieceStandImageType.SNOW },
                { label: t.darkGreen, value: PieceStandImageType.DARK_GREEN },
                { label: t.dark, value: PieceStandImageType.DARK },
                {
                  label: t.customImage,
                  value: PieceStandImageType.CUSTOM_IMAGE,
                },
              ]"
              @change="
                (value: string) => {
                  update.pieceStandImage = value as PieceStandImageType;
                }
              "
            />
          </div>
          <div
            v-show="
              (update.pieceStandImage ?? original.pieceStandImage) ===
              PieceStandImageType.CUSTOM_IMAGE
            "
            class="form-item"
          >
            <div class="form-item-label-wide"></div>
            <ImageSelector
              class="image-selector"
              :default-url="original.pieceStandImageFileURL"
              @select="(url: string) => (update.pieceStandImageFileURL = url)"
            />
          </div>
          <!-- 透過表示 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.transparent }}</div>
            <ToggleButton
              :value="original.enableTransparent"
              @change="(checked: boolean) => (update.enableTransparent = checked)"
            />
          </div>
          <!-- 盤の不透明度 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.boardOpacity }}</div>
            <input
              :value="original.boardOpacity * 100"
              :readonly="!(update.enableTransparent ?? original.enableTransparent)"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.boardOpacity = readInputAsNumber(event.target as HTMLInputElement) / 100;
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- 駒台の不透明度 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.pieceStandOpacity }}</div>
            <input
              :value="original.pieceStandOpacity * 100"
              :readonly="!(update.enableTransparent ?? original.enableTransparent)"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.pieceStandOpacity =
                    readInputAsNumber(event.target as HTMLInputElement) / 100;
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- 棋譜の不透明度 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.recordOpacity }}</div>
            <input
              :value="original.recordOpacity * 100"
              :readonly="!(update.enableTransparent ?? original.enableTransparent)"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.recordOpacity = readInputAsNumber(event.target as HTMLInputElement) / 100;
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- 段・筋の表示 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.showFileAndRank }}
            </div>
            <ToggleButton
              :value="original.boardLabelType != BoardLabelType.NONE"
              @change="
                (checked: boolean) =>
                  (update.boardLabelType = checked ? BoardLabelType.STANDARD : BoardLabelType.NONE)
              "
            />
          </div>
          <!-- 左コントロールの表示 -->
          <div v-show="isNative()" class="form-item">
            <div class="form-item-label-wide">
              {{ t.showLeftControls }}
            </div>
            <ToggleButton
              :value="original.leftSideControlType != LeftSideControlType.NONE"
              @change="
                (checked: boolean) =>
                  (update.leftSideControlType = checked
                    ? LeftSideControlType.STANDARD
                    : LeftSideControlType.NONE)
              "
            />
          </div>
          <!-- 右コントロールの表示 -->
          <div v-show="isNative()" class="form-item">
            <div class="form-item-label-wide">
              {{ t.showRightControls }}
            </div>
            <ToggleButton
              :value="original.rightSideControlType != RightSideControlType.NONE"
              @change="
                (checked: boolean) =>
                  (update.rightSideControlType = checked
                    ? RightSideControlType.STANDARD
                    : RightSideControlType.NONE)
              "
            />
          </div>
          <!-- タブビューの形式 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.tabViewStyle }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.tabPaneType"
              :items="[
                { label: t.oneColumn, value: TabPaneType.SINGLE },
                { label: t.twoColumns, value: TabPaneType.DOUBLE },
              ]"
              @change="
                (value: string) => {
                  update.tabPaneType = value as TabPaneType;
                }
              "
            />
          </div>
        </div>
        <hr />
        <!-- 音 -->
        <div class="section">
          <div class="section-title">{{ t.sounds }}</div>
          <!-- 駒音の大きさ -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.pieceSoundVolume }}</div>
            <input
              :value="original.pieceVolume"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.pieceVolume = readInputAsNumber(event.target as HTMLInputElement);
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- 時計音の大きさ -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.clockSoundVolume }}</div>
            <input
              :value="original.clockVolume"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.clockVolume = readInputAsNumber(event.target as HTMLInputElement);
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- 時計音の高さ -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.clockSoundPitch }}</div>
            <input
              :value="original.clockPitch"
              type="number"
              max="880"
              min="220"
              @input="
                (event) => {
                  update.clockPitch = readInputAsNumber(event.target as HTMLInputElement);
                }
              "
            />
            <div class="form-item-small-label">Hz ({{ t.between(220, 880) }})</div>
          </div>
          <!-- 時計音の対象 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.clockSoundTarget }}
            </div>
            <HorizontalSelector
              class="selector"
              :value="original.clockSoundTarget"
              :items="[
                { label: t.anyTurn, value: ClockSoundTarget.ALL },
                { label: t.onlyHumanTurn, value: ClockSoundTarget.ONLY_USER },
              ]"
              @change="
                (value: string) => {
                  update.clockSoundTarget = value as ClockSoundTarget;
                }
              "
            />
          </div>
        </div>
        <hr />
        <!-- ファイル -->
        <div class="section">
          <div class="section-title">{{ t.file }}</div>
          <!-- デフォルトの保存形式 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.defaultRecordFileFormat }}
            </div>
            <HorizontalSelector
              class="selector"
              :value="original.defaultRecordFileFormat"
              :items="[
                { label: '.kif (Shift_JIS)', value: RecordFileFormat.KIF },
                { label: '.kifu (UTF-8)', value: RecordFileFormat.KIFU },
                { label: '.ki2 (Shift_JIS)', value: RecordFileFormat.KI2 },
                { label: '.ki2u (UTF-8)', value: RecordFileFormat.KI2U },
                { label: '.csa', value: RecordFileFormat.CSA },
                { label: '.jkf', value: RecordFileFormat.JKF },
              ]"
              @change="
                (value: string) => {
                  update.defaultRecordFileFormat = value as RecordFileFormat;
                }
              "
            />
          </div>
          <!-- 文字コード -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.textEncoding }}
            </div>
            <HorizontalSelector
              class="selector"
              :value="original.textDecodingRule"
              :items="[
                { label: t.strict, value: TextDecodingRule.STRICT },
                { label: t.autoDetect, value: TextDecodingRule.AUTO_DETECT },
              ]"
              @change="
                (value: string) => {
                  update.textDecodingRule = value as TextDecodingRule;
                }
              "
            />
          </div>
          <!-- 改行文字 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.newlineCharacter }}
            </div>
            <HorizontalSelector
              class="selector"
              :value="returnCodeToName[original.returnCode]"
              :items="[
                { label: 'CRLF (Windows)', value: 'crlf' },
                { label: 'LF (UNIX/Mac)', value: 'lf' },
                { label: `CR (${t.old90sMac})`, value: 'cr' },
              ]"
              @change="
                (value: string) => {
                  update.returnCode = nameToReturnCode[value];
                }
              "
            />
          </div>
          <!-- 自動保存先 -->
          <div class="form-item row">
            <div class="form-item-label-wide">
              {{ t.autoSavingDirectory }}
            </div>
            <input
              ref="autoSaveDirectory"
              class="file-path"
              :value="original.autoSaveDirectory"
              type="text"
              @input="
                (event) => {
                  update.autoSaveDirectory = (event.target as HTMLInputElement).value;
                }
              "
            />
            <button class="thin" @click="selectAutoSaveDirectory">
              {{ t.select }}
            </button>
            <button class="thin auxiliary" @click="onOpenAutoSaveDirectory">
              <Icon :icon="IconType.OPEN_FOLDER" />
            </button>
          </div>
          <!-- 棋譜ファイル名-->
          <div class="form-item row">
            <div class="form-item-label-wide">
              {{ t.recordFileName }}
            </div>
            <input
              class="file-path"
              :value="original.recordFileNameTemplate"
              type="text"
              @input="
                (event) => {
                  update.recordFileNameTemplate = (event.target as HTMLInputElement).value;
                }
              "
            />
            <button class="thin auxiliary" @click="howToWriteFileNameTemplate">
              <Icon :icon="IconType.HELP" />
            </button>
          </div>
          <!-- CSA V3 で出力 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.csaV3Output }}</div>
            <ToggleButton
              :value="original.useCSAV3"
              @change="(checked: boolean) => (update.useCSAV3 = checked)"
            />
          </div>
          <!-- USI の局面表記 -->
          <div class="form-item row">
            <div class="form-item-label-wide">{{ t.positionOfUSIOutput }}</div>
            <HorizontalSelector
              class="selector"
              :value="String(original.enableUSIFileStartpos)"
              :items="[
                { label: t.onlySFEN, value: 'false' },
                { label: 'startpos / SFEN', value: 'true' },
              ]"
              @change="
                (value: string) => {
                  update.enableUSIFileStartpos = value === 'true';
                }
              "
            />
          </div>
          <!-- USI の指し手表記 -->
          <div class="form-item row">
            <div class="form-item-label-wide">{{ t.movesOfUSIOutput }}</div>
            <HorizontalSelector
              class="selector"
              :value="String(original.enableUSIFileResign)"
              :items="[
                { label: t.onlySFEN, value: 'false' },
                { label: 'SFEN / resign', value: 'true' },
              ]"
              @change="
                (value: string) => {
                  update.enableUSIFileResign = value === 'true';
                }
              "
            />
          </div>
        </div>
        <hr />
        <!-- 定跡 -->
        <div class="section">
          <div class="section-title">{{ t.book }}</div>
          <!-- 読み専モード閾値 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.readOnlyThreshold }}</div>
            <input
              :value="original.bookOnTheFlyThresholdMB"
              type="number"
              max="4096"
              min="0"
              @input="
                (event) => {
                  update.bookOnTheFlyThresholdMB = readInputAsNumber(
                    event.target as HTMLInputElement,
                  );
                }
              "
            />
            <div class="form-item-small-label">MB ({{ t.between(0, 4096) }})</div>
          </div>
        </div>
        <hr />
        <!-- USI プロトコル -->
        <div class="section">
          <div class="section-title">{{ t.usiProtocol }}</div>
          <!-- オプション名を翻訳 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.translateOptionName }}
            </div>
            <ToggleButton
              :value="original.translateEngineOptionName"
              @change="(checked: boolean) => (update.translateEngineOptionName = checked)"
            />
            <div class="form-item-small-label">({{ t.functionalOnJapaneseOnly }})</div>
          </div>
          <!-- 最大起動待ち時間 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.maxStartupTime }}
            </div>
            <input
              :value="original.engineTimeoutSeconds"
              type="number"
              max="300"
              min="1"
              @input="
                (event) => {
                  update.engineTimeoutSeconds = readInputAsNumber(event.target as HTMLInputElement);
                }
              "
            />
            <div class="form-item-small-label">{{ t.secondsSuffix }} ({{ t.between(1, 300) }})</div>
          </div>
        </div>
        <hr />
        <!-- 評価値・推定勝率・読み筋 -->
        <div class="section">
          <div class="section-title">{{ t.evaluationAndEstimatedWinRateAndPV }}</div>
          <!-- 評価値の符号 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.signOfEvaluation }}
            </div>
            <HorizontalSelector
              class="selector"
              :value="original.evaluationViewFrom"
              :items="[
                { label: t.swapEachTurnChange, value: EvaluationViewFrom.EACH },
                {
                  label: t.alwaysSenteIsPositive,
                  value: EvaluationViewFrom.BLACK,
                },
              ]"
              @change="
                (value: string) => {
                  update.evaluationViewFrom = value as EvaluationViewFrom;
                }
              "
            />
          </div>
          <!-- 矢印の表示本数 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.maxArrows }}
            </div>
            <input
              :value="original.maxArrowsPerEngine"
              type="number"
              max="10"
              min="0"
              @input="
                (event) => {
                  update.maxArrowsPerEngine = readInputAsNumber(event.target as HTMLInputElement);
                }
              "
            />
            <div class="form-item-small-label">({{ t.between(0, 10) }})</div>
          </div>
          <!-- 勝率換算係数 -->
          <div class="form-item">
            <div class="form-item-label-wide">
              {{ t.winRateCoefficient }}
            </div>
            <input
              :value="original.coefficientInSigmoid"
              type="number"
              max="10000"
              min="1"
              @input="
                (event) => {
                  update.coefficientInSigmoid = readInputAsNumber(event.target as HTMLInputElement);
                }
              "
            />
            <div class="form-item-small-label">
              ({{ t.recommended }}: {{ t.between(600, 1500) }})
            </div>
          </div>
          <!-- 緩手の閾値 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.inaccuracyThreshold }}</div>
            <input
              :value="original.badMoveLevelThreshold1"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.badMoveLevelThreshold1 = readInputAsNumber(
                    event.target as HTMLInputElement,
                  );
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- 疑問手の閾値 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.dubiousThreshold }}</div>
            <input
              :value="original.badMoveLevelThreshold2"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.badMoveLevelThreshold2 = readInputAsNumber(
                    event.target as HTMLInputElement,
                  );
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- 悪手の閾値 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.mistakeThreshold }}</div>
            <input
              :value="original.badMoveLevelThreshold3"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.badMoveLevelThreshold3 = readInputAsNumber(
                    event.target as HTMLInputElement,
                  );
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- 大悪手の閾値 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.blunderThreshold }}</div>
            <input
              :value="original.badMoveLevelThreshold4"
              type="number"
              max="100"
              min="0"
              @input="
                (event) => {
                  update.badMoveLevelThreshold4 = readInputAsNumber(
                    event.target as HTMLInputElement,
                  );
                }
              "
            />
            <div class="form-item-small-label">%</div>
          </div>
          <!-- PV表示手数 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.maxPVLength }}</div>
            <input
              :value="original.maxPVTextLength"
              type="number"
              max="100"
              min="5"
              @input="
                (event) => {
                  update.maxPVTextLength = readInputAsNumber(event.target as HTMLInputElement);
                }
              "
            />
            <div class="form-item-small-label">({{ t.between(5, 100) }})</div>
            <button class="thin auxiliary" @click="whatIsMaxPVLengthSetting">
              <Icon :icon="IconType.HELP" />
            </button>
          </div>
          <!-- コメントの形式 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.commentFormat }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.searchCommentFormat"
              :items="[
                { label: t.shogiHome, value: SearchCommentFormat.SHOGIHOME },
                { label: 'Floodgate', value: SearchCommentFormat.FLOODGATE },
                { label: 'CSA V3', value: SearchCommentFormat.CSA3 },
                { label: 'ShogiGUI', value: SearchCommentFormat.SHOGIGUI },
              ]"
              @change="
                (value: string) => {
                  update.searchCommentFormat = value as SearchCommentFormat;
                }
              "
            />
          </div>
        </div>
        <hr />
        <!-- アプリバージョン -->
        <div class="section">
          <div class="section-title">{{ t.appVersion }}</div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.installed }}</div>
            {{ appInfo.appVersion }}
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.latest }}</div>
            {{ versionStatus.knownReleases?.latest.version ?? t.unknown }}
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.stable }}</div>
            {{ versionStatus.knownReleases?.stable.version ?? t.unknown }}
          </div>
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.notification }}</div>
            <button class="thin" @click="sendTestNotification">{{ t.notificationTest }}</button>
          </div>
          <div class="form-group warning">
            <div class="note">
              {{ t.whenNewVersionIsAvailableItWillBeNotified }}
              {{ t.pleaseCheckMessageThisIsTestNotificationByAboveButton }}
              {{ t.ifNotWorkYouShouldAllowNotificationOnOSSetting }}
            </div>
          </div>
        </div>
        <hr />
        <!-- 開発者向け -->
        <div class="section">
          <div class="section-title">{{ t.forDevelopers }}</div>
          <div class="form-group warning">
            <div v-if="!isNative()" class="note">
              {{ t.inBrowserLogsOutputToConsoleAndIgnoreThisSetting }}
            </div>
            <div v-if="isNative()" class="note">
              {{ t.shouldRestartToApplyLogSettings }}
            </div>
            <div v-if="isNative()" class="note">
              {{ t.canOpenLogDirectoryFromMenu }}
            </div>
            <div v-if="isNative()" class="note">
              {{ t.hasNoOldLogCleanUpFeature }}
            </div>
          </div>
          <!-- アプリログを出力 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.enableAppLog }}</div>
            <ToggleButton
              :value="original.enableAppLog"
              @change="(checked: boolean) => (update.enableAppLog = checked)"
            />
          </div>
          <!-- USI通信ログを出力 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.enableUSILog }}</div>
            <ToggleButton
              :value="original.enableUSILog"
              @change="(checked: boolean) => (update.enableUSILog = checked)"
            />
          </div>
          <!-- CSA通信ログを出力 -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.enableCSALog }}</div>
            <ToggleButton
              :value="original.enableCSALog"
              @change="(checked: boolean) => (update.enableCSALog = checked)"
            />
          </div>
          <!-- ログレベル -->
          <div class="form-item">
            <div class="form-item-label-wide">{{ t.logLevel }}</div>
            <HorizontalSelector
              class="selector"
              :value="original.logLevel"
              :items="[
                { label: 'DEBUG', value: LogLevel.DEBUG },
                { label: 'INFO', value: LogLevel.INFO },
                { label: 'WARN', value: LogLevel.WARN },
                { label: 'ERROR', value: LogLevel.ERROR },
              ]"
              @change="
                (value: string) => {
                  update.logLevel = value as LogLevel;
                }
              "
            />
          </div>
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="saveAndClose()">
          {{ t.saveAndClose }}
        </button>
        <button data-hotkey="Escape" @click="cancel()">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t, Language } from "@/common/i18n";
import { en } from "@/common/i18n/locales/en";
import {
  PieceImageType,
  BoardImageType,
  PieceStandImageType,
  BoardLabelType,
  LeftSideControlType,
  RightSideControlType,
  TabPaneType,
  EvaluationViewFrom,
  Thema,
  BackgroundImageType,
  TextDecodingRule,
  ClockSoundTarget,
  AppSettingsUpdate,
} from "@/common/settings/app";
import ImageSelector from "@/renderer/view/dialog/ImageSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { useStore } from "@/renderer/store";
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { readInputAsNumber } from "@/renderer/helpers/form.js";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import api, { appInfo, isNative } from "@/renderer/ipc/api";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useAppSettings } from "@/renderer/store/settings";
import { LogLevel } from "@/common/log";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { RecordFileFormat } from "@/common/file/record";
import { IconType } from "@/renderer/assets/icons";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { VersionStatus } from "@/common/version";
import { fileNameTemplateWikiPageURL, maxPVLengthSettingWikiPageURL } from "@/common/links/github";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { BoardLayoutType } from "@/common/settings/layout";
import { SearchCommentFormat } from "@/common/settings/comment";

const returnCodeToName: { [name: string]: string } = {
  "\r\n": "crlf",
  "\n": "lf",
  "\r": "cr",
};

const nameToReturnCode: { [name: string]: string } = {
  crlf: "\r\n",
  lf: "\n",
  cr: "\r",
};

const store = useStore();
const busyState = useBusyState();
const original = useAppSettings().clone;
const update = ref({} as AppSettingsUpdate);
const autoSaveDirectory = ref();
const dialog = ref();
const versionStatus = ref({} as VersionStatus);

onMounted(() => {
  showModalDialog(dialog.value, cancel);
  installHotKeyForDialog(dialog.value);
  api.getVersionStatus().then((status) => {
    versionStatus.value = status;
  });
  watch(
    update,
    (value) => {
      const ret = useAppSettings().setTemporaryUpdate(value);
      if (ret instanceof Promise) {
        busyState.retain();
        ret.finally(() => {
          busyState.release();
        });
      }
    },
    { deep: true },
  );
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
  useAppSettings().clearTemporaryUpdate();
});

const saveAndClose = async () => {
  busyState.retain();
  try {
    await useAppSettings().updateAppSettings(update.value);
    store.closeAppSettingsDialog();
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const selectAutoSaveDirectory = async () => {
  busyState.retain();
  try {
    const path = await api.showSelectDirectoryDialog(autoSaveDirectory.value.value);
    if (path) {
      autoSaveDirectory.value.value = update.value.autoSaveDirectory = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const onOpenAutoSaveDirectory = () => {
  api.openExplorer(autoSaveDirectory.value.value);
};

const howToWriteFileNameTemplate = () => {
  api.openWebBrowser(fileNameTemplateWikiPageURL);
};

const whatIsMaxPVLengthSetting = () => {
  api.openWebBrowser(maxPVLengthSettingWikiPageURL);
};

const sendTestNotification = () => {
  try {
    api.sendTestNotification();
  } catch (e) {
    useErrorStore().add(e);
  }
};

const cancel = () => {
  store.closeAppSettingsDialog();
};
</script>

<style scoped>
.settings {
  width: 590px;
  height: 540px;
}
.section {
  margin: 20px 0px 20px 0px;
}
.section-title {
  font-size: 1.1em;
}
input.toggle {
  height: 1em;
  width: 1em;
  margin-right: 10px;
}
input.file-path {
  width: 250px;
}
.image-selector {
  display: inline-block;
  width: 200px;
}
.selector {
  max-width: 400px;
}
button.auxiliary {
  margin-left: 5px;
  padding-left: 8px;
  padding-right: 8px;
}
</style>
