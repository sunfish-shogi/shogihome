module.exports = {
  env: {
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:vue/vue3-recommended",
    "@vue/typescript/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "@vue/prettier",
    "@vue/eslint-config-prettier",
    "@vue/eslint-config-typescript",
    "prettier",
  ],
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
  settings: {
    "import/resolver": {
      typescript: true,
    },
    "import/ignore": ["node_modules"],
  },
  ignorePatterns: ["docs/webapp/", "docs/webapp-dev/", "dist/", "dev-dist/", "coverage/"],
};
