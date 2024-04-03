import { issueEngineURI } from "@/common/uri";
import * as uri from "@/common/uri";
import { t } from "@/common/i18n";
import * as iots from "io-ts";

// reserved option names
export const USIPonder = "USI_Ponder";
export const USIHash = "USI_Hash";
export const USIMultiPV = "USI_MultiPV";

// well-known option names
export const Threads = "Threads";
export const NumberOfThreads = "NumberOfThreads";
export const MultiPV = "MultiPV";

export const USIEngineOptionTypeDef = iots.keyof({
  check: null,
  spin: null,
  combo: null,
  button: null,
  string: null,
  filename: null,
});
export type USIEngineOptionType = iots.TypeOf<typeof USIEngineOptionTypeDef>;

export const USIEngineOptionDef = iots.intersection([
  iots.type({
    name: iots.string,
    type: USIEngineOptionTypeDef,
    order: iots.number,
    vars: iots.array(iots.string),
  }),
  iots.partial({
    default: iots.union([iots.string, iots.number]),
    min: iots.number,
    max: iots.number,
    value: iots.union([iots.string, iots.number]),
  }),
]);
export type USIEngineOption = iots.TypeOf<typeof USIEngineOptionDef>;

export function getUSIEngineOptionCurrentValue(
  option: USIEngineOption | null | undefined,
): string | number | undefined {
  if (!option) {
    return;
  }
  if (option.value !== undefined) {
    return option.value;
  }
  if ((option.type === "string" || option.type === "filename") && option.default === "<empty>") {
    return "";
  }
  if (option.default !== undefined) {
    return option.default;
  }
  return;
}

export type USIEngineOptions = { [name: string]: USIEngineOption };

export enum USIEngineLabel {
  GAME = "game",
  RESEARCH = "research",
  MATE = "mate",
}

export const USIEngineLabelsDef = iots.partial({
  [USIEngineLabel.GAME]: iots.boolean,
  [USIEngineLabel.RESEARCH]: iots.boolean,
  [USIEngineLabel.MATE]: iots.boolean,
});
export type USIEngineLabels = iots.TypeOf<typeof USIEngineLabelsDef>;

export const USIEngineSettingDef = iots.intersection([
  iots.type({
    uri: iots.string,
    name: iots.string,
    defaultName: iots.string,
    author: iots.string,
    path: iots.string,
    options: iots.record(iots.string, USIEngineOptionDef),
    enableEarlyPonder: iots.boolean,
  }),
  iots.partial({
    labels: USIEngineLabelsDef,
  }),
]);
export type USIEngineSetting = iots.TypeOf<typeof USIEngineSettingDef>;

export function emptyUSIEngineSetting(): USIEngineSetting {
  return {
    uri: "",
    name: "",
    defaultName: "",
    author: "",
    path: "",
    options: {},
    labels: {
      game: true,
      research: true,
      mate: true,
    },
    enableEarlyPonder: false,
  };
}

export function duplicateEngineSetting(src: USIEngineSetting): USIEngineSetting {
  const engine: USIEngineSetting = JSON.parse(JSON.stringify(src));
  engine.uri = issueEngineURI();
  engine.name = t.copyOf(engine.name);
  return engine;
}

export function mergeUSIEngineSetting(engine: USIEngineSetting, local: USIEngineSetting): void {
  engine.uri = local.uri;
  engine.name = local.name;
  Object.keys(local.options).forEach((name) => {
    if (!engine.options[name]) {
      return;
    }
    engine.options[name].value = local.options[name].value;
  });
  engine.labels = local.labels;
  engine.enableEarlyPonder = local.enableEarlyPonder;
}

export function validateUSIEngineSetting(setting: USIEngineSetting): Error | undefined {
  if (!uri.isUSIEngine(setting.uri)) {
    return new Error("invalid engine URI");
  }
  if (!setting.name && !setting.defaultName) {
    return new Error("engine name is required");
  }
  if (!setting.path) {
    return new Error("engine path is required");
  }
  for (const name in setting.options) {
    const option = setting.options[name];
    if (!["check", "spin", "combo", "button", "string", "filename"].includes(option.type)) {
      return new Error(`invalid option type: name=[${name}] type=[${option.type}]`);
    }
    if (!isValidOptionValue(option)) {
      return new Error(
        `invalid option value: name=[${name}] type=[${option.type}] value=[${option.value}]`,
      );
    }
  }
}

function isValidOptionValue(option: USIEngineOption): boolean {
  const value = getUSIEngineOptionCurrentValue(option);
  switch (option.type) {
    case "check":
      if (value !== "true" && value !== "false") {
        return false;
      }
      break;
    case "spin":
      if (typeof value !== "number") {
        return false;
      }
      if (option.min !== undefined && value < option.min) {
        return false;
      }
      if (option.max !== undefined && value > option.max) {
        return false;
      }
      break;
    case "combo":
    case "string":
    case "filename":
      if (typeof value !== "string") {
        return false;
      }
      break;
    case "button":
      if (value !== undefined) {
        return false;
      }
      break;
  }
  return true;
}

