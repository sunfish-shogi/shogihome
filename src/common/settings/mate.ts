import { USIEngine } from "./usi.js";

export type MateSearchSettings = {
  usi?: USIEngine;
  enableMaxSeconds: boolean;
  maxSeconds: number;
};

export function defaultMateSearchSettings(): MateSearchSettings {
  return {
    enableMaxSeconds: false,
    maxSeconds: 10,
  };
}

export function normalizeMateSearchSettings(settings: MateSearchSettings): MateSearchSettings {
  return {
    ...defaultMateSearchSettings(),
    ...settings,
  };
}
