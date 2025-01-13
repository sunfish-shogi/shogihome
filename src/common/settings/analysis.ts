import { CommentBehavior } from "./comment";
import { USIEngine } from "./usi";

type StartCriteria = {
  enableNumber: boolean;
  number: number;
};

function defaultStartCriteria(): StartCriteria {
  return {
    enableNumber: false,
    number: 20,
  };
}

type EndCriteria = {
  enableNumber: boolean;
  number: number;
};

function defaultEndCriteria(): EndCriteria {
  return {
    enableNumber: false,
    number: 100,
  };
}

type PerMoveCriteria = {
  maxSeconds: number;
};

function defaultPerMoveCriteria(): PerMoveCriteria {
  return {
    maxSeconds: 5,
  };
}

export type AnalysisSettings = {
  usi?: USIEngine;
  startCriteria: StartCriteria;
  endCriteria: EndCriteria;
  perMoveCriteria: PerMoveCriteria;
  commentBehavior: CommentBehavior;
};

export function defaultAnalysisSettings(): AnalysisSettings {
  return {
    startCriteria: defaultStartCriteria(),
    endCriteria: defaultEndCriteria(),
    perMoveCriteria: defaultPerMoveCriteria(),
    commentBehavior: CommentBehavior.INSERT,
  };
}

export function normalizeAnalysisSettings(settings: AnalysisSettings): AnalysisSettings {
  return {
    ...defaultAnalysisSettings(),
    ...settings,
    startCriteria: {
      ...defaultStartCriteria(),
      ...settings.startCriteria,
    },
    endCriteria: {
      ...defaultEndCriteria(),
      ...settings.endCriteria,
    },
    perMoveCriteria: {
      ...defaultPerMoveCriteria(),
      ...settings.perMoveCriteria,
    },
  };
}