export interface ImmutableUSIEngineSettings {
  hasEngine(uri: string): boolean;
  getEngine(uri: string): USIEngineSetting | undefined;
  get engineList(): USIEngineSetting[];
  get json(): string;
  get jsonWithIndent(): string;
  getClone(): USIEngineSettings;
  filterByLabel(label: USIEngineLabel): USIEngineSettings;
}

export class USIEngineSettings {
  private engines: { [uri: string]: USIEngineSetting } = {};

  constructor(json?: string) {
    if (json) {
      const src = JSON.parse(json);
      Object.keys(src.engines)
        .filter(uri.isUSIEngine)
        .forEach((engineURI) => {
          const emptyEngine = emptyUSIEngineSetting();
          const engine = src.engines[engineURI];
          this.engines[engineURI] = {
            ...emptyEngine,
            ...engine,
            uri: engineURI,
            labels: {
              ...emptyEngine.labels,
              ...engine.labels,
            },
          };
        });
    }
  }

  hasEngine(uri: string): boolean {
    return !!this.engines[uri];
  }

  addEngine(engine: USIEngineSetting): void {
    this.engines[engine.uri] = engine;
  }

  updateEngine(engine: USIEngineSetting): boolean {
    if (!this.engines[engine.uri]) {
      return false;
    }
    this.engines[engine.uri] = engine;
    return true;
  }

  removeEngine(uri: string): boolean {
    if (!this.engines[uri]) {
      return false;
    }
    delete this.engines[uri];
    return true;
  }

  getEngine(uri: string): USIEngineSetting | undefined {
    return this.engines[uri];
  }

  get engineList(): USIEngineSetting[] {
    return Object.values(this.engines).sort((a, b): number => {
      if (a.name !== b.name) {
        return a.name > b.name ? 1 : -1;
      }
      if (a.defaultName !== b.defaultName) {
        return a.defaultName > b.defaultName ? 1 : -1;
      }
      return a.uri > b.uri ? 1 : -1;
    });
  }

  get json(): string {
    return JSON.stringify(this);
  }

  get jsonWithIndent(): string {
    return JSON.stringify(this, undefined, 2);
  }

  getClone(): USIEngineSettings {
    return new USIEngineSettings(this.json);
  }

  filterByLabel(label: USIEngineLabel): USIEngineSettings {
    const engines = new USIEngineSettings();
    this.engineList
      .filter((engine) => engine.labels && engine.labels[label])
      .forEach((engine) => engines.addEngine(engine));
    return engines;
  }
}

export const USIEngineOptionForCLIDef = iots.type({
  type: USIEngineOptionTypeDef,
  value: iots.union([iots.string, iots.number, iots.boolean]),
});
export type USIEngineOptionForCLI = iots.TypeOf<typeof USIEngineOptionForCLIDef>;

export const USIEngineSettingForCLIDef = iots.type({
  name: iots.string,
  path: iots.string,
  options: iots.record(iots.string, USIEngineOptionForCLIDef),
  enableEarlyPonder: iots.boolean,
});
export type USIEngineSettingForCLI = iots.TypeOf<typeof USIEngineSettingForCLIDef>;

export function exportUSIEngineSettingForCLI(engine: USIEngineSetting): USIEngineSettingForCLI {
  const options: { [name: string]: USIEngineOptionForCLI } = {};
  for (const option of Object.values(engine.options)) {
    const value = getUSIEngineOptionCurrentValue(option);
    if (value === undefined) {
      continue;
    }
    switch (option.type) {
      default:
        options[option.name] = {
          type: option.type,
          value,
        };
        break;
      case "check":
        options[option.name] = {
          type: option.type,
          value: value === "true",
        };
        break;
    }
  }
  return {
    name: engine.name,
    path: engine.path,
    options: options,
    enableEarlyPonder: engine.enableEarlyPonder,
  };
}

export function importUSIEngineSettingForCLI(
  engine: USIEngineSettingForCLI,
  uri?: string,
): USIEngineSetting {
  const options: { [name: string]: USIEngineOption } = {};
  for (const name in engine.options) {
    const option = engine.options[name];
    options[name] = {
      name,
      type: option.type,
      order: 0,
      value: option.value === true ? "true" : option.value === false ? "false" : option.value,
      vars: [],
    };
  }
  return {
    uri: uri || issueEngineURI(),
    name: engine.name,
    defaultName: engine.name,
    author: "",
    path: engine.path,
    options,
    enableEarlyPonder: engine.enableEarlyPonder,
    labels: {},
  };
}
