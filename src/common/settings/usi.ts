import { issueEngineURI } from "@/common/uri.js";
import * as uri from "@/common/uri.js";
import { t } from "@/common/i18n/index.js";
import ejpn from "encoding-japanese";
const [base64Decode, base64Encode] = [ejpn.base64Decode, ejpn.base64Encode];

// reserved option names
export const USIPonder = "USI_Ponder";
export const USIHash = "USI_Hash";
export const USIMultiPV = "USI_MultiPV";

// well-known option names
export const Threads = "Threads";
export const NumberOfThreads = "NumberOfThreads";
export const MultiPV = "MultiPV";
export const StochasticPonder = "Stochastic_Ponder";

export type USIEngineOptionType = "check" | "spin" | "combo" | "button" | "string" | "filename";

type USIEngineCheckOption = {
  type: "check";
  default?: "true" | "false";
  value?: "true" | "false";
};

type USIEngineSpinOption = {
  type: "spin";
  default?: number;
  min?: number;
  max?: number;
  value?: number;
};

type USIEngineComboOption = {
  type: "combo";
  default?: string;
  vars: string[];
  value?: string;
};

type USIEngineButtonOption = {
  type: "button";
};

type USIEngineStringOption = {
  type: "string" | "filename";
  default?: string;
  value?: string;
};

export type USIEngineOption = {
  name: string;
  order: number;
} & (
  | USIEngineCheckOption
  | USIEngineSpinOption
  | USIEngineComboOption
  | USIEngineButtonOption
  | USIEngineStringOption
);

export function getUSIEngineOptionCurrentValue(
  option: USIEngineOption | undefined,
): string | number | undefined {
  if (!option || option.type === "button") {
    return;
  }
  if (option.value !== undefined) {
    return option.value;
  }
  if ((option.type === "string" || option.type === "filename") && option.default === "<empty>") {
    return "";
  }
  return option.default;
}

export function getUSIEnginePonder(engine: USIEngine): boolean {
  const value = getUSIEngineOptionCurrentValue(engine.options[USIPonder]);
  return value === "true";
}

export function getUSIEngineThreads(engine: USIEngine): number | undefined {
  const value =
    getUSIEngineOptionCurrentValue(engine.options[Threads]) ||
    getUSIEngineOptionCurrentValue(engine.options[NumberOfThreads]);
  return value as number | undefined;
}

export function getUSIEngineMultiPV(engine: USIEngine): number | undefined {
  const value =
    getUSIEngineOptionCurrentValue(engine.options[USIMultiPV]) ||
    getUSIEngineOptionCurrentValue(engine.options[MultiPV]);
  return value as number | undefined;
}

export function getUSIEngineStochasticPonder(engine: USIEngine): boolean {
  const value = getUSIEngineOptionCurrentValue(engine.options[StochasticPonder]);
  return value === "true";
}

export type USIEngineOptions = { [name: string]: USIEngineOption };

export enum USIEngineLabel {
  GAME = "game",
  RESEARCH = "research",
  MATE = "mate",
}

export type USIEngineLabels = {
  [USIEngineLabel.GAME]?: boolean;
  [USIEngineLabel.RESEARCH]?: boolean;
  [USIEngineLabel.MATE]?: boolean;
};

export function getPredefinedUSIEngineTag(type: "game" | "research" | "mate"): string {
  switch (type) {
    case "game":
      return t.game;
    case "research":
      return t.research;
    case "mate":
      return t.mateSearch;
  }
}

export type USIEngine = {
  uri: string;
  name: string;
  defaultName: string;
  author: string;
  path: string;
  options: { [name: string]: USIEngineOption };
  labels?: USIEngineLabels; // deprecated: use tags instead
  tags?: string[];
  enableEarlyPonder: boolean;
};

export function emptyUSIEngine(): USIEngine {
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
    tags: [
      getPredefinedUSIEngineTag("game"),
      getPredefinedUSIEngineTag("research"),
      getPredefinedUSIEngineTag("mate"),
    ],
    enableEarlyPonder: false,
  };
}

export function duplicateEngine(src: USIEngine): USIEngine {
  const engine: USIEngine = JSON.parse(JSON.stringify(src));
  engine.uri = issueEngineURI();
  engine.name = t.copyOf(engine.name);
  return engine;
}

