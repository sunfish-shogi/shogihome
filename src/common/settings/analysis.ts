import { CommentBehavior } from "./comment.js";
import { USIEngine } from "./usi.js";

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
  descending: boolean;
  commentBehavior: CommentBehavior;
};

export function defaultAnalysisSettings(): AnalysisSettings {
  return {
    startCriteria: defaultStartCriteria(),
    endCriteria: defaultEndCriteria(),
    perMoveCriteria: defaultPerMoveCriteria(),
    descending: false,
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

export function validateAnalysisSettings(settings: AnalysisSettings): Error | undefined {
  if (
    settings.startCriteria.enableNumber &&
    (settings.startCriteria.number <= 0 || settings.startCriteria.number % 1 !== 0)
  ) {
    return new Error("開始手数は1以上の整数を指定してください。"); // TODO: i18n
  }
  if (
    settings.endCriteria.enableNumber &&
    (settings.endCriteria.number <= 0 || settings.endCriteria.number % 1 !== 0)
  ) {
    return new Error("終了手数は1以上の整数を指定してください。"); // TODO: i18n
  }
  if (
    settings.startCriteria.enableNumber &&
    settings.endCriteria.enableNumber &&
    settings.startCriteria.number > settings.endCriteria.number
  ) {
    return new Error("終了手数が開始手数より小さくなっています。"); // TODO: i18n
  }
  if (settings.perMoveCriteria.maxSeconds < 0) {
    return new Error("1手あたりの思考時間に負の値が指定されています。"); // TODO: i18n
  }
}
