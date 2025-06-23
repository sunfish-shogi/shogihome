<template>
  <DialogFrame limited @cancel="cancel">
    <div class="title">{{ t.appSettings }}</div>
    <div class="form-group scroll settings">
      <!-- 表示 -->
      <div class="section">
        <div class="section-title">{{ t.view }}</div>
        <!-- 言語 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.language }}</div>
          <HorizontalSelector
            v-model:value="update.language"
            class="selector"
            :items="[
              { label: '日本語', value: Language.JA },
              { label: 'English', value: Language.EN },
              { label: '繁體中文', value: Language.ZH_TW },
              { label: 'Tiếng Việt', value: Language.VI },
            ]"
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
            v-model:value="update.thema"
            class="selector"
            :items="[
              { label: t.green, value: Thema.STANDARD },
              { label: t.cherryBlossom, value: Thema.CHERRY_BLOSSOM },
              { label: t.autumn, value: Thema.AUTUMN },
              { label: t.snow, value: Thema.SNOW },
              { label: t.darkGreen, value: Thema.DARK_GREEN },
              { label: t.dark, value: Thema.DARK },
            ]"
          />
        </div>
        <!-- 背景画像 -->
        <div v-if="!isMobileWebApp()" class="form-item">
          <div class="form-item-label-wide">{{ t.backgroundImage }}</div>
          <HorizontalSelector
            v-model:value="update.backgroundImageType"
            class="selector"
            :items="[
              { label: t.none, value: BackgroundImageType.NONE },
              { label: t.bgCover, value: BackgroundImageType.COVER },
              { label: t.bgContain, value: BackgroundImageType.CONTAIN },
              { label: t.bgTile, value: BackgroundImageType.TILE },
            ]"
          />
        </div>
        <div v-show="update.backgroundImageType !== BackgroundImageType.NONE" class="form-item">
          <div class="form-item-label-wide"></div>
          <ImageSelector
            class="image-selector"
            :default-url="update.backgroundImageFileURL"
            @select="(url: string) => (update.backgroundImageFileURL = url)"
          />
        </div>
        <!-- 盤レイアウト -->
        <div v-if="!isMobileWebApp()" class="form-item">
          <div class="form-item-label-wide">{{ t.boardLayout }}</div>
          <HorizontalSelector
            v-model:value="update.boardLayoutType"
            class="selector"
            :items="[
              { label: t.standard, value: BoardLayoutType.STANDARD },
              { label: t.compact, value: BoardLayoutType.COMPACT },
              { label: t.portrait, value: BoardLayoutType.PORTRAIT },
            ]"
          />
        </div>
        <!-- 駒画像 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.piece }}</div>
          <HorizontalSelector
            v-model:value="update.pieceImage"
            class="selector"
            :items="
              [
                { label: t.singleKanjiPiece, value: PieceImageType.HITOMOJI },
                { label: t.singleKanjiWoodPiece, value: PieceImageType.HITOMOJI_WOOD },
                { label: t.singleKanjiGothicPiece, value: PieceImageType.HITOMOJI_GOTHIC },
                { label: t.singleKanjiDarkPiece, value: PieceImageType.HITOMOJI_DARK },
                {
                  label: t.singleKanjiGothicDarkPiece,
                  value: PieceImageType.HITOMOJI_GOTHIC_DARK,
                },
                { label: t.customImage, value: PieceImageType.CUSTOM_IMAGE },
              ].filter((item) => !isMobileWebApp() || item.value !== PieceImageType.CUSTOM_IMAGE)
            "
          />
          <div
            v-show="update.pieceImage === PieceImageType.CUSTOM_IMAGE"
            ref="pieceImageSelector"
            class="form-item"
          >
            <div class="form-item-label-wide"></div>
            <ImageSelector
              class="image-selector"
              :default-url="update.pieceImageFileURL"
              @select="(url: string) => (update.pieceImageFileURL = url)"
            />
          </div>
          <div v-show="update.pieceImage === PieceImageType.CUSTOM_IMAGE" class="form-item">
            <div class="form-item-label-wide"></div>
            <ToggleButton
              v-model:value="update.deletePieceImageMargin"
              :label="t.imageHasMarginsRemoveForLargerDisplay"
            />
          </div>
        </div>
        <!-- 盤画像 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.board }}</div>
          <HorizontalSelector
            v-model:value="update.boardImage"
            class="selector"
            :items="
              [
                { label: t.lightWoodyTexture(1), value: BoardImageType.LIGHT },
                { label: t.lightWoodyTexture(2), value: BoardImageType.LIGHT2 },
                { label: t.lightWoodyTexture(3), value: BoardImageType.LIGHT3 },
                { label: t.warmWoodTexture(1), value: BoardImageType.WARM },
                { label: t.warmWoodTexture(2), value: BoardImageType.WARM2 },
                { label: t.resin, value: BoardImageType.RESIN },
                { label: t.resin + '2', value: BoardImageType.RESIN2 },
                { label: t.resin + '3', value: BoardImageType.RESIN3 },
                { label: t.green, value: BoardImageType.GREEN },
                { label: t.cherryBlossom, value: BoardImageType.CHERRY_BLOSSOM },
                { label: t.autumn, value: BoardImageType.AUTUMN },
                { label: t.snow, value: BoardImageType.SNOW },
                { label: t.darkGreen, value: BoardImageType.DARK_GREEN },
                { label: t.dark, value: BoardImageType.DARK },
                { label: t.customImage, value: BoardImageType.CUSTOM_IMAGE },
              ].filter((item) => !isMobileWebApp() || item.value !== BoardImageType.CUSTOM_IMAGE)
            "
          />
        </div>
        <div v-show="update.boardImage === BoardImageType.CUSTOM_IMAGE" class="form-item">
          <div class="form-item-label-wide"></div>
          <ImageSelector
            class="image-selector"
            :default-url="update.boardImageFileURL"
            @select="(url: string) => (update.boardImageFileURL = url)"
          />
        </div>
        <!-- マス目 -->
        <div class="form-item">
          <div class="form-item-label-wide">マス目</div>
          <ToggleButton
            v-once
            :value="!!update.boardGridColor"
            label="色を選択"
            @update:value="(value) => (update.boardGridColor = value ? 'black' : null)"
          />
          <input
            v-show="update.boardGridColor"
            v-model="update.boardGridColor"
            class="color-selector"
            type="color"
          />
        </div>
        <!-- 駒台画像 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.pieceStand }}</div>
          <HorizontalSelector
            v-model:value="update.pieceStandImage"
            class="selector"
            :items="
              [
                { label: t.standard, value: PieceStandImageType.STANDARD },
                { label: t.woodTexture, value: PieceStandImageType.DARK_WOOD },
                { label: t.green, value: PieceStandImageType.GREEN },
                { label: t.cherryBlossom, value: PieceStandImageType.CHERRY_BLOSSOM },
                { label: t.autumn, value: PieceStandImageType.AUTUMN },
                { label: t.snow, value: PieceStandImageType.SNOW },
                { label: t.darkGreen, value: PieceStandImageType.DARK_GREEN },
                { label: t.dark, value: PieceStandImageType.DARK },
                { label: t.customImage, value: PieceStandImageType.CUSTOM_IMAGE },
              ].filter(
                (item) => !isMobileWebApp() || item.value !== PieceStandImageType.CUSTOM_IMAGE,
              )
            "
          />
        </div>
        <div v-show="update.pieceStandImage === PieceStandImageType.CUSTOM_IMAGE" class="form-item">
          <div class="form-item-label-wide"></div>
          <ImageSelector
            class="image-selector"
            :default-url="update.pieceStandImageFileURL"
            @select="(url: string) => (update.pieceStandImageFileURL = url)"
          />
        </div>
        <!-- 透過表示 -->
        <div v-if="!isMobileWebApp()" class="form-item">
          <div class="form-item-label-wide">{{ t.transparent }}</div>
          <ToggleButton v-model:value="update.enableTransparent" />
        </div>
        <!-- 盤の不透明度 -->
        <div v-if="!isMobileWebApp()" class="form-item">
          <div class="form-item-label-wide">{{ t.boardOpacity }}</div>
          <input
            v-model.number="update.boardOpacity"
            :readonly="!update.enableTransparent"
            type="number"
            max="100"
            min="0"
          />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- 駒台の不透明度 -->
        <div v-if="!isMobileWebApp()" class="form-item">
          <div class="form-item-label-wide">{{ t.pieceStandOpacity }}</div>
          <input
            v-model.number="update.pieceStandOpacity"
            :readonly="!update.enableTransparent"
            type="number"
            max="100"
            min="0"
          />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- 棋譜の不透明度 -->
        <div v-if="!isMobileWebApp()" class="form-item">
          <div class="form-item-label-wide">{{ t.recordOpacity }}</div>
          <input
            v-model.number="update.recordOpacity"
            :readonly="!update.enableTransparent"
            type="number"
            max="100"
            min="0"
          />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- 成・不成の表示 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.promotionSelector }}
          </div>
          <HorizontalSelector
            v-model:value="update.promotionSelectorStyle"
            class="selector"
            :items="[
              {
                label: t.centeredHorizontal,
                value: PromotionSelectorStyle.HORIZONTAL,
              },
              {
                label: t.promoteFirstVertical,
                value: PromotionSelectorStyle.VERTICAL_PREFER_BOTTOM,
              },
              {
                label: t.promoteFirstHorizontal,
                value: PromotionSelectorStyle.HORIZONTAL_PREFER_RIGHT,
              },
            ]"
          />
        </div>
        <!-- 段・筋の表示 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.showFileAndRank }}
          </div>
          <ToggleButton
            v-once
            :value="update.boardLabelType != BoardLabelType.NONE"
            @update:value="
              (checked: boolean) =>
                (update.boardLabelType = checked ? BoardLabelType.STANDARD : BoardLabelType.NONE)
            "
          />
        </div>
        <!-- 左コントロールの表示 -->
        <div v-if="isNative()" class="form-item">
          <div class="form-item-label-wide">
            {{ t.showLeftControls }}
          </div>
          <ToggleButton
            v-once
            :value="update.leftSideControlType != LeftSideControlType.NONE"
            @update:value="
              (checked: boolean) =>
                (update.leftSideControlType = checked
                  ? LeftSideControlType.STANDARD
                  : LeftSideControlType.NONE)
            "
          />
        </div>
        <!-- 右コントロールの表示 -->
        <div v-if="isNative()" class="form-item">
          <div class="form-item-label-wide">
            {{ t.showRightControls }}
          </div>
          <ToggleButton
            v-once
            :value="update.rightSideControlType != RightSideControlType.NONE"
            @update:value="
              (checked: boolean) =>
                (update.rightSideControlType = checked
                  ? RightSideControlType.STANDARD
                  : RightSideControlType.NONE)
            "
          />
        </div>
        <!-- タブビューの形式 -->
        <div v-if="!isMobileWebApp()" class="form-item">
          <div class="form-item-label-wide">{{ t.tabViewStyle }}</div>
          <HorizontalSelector
            v-model:value="update.tabPaneType"
            class="selector"
            :items="[
              { label: t.oneColumn, value: TabPaneType.SINGLE },
              { label: t.twoColumns, value: TabPaneType.DOUBLE },
              { label: `${t.twoColumns} v2`, value: TabPaneType.DOUBLE_V2 },
            ]"
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
          <input v-model.number="update.pieceVolume" type="number" max="100" min="0" />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- 時計音の大きさ -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.clockSoundVolume }}</div>
          <input v-model.number="update.clockVolume" type="number" max="100" min="0" />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- 時計音の高さ -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.clockSoundPitch }}</div>
          <input v-model.number="update.clockPitch" type="number" max="880" min="220" />
          <div class="form-item-small-label">Hz ({{ t.between(220, 880) }})</div>
        </div>
        <!-- 時計音の対象 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.clockSoundTarget }}
          </div>
          <HorizontalSelector
            v-model:value="update.clockSoundTarget"
            class="selector"
            :items="[
              { label: t.anyTurn, value: ClockSoundTarget.ALL },
              { label: t.onlyHumanTurn, value: ClockSoundTarget.ONLY_USER },
            ]"
          />
        </div>
      </div>
      <hr />
      <!-- ショートカット -->
      <div class="section">
        <div class="section-title">{{ t.shortcutKeys }}</div>
        <!-- 棋譜 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.record }}</div>
          <HorizontalSelector
            v-model:value="update.recordShortcutKeys"
            class="selector"
            :items="[
              { label: t.useUpDownToMove1Ply, value: RecordShortcutKeys.VERTICAL },
              { label: t.useLeftRightToMove1Ply, value: RecordShortcutKeys.HORIZONTAL },
            ]"
          />
        </div>
      </div>
      <hr />
      <!-- ファイル -->
      <div class="section">
        <div class="section-title">{{ t.file }}</div>
        <!-- デフォルトの保存形式 -->
        <div v-if="!isMobileWebApp()" class="form-item">
          <div class="form-item-label-wide">
            {{ t.defaultRecordFileFormat }}
          </div>
          <HorizontalSelector
            v-model:value="update.defaultRecordFileFormat"
            class="selector"
            :items="[
              { label: '.kif (Shift_JIS)', value: RecordFileFormat.KIF },
              { label: '.kifu (UTF-8)', value: RecordFileFormat.KIFU },
              { label: '.ki2 (Shift_JIS)', value: RecordFileFormat.KI2 },
              { label: '.ki2u (UTF-8)', value: RecordFileFormat.KI2U },
              { label: '.csa', value: RecordFileFormat.CSA },
              { label: '.jkf', value: RecordFileFormat.JKF },
            ]"
          />
        </div>
        <!-- 文字コード -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.textEncoding }}
          </div>
          <HorizontalSelector
            v-model:value="update.textDecodingRule"
            class="selector"
            :items="[
              { label: t.strict, value: TextDecodingRule.STRICT },
              { label: t.autoDetect, value: TextDecodingRule.AUTO_DETECT },
            ]"
          />
        </div>
        <!-- 改行文字 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.newlineCharacter }}
          </div>
          <HorizontalSelector
            v-model:value="update.returnCode"
            class="selector"
            :items="[
              { label: 'CRLF (Windows)', value: '\r\n' },
              { label: 'LF (UNIX/Mac)', value: '\n' },
              { label: `CR (${t.old90sMac})`, value: '\r' },
            ]"
          />
        </div>
        <!-- 自動保存先 -->
        <div v-if="!isMobileWebApp()" class="form-item row">
          <div class="form-item-label-wide">
            {{ t.autoSavingDirectory }}
          </div>
          <input v-model="update.autoSaveDirectory" class="file-path" type="text" />
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
          <input v-model="update.recordFileNameTemplate" class="file-path" type="text" />
          <button class="thin auxiliary" @click="howToWriteFileNameTemplate">
            <Icon :icon="IconType.HELP" />
          </button>
        </div>
        <!-- CSA V3 で出力 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.csaV3Output }}</div>
          <ToggleButton v-model:value="update.useCSAV3" />
        </div>
        <!-- USI の局面表記 -->
        <div class="form-item row">
          <div class="form-item-label-wide">{{ t.positionOfUSIOutput }}</div>
          <HorizontalSelector
            v-once
            class="selector"
            :value="String(update.enableUSIFileStartpos)"
            :items="[
              { label: t.onlySFEN, value: 'false' },
              { label: 'startpos / SFEN', value: 'true' },
            ]"
            @update:value="
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
            :value="String(update.enableUSIFileResign)"
            :items="[
              { label: t.onlySFEN, value: 'false' },
              { label: 'SFEN / resign', value: 'true' },
            ]"
            @update:value="
              (value: string) => {
                update.enableUSIFileResign = value === 'true';
              }
            "
          />
        </div>
        <!-- 貼り付けダイアログを表示 -->
        <div v-if="isNative()" class="form-item">
          <div class="form-item-label-wide">{{ t.pasteDialog }}</div>
          <ToggleButton v-model:value="update.showPasteDialog" />
        </div>
      </div>
      <hr v-if="!isMobileWebApp()" />
      <!-- 定跡 -->
      <div v-if="!isMobileWebApp()" class="section">
        <div class="section-title">{{ t.book }}</div>
        <!-- 読み専モード閾値 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.readOnlyThreshold }}</div>
          <input v-model.number="update.bookOnTheFlyThresholdMB" type="number" max="4096" min="0" />
          <div class="form-item-small-label">MB ({{ t.between(0, 4096) }})</div>
        </div>
      </div>
      <hr v-if="!isMobileWebApp()" />
      <!-- USI プロトコル -->
      <div v-if="!isMobileWebApp()" class="section">
        <div class="section-title">{{ t.usiProtocol }}</div>
        <!-- オプション名を翻訳 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.translateOptionName }}
          </div>
          <ToggleButton v-model:value="update.translateEngineOptionName" />
          <div class="form-item-small-label">({{ t.functionalOnJapaneseOnly }})</div>
        </div>
        <!-- 最大起動待ち時間 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.maxStartupTime }}
          </div>
          <input v-model.number="update.engineTimeoutSeconds" type="number" max="300" min="1" />
          <div class="form-item-small-label">{{ t.secondsSuffix }} ({{ t.between(1, 300) }})</div>
        </div>
        <!-- ノード数表記 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.nodeCountFormat }}</div>
          <HorizontalSelector
            v-model:value="update.nodeCountFormat"
            class="selector"
            :items="[
              { label: t.plainNumber, value: NodeCountFormat.PLAIN },
              { label: t.commaSeparated, value: NodeCountFormat.COMMA_SEPARATED },
              { label: t.compact, value: NodeCountFormat.COMPACT },
              { label: '日本語', value: NodeCountFormat.JAPANESE },
            ]"
          />
        </div>
      </div>
      <hr v-if="!isMobileWebApp()" />
      <!-- 評価値・期待勝率・読み筋 -->
      <div v-if="!isMobileWebApp()" class="section">
        <div class="section-title">{{ t.evaluationAndEstimatedWinRateAndPV }}</div>
        <!-- 評価値の符号 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.signOfEvaluation }}
          </div>
          <HorizontalSelector
            v-model:value="update.evaluationViewFrom"
            class="selector"
            :items="[
              { label: t.swapEachTurnChange, value: EvaluationViewFrom.EACH },
              {
                label: t.alwaysSenteIsPositive,
                value: EvaluationViewFrom.BLACK,
              },
            ]"
          />
        </div>
        <!-- 矢印の表示本数 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.maxArrows }}
          </div>
          <input v-model.number="update.maxArrowsPerEngine" type="number" max="10" min="0" />
          <div class="form-item-small-label">({{ t.between(0, 10) }})</div>
        </div>
        <!-- 勝率換算係数 -->
        <div class="form-item">
          <div class="form-item-label-wide">
            {{ t.winRateCoefficient }}
          </div>
          <input v-model.number="update.coefficientInSigmoid" type="number" max="10000" min="1" />
          <div class="form-item-small-label">({{ t.recommended }}: {{ t.between(600, 1500) }})</div>
        </div>
        <!-- 緩手の閾値 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.inaccuracyThreshold }}</div>
          <input v-model.number="update.badMoveLevelThreshold1" type="number" max="100" min="0" />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- 疑問手の閾値 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.dubiousThreshold }}</div>
          <input v-model.number="update.badMoveLevelThreshold2" type="number" max="100" min="0" />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- 悪手の閾値 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.mistakeThreshold }}</div>
          <input v-model.number="update.badMoveLevelThreshold3" type="number" max="100" min="0" />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- 大悪手の閾値 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.blunderThreshold }}</div>
          <input v-model.number="update.badMoveLevelThreshold4" type="number" max="100" min="0" />
          <div class="form-item-small-label">%</div>
        </div>
        <!-- PV表示手数 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.maxPVLength }}</div>
          <input v-model.number="update.maxPVTextLength" type="number" max="100" min="5" />
          <div class="form-item-small-label">({{ t.between(5, 100) }})</div>
          <button class="thin auxiliary" @click="whatIsMaxPVLengthSetting">
            <Icon :icon="IconType.HELP" />
          </button>
        </div>
        <!-- コメントの形式 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.commentFormat }}</div>
          <HorizontalSelector
            v-model:value="update.searchCommentFormat"
            class="selector"
            :items="[
              { label: t.shogiHome, value: SearchCommentFormat.SHOGIHOME },
              { label: 'Floodgate', value: SearchCommentFormat.FLOODGATE },
              { label: 'CSA V3', value: SearchCommentFormat.CSA3 },
              { label: 'ShogiGUI', value: SearchCommentFormat.SHOGIGUI },
            ]"
          />
        </div>
      </div>
      <hr v-if="!isMobileWebApp()" />
      <!-- アプリバージョン -->
      <div v-if="!isMobileWebApp()" class="section">
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
      <hr v-if="!isMobileWebApp()" />
      <!-- 開発者向け -->
      <div v-if="!isMobileWebApp()" class="section">
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
          <ToggleButton v-model:value="update.enableAppLog" />
        </div>
        <!-- USI通信ログを出力 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.enableUSILog }}</div>
          <ToggleButton v-model:value="update.enableUSILog" />
        </div>
        <!-- CSA通信ログを出力 -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.enableCSALog }}</div>
          <ToggleButton v-model:value="update.enableCSALog" />
        </div>
        <!-- ログレベル -->
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.logLevel }}</div>
          <HorizontalSelector
            v-model:value="update.logLevel"
            class="selector"
            :items="[
              { label: 'DEBUG', value: LogLevel.DEBUG },
              { label: 'INFO', value: LogLevel.INFO },
              { label: 'WARN', value: LogLevel.WARN },
              { label: 'ERROR', value: LogLevel.ERROR },
            ]"
          />
        </div>
        <div v-if="isNative()" class="form-group warning">
          <div class="note">
            {{ t.shouldRestartToApplyLowLevelSettings }}
          </div>
        </div>
        <!-- ハードウェアアクセラレーション無効化 -->
        <div v-if="isNative()" class="form-item">
          <div class="form-item-label-wide">Enable HWA</div>
          <ToggleButton v-model:value="update.enableHardwareAcceleration" />
          <button class="thin auxiliary" @click="aboutDisableHWASetting">
            <Icon :icon="IconType.HELP" />
          </button>
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
  </DialogFrame>
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
  PromotionSelectorStyle,
  RightSideControlType,
  TabPaneType,
  EvaluationViewFrom,
  Thema,
  BackgroundImageType,
  TextDecodingRule,
  ClockSoundTarget,
  AppSettingsUpdate,
  NodeCountFormat,
  RecordShortcutKeys,
} from "@/common/settings/app";
import ImageSelector from "@/renderer/view/dialog/ImageSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { useStore } from "@/renderer/store";
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import api, { appInfo, isMobileWebApp, isNative } from "@/renderer/ipc/api";
import { useAppSettings } from "@/renderer/store/settings";
import { LogLevel } from "@/common/log";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { RecordFileFormat } from "@/common/file/record";
import { IconType } from "@/renderer/assets/icons";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { VersionStatus } from "@/common/version";
import {
  disableHWASettingWikiPageURL,
  fileNameTemplateWikiPageURL,
  maxPVLengthSettingWikiPageURL,
} from "@/common/links/github";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { BoardLayoutType } from "@/common/settings/layout";
import { SearchCommentFormat } from "@/common/settings/comment";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const busyState = useBusyState();
const org = useAppSettings();
const update = ref({
  // この画面で扱う要素だけをコピー
  language: org.language,
  thema: org.thema,
  backgroundImageType: org.backgroundImageType,
  backgroundImageFileURL: org.backgroundImageFileURL,
  boardLayoutType: org.boardLayoutType,
  pieceImage: org.pieceImage,
  pieceImageFileURL: org.pieceImageFileURL,
  deletePieceImageMargin: org.deletePieceImageMargin,
  boardImage: org.boardImage,
  boardImageFileURL: org.boardImageFileURL,
  boardGridColor: org.boardGridColor,
  pieceStandImage: org.pieceStandImage,
  pieceStandImageFileURL: org.pieceStandImageFileURL,
  enableTransparent: org.enableTransparent,
  boardOpacity: Math.round(org.boardOpacity * 100),
  pieceStandOpacity: Math.round(org.pieceStandOpacity * 100),
  recordOpacity: Math.round(org.recordOpacity * 100),
  promotionSelectorStyle: org.promotionSelectorStyle,
  boardLabelType: org.boardLabelType,
  leftSideControlType: org.leftSideControlType,
  rightSideControlType: org.rightSideControlType,
  tabPaneType: org.tabPaneType,
  pieceVolume: org.pieceVolume,
  clockVolume: org.clockVolume,
  clockPitch: org.clockPitch,
  clockSoundTarget: org.clockSoundTarget,
  recordShortcutKeys: org.recordShortcutKeys,
  defaultRecordFileFormat: org.defaultRecordFileFormat,
  textDecodingRule: org.textDecodingRule,
  returnCode: org.returnCode,
  autoSaveDirectory: org.autoSaveDirectory,
  recordFileNameTemplate: org.recordFileNameTemplate,
  useCSAV3: org.useCSAV3,
  enableUSIFileStartpos: org.enableUSIFileStartpos,
  enableUSIFileResign: org.enableUSIFileResign,
  showPasteDialog: org.showPasteDialog,
  bookOnTheFlyThresholdMB: org.bookOnTheFlyThresholdMB,
  translateEngineOptionName: org.translateEngineOptionName,
  engineTimeoutSeconds: org.engineTimeoutSeconds,
  nodeCountFormat: org.nodeCountFormat,
  evaluationViewFrom: org.evaluationViewFrom,
  maxArrowsPerEngine: org.maxArrowsPerEngine,
  coefficientInSigmoid: org.coefficientInSigmoid,
  badMoveLevelThreshold1: org.badMoveLevelThreshold1,
  badMoveLevelThreshold2: org.badMoveLevelThreshold2,
  badMoveLevelThreshold3: org.badMoveLevelThreshold3,
  badMoveLevelThreshold4: org.badMoveLevelThreshold4,
  maxPVTextLength: org.maxPVTextLength,
  searchCommentFormat: org.searchCommentFormat,
  enableAppLog: org.enableAppLog,
  enableUSILog: org.enableUSILog,
  enableCSALog: org.enableCSALog,
  logLevel: org.logLevel,
  enableHardwareAcceleration: org.enableHardwareAcceleration,
});
const versionStatus = ref({} as VersionStatus);