function labelToTag(label: USIEngineLabel): string {
  switch (label) {
    case USIEngineLabel.GAME:
      return getPredefinedUSIEngineTag("game");
    case USIEngineLabel.RESEARCH:
      return getPredefinedUSIEngineTag("research");
    case USIEngineLabel.MATE:
      return getPredefinedUSIEngineTag("mate");
  }
}

function labelsToTags(labels: USIEngineLabels): string[] {
  return Object.entries(labels)
    .filter(([key, val]) => val && labelToTag(key as USIEngineLabel))
    .map(([key]) => labelToTag(key as USIEngineLabel));
}

function tagToLabel(tag: string): USIEngineLabel | undefined {
  switch (tag) {
    case getPredefinedUSIEngineTag("game"):
      return USIEngineLabel.GAME;
    case getPredefinedUSIEngineTag("research"):
      return USIEngineLabel.RESEARCH;
    case getPredefinedUSIEngineTag("mate"):
      return USIEngineLabel.MATE;
  }
}

function tagsToLabels(tags: string[]): USIEngineLabels {
  const labels: USIEngineLabels = {
    [USIEngineLabel.GAME]: false,
    [USIEngineLabel.RESEARCH]: false,
    [USIEngineLabel.MATE]: false,
  };
  for (const tag of tags) {
    const label = tagToLabel(tag);
    if (label) {
      labels[label] = true;
    }
  }
  return labels;
}

export function mergeUSIEngine(engine: USIEngine, local: USIEngine): void {
  engine.uri = local.uri;
  engine.name = local.name;
  Object.values(local.options).forEach((localOption) => {
    const engineOption = engine.options[localOption.name];
    if (!engineOption || engineOption.type === "button" || engineOption.type !== localOption.type) {
      return;
    }
    engineOption.value = localOption.value;
  });
  engine.labels = local.labels;
  engine.tags = local.tags || labelsToTags(local.labels || {});
  engine.enableEarlyPonder = local.enableEarlyPonder;
}

export function validateUSIEngine(engine: USIEngine): Error | undefined {
  if (!uri.isUSIEngine(engine.uri)) {
    return new Error("invalid engine URI");
  }
  if (!engine.name && !engine.defaultName) {
    return new Error("engine name is required");
  }
  if (!engine.path) {
    return new Error("engine path is required");
  }
  for (const name in engine.options) {
    const option = engine.options[name];
    if (!["check", "spin", "combo", "button", "string", "filename"].includes(option.type)) {
      return new Error(`invalid option type: name=[${name}] type=[${option.type}]`);
    }
    if (!isValidOptionValue(option)) {
      return new Error(
        `invalid option value: name=[${name}] type=[${option.type}]` +
          (option.type !== "button" ? ` value=[${option.value}]` : ""),
      );
    }
  }
}

function isValidOptionValue(option: USIEngineOption): boolean {
  if (option.type === "button" || option.value === undefined) {
    return true;
  }
  switch (option.type) {
    case "check":
      if (option.value !== "true" && option.value !== "false") {
        return false;
      }
      break;
    case "spin":
      if (typeof option.value !== "number") {
        return false;
      }
      if (option.min !== undefined && option.value < option.min) {
        return false;
      }
      if (option.max !== undefined && option.value > option.max) {
        return false;
      }
      break;
    case "string":
    case "filename":
      if (typeof option.value !== "string") {
        return false;
      }
      break;
    case "combo":
      if (typeof option.value !== "string") {
        return false;
      }
      break;
  }
  return true;
}

export type USIEngineOptionDiff = {
  name: string;
  leftValue?: string | number;
  rightValue?: string | number;
  mergeable: boolean;
};

