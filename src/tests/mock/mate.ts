import { MateSearchSettings } from "@/common/settings/mate.js";
import { USIEngine } from "@/common/settings/usi.js";

const engine: USIEngine = {
  uri: "es://usi/test-engine",
  name: "my usi engine",
  defaultName: "engine",
  author: "author",
  path: "/engines/engines",
  options: {},
  labels: {},
  enableEarlyPonder: false,
};

export const mateSearchSettings: MateSearchSettings = {
  usi: engine,
  enableMaxSeconds: false,
  maxSeconds: 10,
};
