// eslint.config.js
// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import vuePrettierConfig from "@vue/eslint-config-prettier";
import { importX } from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";

export default defineConfigWithVueTs([
  {
    ignores: [
      "docs/webapp/**",
      "docs/webapp-dev/**",
      "dist/**",
      "dev-dist/**",
      "coverage/**",
      // Emscripten が生成したグルーコード
      "public/engines/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  importX.flatConfigs.recommended,
  {
    files: ["**/*.{ts,mts,cts,tsx,vue}"],
    ...importX.flatConfigs.typescript,
  },
  {
    files: ["eslint.config.*"],
    rules: {
      "import-x/no-unresolved": "off",
    },
  },
  {
    // Emscripten の --pre-js に渡す JavaScript。
    // 生成関数の内側に埋め込まれるため、Module がスコープに存在する。
    files: ["engines/**/*.js"],
    languageOptions: {
      globals: {
        Module: "readonly",
      },
    },
  },
  {
    // Service Worker として動く JavaScript。
    files: ["src/sw.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    // index.html にインラインで埋め込まれる JavaScript。
    files: ["src/coi-bootstrap.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "error",
      "no-debugger": "error",
      "no-restricted-imports": ["error", { patterns: ["../"] }],
      "no-irregular-whitespace": "off",
      "vue/multi-word-component-names": "off",
      "import-x/no-cycle": "error",
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              from: "./src/renderer",
              target: "./src/background",
            },
            {
              from: "./src/background",
              target: "./src/renderer",
            },
            {
              from: "./src/renderer",
              target: "./src/common",
            },
            {
              from: "./src/background",
              target: "./src/common",
            },
          ],
        },
      ],
    },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver()],
      "import-x/ignore": ["node_modules"],
      // ビルド時に生成される仮想モジュール (plugins/builtin_engines.ts)。
      "import-x/core-modules": [
        "typescript-eslint",
        "virtual:shogihome/builtin-engines",
        "virtual:shogihome/build-profile",
      ],
    },
  },
  prettierConfig,
  vuePrettierConfig,
  {
    rules: {
      curly: ["error", "all"],
    },
  },
]);