export function compareUSIEngineOptions(left: USIEngine, right: USIEngine): USIEngineOptionDiff[] {
  const result = [] as USIEngineOptionDiff[];
  function append(leftOption?: USIEngineOption, rightOption?: USIEngineOption) {
    const leftHasValue = leftOption && leftOption.type !== "button";
    const rightHasValue = rightOption && rightOption.type !== "button";
    const leftValue = getUSIEngineOptionCurrentValue(leftOption);
    const rightValue = getUSIEngineOptionCurrentValue(rightOption);
    if (leftHasValue && rightHasValue && leftValue !== rightValue) {
      result.push({
        name: leftOption.name,
        leftValue,
        rightValue,
        mergeable: leftOption.type === rightOption.type,
      });
    } else if (leftHasValue && !rightHasValue) {
      result.push({
        name: leftOption.name,
        leftValue,
        mergeable: false,
      });
    } else if (!leftHasValue && rightHasValue) {
      result.push({
        name: rightOption.name,
        rightValue,
        mergeable: false,
      });
    }
  }
  function compareOrder(a: USIEngineOption, b: USIEngineOption): number {
    return a.order < b.order ? -1 : 1;
  }
  for (const leftOption of Object.values(left.options).sort(compareOrder)) {
    const rightOption = right.options[leftOption.name];
    append(leftOption, rightOption);
  }
  for (const rightOption of Object.values(right.options).sort(compareOrder)) {
    const leftOption = left.options[rightOption.name];
    if (!leftOption) {
      append(undefined, rightOption);
    }
  }
  return result;
}

export interface ImmutableUSIEngines {
  hasEngine(uri: string): boolean;
  getEngine(uri: string): USIEngine | undefined;
  get engineList(): USIEngine[];
  get tagList(): { name: string; color: string }[];
  getTagColor(tag: string): string;
  get json(): string;
  get jsonWithIndent(): string;
  getClone(): USIEngines;
}

const tagColorPalette: { [code: string]: string } = {
  blue: "#1565C0",
  green: "#2E7D32",
  orange: "#D84315",
  brown: "#5D4037",
  purple: "#7B1FA2",
  indigo: "#303F9F",
  amber: "#EF6C00",
  gray: "#616161",
  pink: "#C2185B",
} as const;

export class USIEngines {
  private engines: { [uri: string]: USIEngine } = {};
  private tagColorMapping: { [tag: string]: string } = {};

  constructor(json?: string) {
    if (json) {
      const src = JSON.parse(json);
      Object.keys(src.engines)
        .filter(uri.isUSIEngine)
        .forEach((engineURI) => {
          const emptyEngine = emptyUSIEngine();
          const engine = src.engines[engineURI];
          this.engines[engineURI] = {
            ...emptyEngine,
            ...engine,
            uri: engineURI,
            labels: {
              ...emptyEngine.labels,
              ...engine.labels,
            },
            tags: engine.tags || labelsToTags(engine.labels || {}),
          };
        });
      this.tagColorMapping = src.tagColorMapping || {};
      this.updateTagColorMapping();
    }
  }

  hasEngine(uri: string): boolean {
    return !!this.engines[uri];
  }

  addEngine(engine: USIEngine): void {
    this.engines[engine.uri] = engine;
    this.updateTagColorMapping();
  }

  updateEngine(engine: USIEngine): boolean {
    if (!this.engines[engine.uri]) {
      return false;
    }
    this.engines[engine.uri] = engine;
    this.updateTagColorMapping();
    return true;
  }

  removeEngine(uri: string): boolean {
    if (!this.engines[uri]) {
      return false;
    }
    delete this.engines[uri];
    this.updateTagColorMapping();
    return true;
  }

  getEngine(uri: string): USIEngine | undefined {
    return this.engines[uri];
  }

