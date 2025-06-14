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
};

export default config;
