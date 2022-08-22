import { GameSetting } from "@/settings/game";

const blackPlayerSetting = {
  name: "USI Engine 01",
  uri: "es://usi/test-engine-01",
  usi: {
    uri: "es://usi/test-engine-01",
    name: "my usi engine 01",
    defaultName: "engine 01",
    author: "author01",
    path: "/engines/engines01",
    options: {},
  },
};

const whitePlayerSetting02 = {
  name: "USI Engine 02",
  uri: "es://usi/test-engine-02",
  usi: {
    uri: "es://usi/test-engine-02",
    name: "my usi engine 02",
    defaultName: "engine 02",
    author: "author02",
    path: "/engines/engines02",
    options: {},
  },
};

export const gameSetting10m30s: GameSetting = {
  black: blackPlayerSetting,
  white: whitePlayerSetting02,
  timeLimit: {
    timeSeconds: 600,
    byoyomi: 30,
    increment: 0,
  },
  enableEngineTimeout: false,
  humanIsFront: false,
};
