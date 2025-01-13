import { AnalysisSettings } from "@/common/settings/analysis";
import { CommentBehavior } from "@/common/settings/comment";
import { USIEngine } from "@/common/settings/usi";

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

export const analysisSettings: AnalysisSettings = {
  usi: engine,
  startCriteria: {
    enableNumber: false,
    number: 0,
  },
  endCriteria: {
    enableNumber: false,
    number: 100,
  },
  perMoveCriteria: {
    maxSeconds: 1,
  },
  commentBehavior: CommentBehavior.APPEND,
};
