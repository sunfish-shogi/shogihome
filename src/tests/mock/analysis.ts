import { AnalysisSettings } from "@/common/settings/analysis.js";
import { CommentBehavior } from "@/common/settings/comment.js";
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
  descending: false,
  commentBehavior: CommentBehavior.APPEND,
};
