import fs from "node:fs";

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
  afterPack: function (context) {
    if (context.electronPlatformName === "darwin") {
      return;
    }
    const localeDir = context.appOutDir + "/locales/";
    for (const file of fs.readdirSync(localeDir)) {
      switch (file) {
        case "en-US.pak":
        case "ja.pak":
          break;
        default:
          fs.unlinkSync(localeDir + file);
          break;
      }
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
    //enableCookieEncryption: true, // Cookieは使わないので変更しない (Default: false)
    enableNodeOptionsEnvironmentVariable: false, // Node.js の特別な環境変数を無効化 (Default: true)
    enableNodeCliInspectArguments: false, // --inspect などの引数を無効化 (Default: true)
    enableEmbeddedAsarIntegrityValidation: true, // ASAR の整合性検証を有効化 (Default: false)
    onlyLoadAppFromAsar: true, // ASAR 以外からのアプリケーションコードの読み込みを防止 (Default: false)
    loadBrowserProcessSpecificV8Snapshot: true, // ブラウザープロセスのスナップショットを分離 (Default: false)
    grantFileProtocolExtraPrivileges: false, // 本番環境ではカスタムスキームを使用するため不要 (Default: true)
  },
};

export default config;
