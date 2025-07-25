export enum Background {
  FETCH_PROCESS_ARGS = "fetchProcessArgs",
  UPDATE_APP_STATE = "updateAppState",
  OPEN_EXPLORER = "openExplorer",
  OPEN_WEB_BROWSER = "openWebBrowser",
  SHOW_OPEN_RECORD_DIALOG = "showOpenRecordDialog",
  OPEN_RECORD = "openRecord",
  SHOW_SAVE_RECORD_DIALOG = "showSaveRecordDialog",
  SAVE_RECORD = "saveRecord",
  SHOW_SELECT_FILE_DIALOG = "showSelectFileDialog",
  SHOW_SELECT_DIRECTORY_DIALOG = "showSelectDirectoryDialog",
  SHOW_SELECT_IMAGE_DIALOG = "showSelectImageDialog",
  SHOW_SAVE_MERGED_RECORD_DIALOG = "showSaveMergedRecordDialog",
  LOAD_REMOTE_TEXT_FILE = "loadRemoteTextFile",
  CROP_PIECE_IMAGE = "cropPieceImage",
  EXPORT_CAPTURE_AS_PNG = "exportCaptureAsPNG",
  EXPORT_CAPTURE_AS_JPEG = "exportCaptureAsJPEG",
  CONVERT_RECORD_FILES = "convertRecordFiles",
  SHOW_SELECT_SFEN_DIALOG = "showSelectSFENDialog",
  LOAD_SFEN_FILE = "loadSFENFile",
  LOAD_APP_SETTINGS = "loadAppSettings",
  SAVE_APP_SETTINGS = "saveAppSettings",
  LOAD_BATCH_CONVERSION_SETTINGS = "loadBatchConversionSettings",
  SAVE_BATCH_CONVERSION_SETTINGS = "saveBatchConversionSettings",
  LOAD_RESEARCH_SETTINGS = "loadResearchSettings",
  SAVE_RESEARCH_SETTINGS = "saveResearchSettings",
  LOAD_ANALYSIS_SETTINGS = "loadAnalysisSettings",
  SAVE_ANALYSIS_SETTINGS = "saveAnalysisSettings",
  LOAD_GAME_SETTINGS = "loadGameSettings",
  SAVE_GAME_SETTINGS = "saveGameSettings",
  LOAD_CSA_GAME_SETTINGS_HISTORY = "loadCSAGameSettingsHistory",
  SAVE_CSA_GAME_SETTINGS_HISTORY = "saveCSAGameSettingsHistory",
  LOAD_MATE_SEARCH_SETTINGS = "loadMateSearchSettings",
  SAVE_MATE_SEARCH_SETTINGS = "saveMateSearchSettings",
  LOAD_RECORD_FILE_HISTORY = "loadRecordFileHistory",
  ADD_RECORD_FILE_HISTORY = "addRecordFileHistory",
  CLEAR_RECORD_FILE_HISTORY = "clearRecordFileHistory",
  SAVE_RECORD_FILE_BACKUP = "saveRecordFileBackup",
  LOAD_RECORD_FILE_BACKUP = "loadRecordFileBackup",
  SHOW_OPEN_BOOK_DIALOG = "showOpenBookDialog",
  SHOW_SAVE_BOOK_DIALOG = "showSaveBookDialog",
  CLEAR_BOOK = "clearBook",
  OPEN_BOOK = "openBook",
  SAVE_BOOK = "saveBook",
  SEARCH_BOOK_MOVES = "searchBookMoves",
  UPDATE_BOOK_MOVE = "updateBookMove",
  REMOVE_BOOK_MOVE = "removeBookMove",
  UPDATE_BOOK_MOVE_ORDER = "updateBookMoveOrder",
  IMPORT_BOOK_MOVES = "importBookMoves",
  LOAD_LAYOUT_PROFILE_LIST = "loadLayoutProfileList",
  UPDATE_LAYOUT_PROFILE_LIST = "updateLayoutProfileList",
  LOAD_USI_ENGINES = "loadUSIEngines",
  SAVE_USI_ENGINES = "saveUSIEngines",
  LOAD_BOOK_IMPORT_SETTINGS = "loadBookImportSettings",
  SAVE_BOOK_IMPORT_SETTINGS = "saveBookImportSettings",
  SHOW_SELECT_USI_ENGINE_DIALOG = "showSelectUSIEngineDialog",
  GET_USI_ENGINE_INFO = "getUSIEngineInfo",
  SEND_USI_OPTION_BUTTON_SIGNAL = "sendUSIOptionButtonSignal",
  LAUNCH_USI = "usiLaunch",
  USI_READY = "usiReady",
  USI_SET_OPTION = "usiSetOption",
  USI_GO = "usiGo",
  USI_GO_PONDER = "usiGoPonder",
  USI_GO_PONDER_HIT = "usiGoPonderHit",
  USI_GO_INFINITE = "usiGoInfinite",
  USI_GO_MATE = "usiGoMate",
  USI_STOP = "usiStop",
  USI_GAMEOVER = "usiGameover",
  USI_QUIT = "usiQuit",
  CSA_LOGIN = "csaLogin",
  CSA_LOGOUT = "csaLogout",
  CSA_AGREE = "csaAgree",
  CSA_MOVE = "csaMove",
  CSA_RESIGN = "csaResign",
  CSA_WIN = "csaWin",
  CSA_STOP = "csaStop",
  COLLECT_SESSION_STATES = "collectSessionStates",
  SETUP_PROMPT = "setupPrompt",
  OPEN_PROMPT = "openPrompt",
  INVOKE_PROMPT_COMMAND = "invokePromptCommand",
  IS_ENCRYPTION_AVAILABLE = "isEncryptionAvailable",
  GET_VERSION_STATUS = "getVersionStatus",
  SEND_TEST_NOTIFICATION = "sendTestNotification",
  OPEN_LOG_FILE = "openLogFile",
  LOG = "log",
  ON_CLOSABLE = "onClosable",
}

export enum Renderer {
  CLOSE = "close",
  SEND_ERROR = "sendError",
  SEND_MESSAGE = "sendMessage",
  MENU_EVENT = "menuEvent",
  UPDATE_APP_SETTINGS = "updateAppSettings",
  OPEN_RECORD = "openRecord",
  USI_BEST_MOVE = "usiBestMove",
  USI_CHECKMATE = "usiCheckmate",
  USI_CHECKMATE_NOT_IMPLEMENTED = "usiCheckmateNotImplemented",
  USI_CHECKMATE_TIMEOUT = "usiCheckmateTimeout",
  USI_NO_MATE = "usiNoMate",
  USI_INFO = "usiInfo",
  CSA_GAME_SUMMARY = "csaGameSummary",
  CSA_REJECT = "csaReject",
  CSA_START = "csaStart",
  CSA_MOVE = "csaMove",
  CSA_GAME_RESULT = "csaGameResult",
  CSA_CLOSE = "csaClose",
  PROMPT_COMMAND = "promptCommand",
  UPDATE_LAYOUT_PROFILE = "updateLayoutProfile",
  PROGRESS = "progress",
}
