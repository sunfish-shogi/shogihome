module.exports = {
  roots: [
    "<rootDir>/src"
  ],
  testMatch: [
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
    "^.+\\.(vue)$": "@vue/vue3-jest"
  },
  moduleFileExtensions: [ "js", "ts", "vue" ],
  moduleNameMapper: {
    "@/(.*)": "<rootDir>/src/$1",
  },
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    customExportConditions: ["node", "node-addons"],
  },
  setupFilesAfterEnv: ["./scripts/jest.setup.js"],
  coverageDirectory: "coverage",
  coverageProvider: "v8",
};
