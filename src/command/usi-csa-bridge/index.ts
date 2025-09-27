// --------------------------------------------------------------------------------
// Phase-1. コマンドライン引数を読み込みます。
// --------------------------------------------------------------------------------

import { ArgumentsParser } from "@/command/common/arguments";
import { LogLevel } from "@/common/log";
import { Language } from "@/common/i18n/index";
const argParser = new ArgumentsParser("usi-csa-bridge", [
  "path/to/csa_game_config.yaml",
  "path/to/csa_game_config.json",
  "--base64 <base64>",
]);
const base64 = argParser.valueOrNull("base64", "Base64 of gzip compressed JSON config.");
const engineTimeout = argParser.number(
  "engine-timeout",
  "Maximum time[seconds] of USI engine execution.",
  180,
  { min: 1 },
);
const protocolVersion = argParser.valueOrNull(
  "protocol-version",
  "Overwrite server.protocolVersion setting.",
);
const host = argParser.valueOrNull("host", "Overwrite server.host setting.");
const port = argParser.numberOrNull("port", "Overwrite server.port setting.", {
  min: 1024,
  max: 49151,
});
const id = argParser.valueOrNull("id", "Overwrite server.id setting.");
const password = argParser.valueOrNull("password", "Overwrite server.password setting.");
const saveRecordFile = argParser.flag("save-record", "Save record file after game end.");
const recordDir = argParser.value("record-dir", "Directory to save records.", "records");
const recordFileNameTemplate = argParser.valueOrNull(
  "record-file-name-template",
  "Overwrite recordFileNameTemplate setting.",
);
const recordFileFormat = argParser.valueOrNull(
  "record-file-format",
  "Overwrite recordFileFormat setting.",
);
const returnCodeName = argParser.value(
  "return-code",
  "Return code which one of LF or CRLF. It is used for record file.",
  process.platform === "win32" ? "CRLF" : "LF",
  ["LF", "CRLF"],
);
const useCSAV3 = argParser.flag("csa-v3", "Use CSA V3 format for record file.");
const repeat = argParser.numberOrNull("repeat", "Overwrite repeat setting.", { min: 1 });
const enableAppLogFile = argParser.flag("app-log-file", "Enable application log file.");
const enableUSILogFile = argParser.flag("usi-log-file", "Enable USI log file.");
const enableCSALogFile = argParser.flag("csa-log-file", "Enable CSA log file.");
const enableAllLogFile = argParser.flag("all-log-file", "Enable all log files.");
const disableStdoutLog = argParser.flag(
  "disable-stdout-log",
  "Disable stdout log. Should be used with --XXX-log-file.",
);
const logLevel = argParser.value(
  "log-level",
  `Log level which one of: ${Object.values(LogLevel).join(", ")}`,
  LogLevel.INFO,
  [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR],
);
const language = argParser.value(
  "lang",
  `Language which one of: ${Object.values(Language).join(", ")}`,
  Language.JA,
  [Language.JA, Language.EN, Language.ZH_TW, Language.VI],
);
argParser.parse();

// --------------------------------------------------------------------------------
// Phase-2. ShogiHomeの基本的な動作に必要なモジュールを読み込んで初期化します。
// --------------------------------------------------------------------------------

import { preload } from "@/command/common/preload";
preload({
  appLogFile: enableAppLogFile() || enableAllLogFile(),
  usiLogFile: enableUSILogFile() || enableAllLogFile(),
  csaLogFile: enableCSALogFile() || enableAllLogFile(),
  stdoutLog: !disableStdoutLog(),
  logLevel: logLevel() as LogLevel,
  language: language() as Language,
});

// --------------------------------------------------------------------------------
// Phase-3. コマンド固有の依存関係を読み込みます。
// --------------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  CSAGameSettingsForCLI,
  CSAProtocolVersion,
  decompressCSAGameSettingsForCLI,
  importCSAGameSettingsForCLI,
  validateCSAGameSettings,
} from "@/common/settings/csa";
import { Clock } from "@/renderer/store/clock";
import { RecordManager } from "@/renderer/store/record";
import { CSAGameManager, loginRetryIntervalSeconds } from "@/renderer/store/csa";
import { defaultPlayerBuilder } from "@/renderer/players/builder";
import { getAppLogger } from "@/background/log";
import { generateRecordFileName } from "@/renderer/helpers/path";
import { RecordFileFormat } from "@/common/file/record";
import { ordinal } from "@/common/helpers/string";
import { exists } from "@/background/helpers/file";
import { defaultRecordFileNameTemplate } from "@/common/file/path";

