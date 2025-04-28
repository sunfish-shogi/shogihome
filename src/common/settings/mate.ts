import { USIEngine } from "./usi.js";

export type MateSearchSettings = {
  usi?: USIEngine;
};

export function defaultMateSearchSettings(): MateSearchSettings {
  return {};
}

export function normalizeMateSearchSettings(settings: MateSearchSettings): MateSearchSettings {
  return {
    ...defaultMateSearchSettings(),
    ...settings,
  };
}
