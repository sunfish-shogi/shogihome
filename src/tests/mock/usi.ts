import { USIEngineSetting } from "@/settings/usi";

export const usiEngineSetting: USIEngineSetting = {
  uri: "es://usi/test-engine",
  name: "my usi engine",
  defaultName: "engine",
  author: "author",
  path: "/engines/engines",
  options: {},
};

export const usiEngineSettingWithPonder: USIEngineSetting = {
  uri: "es://usi/test-engine",
  name: "my usi engine",
  defaultName: "engine",
  author: "author",
  path: "/engines/engines",
  options: {
    USI_Ponder: {
      name: "USI_Ponder",
      type: "check",
      vars: [],
      value: "true",
    },
  },
};