// --------------------------------------------------------------------------------
// Phase-4. コマンド固有の処理を実行します。
// --------------------------------------------------------------------------------

async function main() {
  // 設定ファイルを読み込みます。
  const configFilePath = argParser.args[0];
  let cliSettings: CSAGameSettingsForCLI;
  const base64Value = base64();
  if (base64Value) {
    cliSettings = await decompressCSAGameSettingsForCLI(base64Value);
  } else {
    if (!configFilePath) {
      getAppLogger().error("config file is not specified.");
      argParser.showHelp();
      process.exit(1);
    }
    if (configFilePath.endsWith(".json")) {
      cliSettings = JSON.parse(fs.readFileSync(configFilePath, "utf-8")) as CSAGameSettingsForCLI;
    } else {
      cliSettings = YAML.parse(fs.readFileSync(configFilePath, "utf-8")) as CSAGameSettingsForCLI;
    }
  }

  // コマンドライン引数で指定された値で設定を上書きします。
  cliSettings.server.protocolVersion = (protocolVersion() ||
    cliSettings.server.protocolVersion) as CSAProtocolVersion;
  cliSettings.server.host = host() || cliSettings.server.host;
  cliSettings.server.port = port() || cliSettings.server.port;
  cliSettings.server.id = id() || cliSettings.server.id;
  cliSettings.server.password = password() || cliSettings.server.password;
  cliSettings.saveRecordFile = saveRecordFile() || cliSettings.saveRecordFile;
  cliSettings.repeat = repeat() || cliSettings.repeat;

  // USIエンジンが見つからない場合は、設定ファイルからの相対パスとみなして探します。
  if (configFilePath && !(await exists(cliSettings.usi.path))) {
    const relativePath = path.resolve(path.dirname(configFilePath), cliSettings.usi.path);
    if (!(await exists(relativePath))) {
      getAppLogger().error(`usi engine is not found: ${cliSettings.usi.path}`);
      process.exit(1);
    }
    cliSettings.usi.path = relativePath;
  }

  // CSAGameSettings に変換してバリデーションを実行します。
  const settings = importCSAGameSettingsForCLI(cliSettings);
  const validationError = validateCSAGameSettings(settings);
  if (validationError) {
    getAppLogger().error(validationError);
    process.exit(1);
  }

  const recordManager = new RecordManager();
  const blackClock = new Clock();
  const whiteClock = new Clock();
  const gameManager = new CSAGameManager(recordManager, blackClock, whiteClock);
  const playerBuilder = defaultPlayerBuilder(engineTimeout());

  gameManager
    .on("gameNext", onGameNext)
    .on("newGame", onNewGame)
    .on("gameEnd", onGameEnd)
    .on("saveRecord", onSaveRecord)
    .on("loginRetry", onLoginRetry)
    .on("error", onError)
    .login(settings, playerBuilder)
    .catch(onFatalError);

  function onGameNext() {
    getAppLogger().info("waiting for new game...");
  }

  function onNewGame(n: number) {
    getAppLogger().info(`${ordinal(n)} game started.`);
  }

  function onGameEnd() {
    getAppLogger().info("completed. will exit after some seconds...");
  }

  const returnCode = returnCodeName() === "CRLF" ? "\r\n" : "\n";

  function onSaveRecord() {
    const fileName = generateRecordFileName(recordManager.record, {
      template:
        recordFileNameTemplate() ||
        cliSettings.recordFileNameTemplate ||
        defaultRecordFileNameTemplate,
      extension: recordFileFormat() || cliSettings.recordFileFormat || RecordFileFormat.KIF,
    });
    const dir = recordDir();
    const filePath = path.join(dir, fileName);
    fs.promises
      .mkdir(dir, { recursive: true })
      .then(() => {
        const result = recordManager.exportRecordAsBuffer(filePath, {
          returnCode,
          csa: { v3: useCSAV3() },
        });
        if (result instanceof Error) {
          getAppLogger().error(result);
          return;
        }
        return fs.promises.writeFile(filePath, result.data);
      })
      .then(() => {
        getAppLogger().info("record saved: %s", filePath);
      })
      .catch((e) => {
        getAppLogger().error(e);
      });
  }

  function onLoginRetry() {
    getAppLogger().warn(`Retry login after ${loginRetryIntervalSeconds} seconds...`);
  }

  function onError(e: unknown) {
    getAppLogger().error(e);
  }

  function onFatalError(e: unknown) {
    getAppLogger().error(e);
    process.exit(1);
  }
}

main();
