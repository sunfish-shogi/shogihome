export enum AppState {
  NORMAL = "normal",
  PASTE_DIALOG = "pasteDialog",
  POSITION_EDITING = "positionEditing",
  PIECE_SET_CHANGE_DIALOG = "pieceSetChangeDialog",
  EXPORT_POSITION_IMAGE_DIALOG = "exportBoardImageDialog",
  GAME_DIALOG = "gameDialog",
  GAME = "game",
  CSA_GAME_DIALOG = "csaGameDialog",
  CSA_GAME = "csaGame",
  ANALYSIS = "analysis",
  ANALYSIS_DIALOG = "analysisDialog",
  MATE_SEARCH = "mateSearch",
  MATE_SEARCH_DIALOG = "mateSearchDialog",
  USI_ENGINES_DIALOG = "usiEnginesDialog",
  RECORD_FILE_HISTORY_DIALOG = "recordFileHistoryDialog",
  BATCH_CONVERSION_DIALOG = "batchConversionDialog",
  LAUNCH_USI_ENGINE_DIALOG = "launchUsiEngineDialog",
  CONNECT_TO_CSA_SERVER_DIALOG = "connectToCsaServerDialog",
  LOAD_REMOTE_FILE_DIALOG = "loadRemoteFileDialog",
  SHARE_DIALOG = "shareDialog",
  ADD_BOOK_MOVES_DIALOG = "addBookMovesDialog",
}

export enum ResearchState {
  IDLE = "idle",
  STARTUP_DIALOG = "startupDialog",
  RUNNING = "running",
}
