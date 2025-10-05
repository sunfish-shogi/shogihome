import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration
 */
const config = {
  productName: "ShogiHome",
  extraMetadata: {
    main: "dist/packed/background.js",
  },
  extends: null,
  files: [
    "dist/assets",
    "dist/arrow",
    "dist/board",
    "dist/character",
    "dist/icon",
    "dist/piece",
    "dist/sound",
    "dist/stand",
    "dist/index.html",
    "dist/prompt.html",
    "dist/monitor.html",
    "dist/layout-manager.html",
    "dist/packed",
    "!node_modules/**/*",
  ],
  afterPack: async function (context) {
    if (context.electronPlatformName === "darwin") {
      const appPath = path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app`,
      );
      await removeUnnecessaryFilesForMac(appPath);
    } else {
      await removeUnnecessaryFiles(context.appOutDir);
    }
  },
  afterSign: async function (context) {
    // macOS では Fuses 適用後に署名をしないと起動できない
    if (context.electronPlatformName === "darwin") {
      const appPath = path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app`,
      );
      await signMacApp(appPath);
    }
  },
  win: {
    fileAssociations: {
      name: "Kifu",
      ext: ["kif", "kifu", "ki2", "ki2u", "csa", "jkf"],
    },
  },
  nsis: {
    allowElevation: false,
    packElevateHelper: false,
  },
  mac: {
    electronLanguages: ["en", "ja"],
    fileAssociations: {
      name: "Kifu",
      ext: ["kif", "kifu", "ki2", "ki2u", "csa", "jkf"],
    },
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeExtensions: ["kif", "kifu", "ki2", "ki2u", "csa", "jkf"],
          CFBundleTypeName: "Kifu",
          CFBundleTypeRole: "Editor",
          LSHandlerRank: "Owner",
        },
      ],
    },
  },
  linux: {
    target: "AppImage",
    fileAssociations: [
      { name: "KIF", ext: "kif" },
      { name: "KIFU", ext: "kifu" },
      { name: "KI2", ext: "ki2" },
      { name: "KI2U", ext: "ki2u" },
      { name: "CSA", ext: "csa" },
      { name: "JKF", ext: "jkf" },
    ],
  },
  publish: null,

  // https://www.electronjs.org/docs/latest/tutorial/fuses
  electronFuses: {
    runAsNode: false, // 任意の JavaScript コードの実行を防止 (Default: true)
    //enableCookieEncryption: true, // Cookieの暗号化を有効化 (Default: false)
    enableNodeOptionsEnvironmentVariable: false, // Node.js の特別な環境変数を無効化 (Default: true)
    enableNodeCliInspectArguments: false, // --inspect などの引数を無効化 (Default: true)
    enableEmbeddedAsarIntegrityValidation: true, // ASAR の整合性検証を有効化 (Default: false)
    onlyLoadAppFromAsar: true, // ASAR 以外からのアプリケーションコードの読み込みを防止 (Default: false)
    //loadBrowserProcessSpecificV8Snapshot: true, // ブラウザープロセスのスナップショットを分離 (Default: false)
    grantFileProtocolExtraPrivileges: false, // 本番環境ではカスタムスキームを使用するため不要 (Default: true)
  },
};

export default config;

async function signMacApp(appPath) {
  await promisify(execFile)("codesign", ["--force", "--sign", "-", "--deep", appPath]);
  await promisify(execFile)("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
}

async function removeUnnecessaryFiles(appOutDir) {
  const localeDir = path.join(appOutDir, "locales");
  for (const file of await fs.promises.readdir(localeDir)) {
    switch (file) {
      case "en-US.pak":
      case "ja.pak":
        break;
      default:
        await fs.promises.unlink(path.join(localeDir, file));
        break;
    }
  }
}

async function removeUnnecessaryFilesForMac(appPath) {
  const resourceDir = path.join(
    appPath,
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources",
  );
  for (const file of await fs.promises.readdir(resourceDir)) {
    if (file.endsWith(".lproj") && file !== "en.lproj" && file !== "ja.lproj") {
      await fs.promises.rm(path.join(resourceDir, file), { recursive: true, force: true });
    }
  }
}