function reverseFormat(source: AppSettingsUpdate): AppSettingsUpdate {
  return {
    ...source,
    boardOpacity: Math.max(0, Math.min(100, source.boardOpacity! / 100)),
    pieceStandOpacity: Math.max(0, Math.min(100, source.pieceStandOpacity! / 100)),
    recordOpacity: Math.max(0, Math.min(100, source.recordOpacity! / 100)),
    pieceVolume: Math.max(0, Math.min(100, source.pieceVolume!)),
    clockVolume: Math.max(0, Math.min(100, source.clockVolume!)),
    clockPitch: Math.max(220, Math.min(880, source.clockPitch!)),
  };
}

onMounted(() => {
  api.getVersionStatus().then((status) => {
    versionStatus.value = status;
  });
  watch(
    update,
    (value) => {
      const ret = useAppSettings().setTemporaryUpdate(reverseFormat(value));
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
  useAppSettings().clearTemporaryUpdate();
});

const saveAndClose = async () => {
  busyState.retain();
  try {
    await useAppSettings().updateAppSettings(reverseFormat(update.value));
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
    const path = await api.showSelectDirectoryDialog(update.value.autoSaveDirectory);
    if (path) {
      update.value.autoSaveDirectory = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const onOpenAutoSaveDirectory = () => {
  api.openExplorer(update.value.autoSaveDirectory);
};

const howToWriteFileNameTemplate = () => {
  api.openWebBrowser(fileNameTemplateWikiPageURL);
};

const whatIsMaxPVLengthSetting = () => {
  api.openWebBrowser(maxPVLengthSettingWikiPageURL);
};

const aboutDisableHWASetting = () => {
  api.openWebBrowser(disableHWASettingWikiPageURL);
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
  max-width: 590px;
  max-height: 540px;
}
.section {
  margin: 20px 0px 20px 0px;
}
.section-title {
  font-size: 1.1em;
}
input.file-path {
  width: 250px;
}
.image-selector {
  display: inline-block;
  width: 200px;
}
.color-selector {
  display: inline-block;
  height: 24px;
  margin-left: 5px;
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