  get engineList(): USIEngine[] {
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

  get tagList(): { name: string; color: string }[] {
    return Object.entries(this.tagColorMapping)
      .map(([name, color]) => ({
        name,
        color: tagColorPalette[color],
      }))
      .sort((a, b) => (a.name > b.name ? 1 : -1));
  }

  getTagColor(tag: string): string {
    const color = this.tagColorMapping[tag] || "blue";
    return tagColorPalette[color] || tagColorPalette.blue;
  }

  addTag(uri: string, tag: string): void {
    if (!this.engines[uri]) {
      return;
    }
    this.engines[uri].tags = this.engines[uri].tags || [];
    if (!this.engines[uri].tags.includes(tag)) {
      this.engines[uri].tags.push(tag);
    }
    this.updateTagColorMapping();
    this.engines[uri].labels = tagsToLabels(this.engines[uri].tags);
  }

  removeTag(uri: string, tag: string): void {
    if (!this.engines[uri]) {
      return;
    }
    this.engines[uri].tags = this.engines[uri].tags?.filter((t) => t !== tag);
    this.updateTagColorMapping();
    this.engines[uri].labels = tagsToLabels(this.engines[uri].tags || []);
  }

  private updateTagColorMapping(): void {
    const usedTags = new Set<string>();
    for (const engine of Object.values(this.engines)) {
      for (const tag of engine.tags ?? []) {
        usedTags.add(tag);
      }
    }
    const allColors = Object.keys(tagColorPalette);
    const usedColors = new Set(Object.values(this.tagColorMapping));
    const availableColors = allColors.filter((color) => !usedColors.has(color));

    let indexForNew = Object.keys(this.tagColorMapping).length;
    for (const tag of usedTags) {
      if (!this.tagColorMapping[tag]) {
        const assignedColor = availableColors.shift() ?? allColors[indexForNew % allColors.length];
        this.tagColorMapping[tag] = assignedColor;
        indexForNew++;
      }
    }

    for (const tag of Object.keys(this.tagColorMapping)) {
      if (!usedTags.has(tag)) {
        delete this.tagColorMapping[tag];
      }
    }
  }

  get json(): string {
    return JSON.stringify(this);
  }

  get jsonWithIndent(): string {
    return JSON.stringify(this, undefined, 2);
  }

  getClone(): USIEngines {
    return new USIEngines(this.json);
  }
}

type USIEngineCheckOptionForCLI = {
  type: "check";
  value: boolean;
};

type USIEngineSpinOptionForCLI = {
  type: "spin";
  value: number;
};

type USIEngineStringOptionForCLI = {
  type: "combo" | "string" | "filename";
  value: string;
};

export type USIEngineOptionForCLI =
  | USIEngineCheckOptionForCLI
  | USIEngineSpinOptionForCLI
  | USIEngineStringOptionForCLI;

export type USIEngineForCLI = {
  name: string;
  path: string;
  options: { [name: string]: USIEngineOptionForCLI };
  enableEarlyPonder: boolean;
};

export function exportUSIEnginesForCLI(engine: USIEngine): USIEngineForCLI {
  const options: { [name: string]: USIEngineOptionForCLI } = {};
  for (const option of Object.values(engine.options)) {
    const value = getUSIEngineOptionCurrentValue(option);
    if (value === undefined) {
      continue;
    }
    switch (option.type) {
      case "check":
        options[option.name] = { type: "check", value: value === "true" };
        break;
      case "spin":
        options[option.name] = { type: "spin", value: value as number };
        break;
      case "button":
        // unreachable
        break;
      default:
        options[option.name] = { type: option.type, value: value as string };
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

export function importUSIEnginesForCLI(engine: USIEngineForCLI, uri?: string): USIEngine {
  const options: { [name: string]: USIEngineOption } = {};
  for (const name in engine.options) {
    const option = engine.options[name];
    switch (option.type) {
      case "check":
        options[name] = { name, type: "check", order: 0, value: option.value ? "true" : "false" };
        break;
      case "spin":
        options[name] = { name, type: "spin", order: 0, value: option.value };
        break;
      case "combo":
        options[name] = {
          name,
          type: "combo",
          order: 0,
          value: option.value,
          vars: [option.value],
        };
        break;
      default:
        options[name] = { name, type: option.type, order: 0, value: option.value };
        break;
    }
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

export type USIEngineOptionsClipboardData = {
  schema: "es://usi-engine-options-clipboard-data";
  options: { [name: string]: USIEngineOption };
  enableEarlyPonder: boolean;
};

export async function compressUSIEngineOptionsClipboardData(
  settings: USIEngineOptionsClipboardData,
): Promise<string> {
  const json = JSON.stringify(settings);
  const cs = new CompressionStream("gzip");
  new Blob([json]).stream().pipeThrough(cs);
  const bin = await new Response(cs.readable).arrayBuffer();
  return base64Encode(new Uint8Array(bin));
}

export async function decompressUSIEngineOptionsClipboardData(
  compressed: string,
): Promise<USIEngineOptionsClipboardData> {
  const bin = new Uint8Array(base64Decode(compressed));
  const cs = new DecompressionStream("gzip");
  new Blob([bin]).stream().pipeThrough(cs);
  const data = JSON.parse(await new Response(cs.readable).text());
  if (data.schema !== "es://usi-engine-options-clipboard-data") {
    throw new Error("Invalid schema");
  }
  return data;
}
