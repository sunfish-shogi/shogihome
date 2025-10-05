// eslint.config.js
// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import vuePrettierConfig from "@vue/eslint-config-prettier";
import importPlugin from "eslint-plugin-import";

export default defineConfigWithVueTs([
  {
    ignores: ["docs/webapp/**", "docs/webapp-dev/**", "dist/**", "dev-dist/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: ["**/*.{ts,mts,cts,tsx,vue}"],
    ...importPlugin.flatConfigs.typescript,
    settings: {
      "import/resolver": {
        typescript: true, // require eslint-import-resolver-typescript
      },
      "import/ignore": ["node_modules"],
      "import/core-modules": ["typescript-eslint"],
    },
  },
  {
    files: ["eslint.config.*"],
    rules: {
      "import/no-unresolved": "off",
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
      "import/no-cycle": 1,
      "import/no-restricted-paths": [
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
  },
  prettierConfig,
  vuePrettierConfig,
]);
