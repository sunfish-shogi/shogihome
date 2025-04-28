import { PromptTarget } from "@/common/advanced/prompt.js";
import { UnwrapNestedRefs, reactive } from "vue";
import api from "@/renderer/ipc/api.js";
import {
  Command,
  CommandHistory,
  CommandType,
  addCommand,
  newCommand,
} from "@/common/advanced/command.js";

type CommandWithID = Command & { id: number };

export class Store {
  private _reactive: UnwrapNestedRefs<Store>;
  private _target: PromptTarget;
  private _sessionID: number;
  private _name: string;
  private _history: CommandHistory<CommandWithID> = {
    discarded: 0,
    commands: [],
  };
  private _nextID = 0;
  private buffer: CommandWithID[] = [];
  private bufferTimer: number | null = null;

  constructor() {
    this._reactive = reactive(this);
    const params = new URL(window.location.toString()).searchParams;
    this._target = params.get("target") as PromptTarget;
    this._sessionID = Number(params.get("session"));
    this._name = params.get("name") || "unknown";
  }

  get reactive(): UnwrapNestedRefs<Store> {
    return this._reactive;
  }

  get target(): PromptTarget {
    return this._target;
  }

  get sessionID(): number {
    return this._sessionID;
  }

  get name(): string {
    return this._name;
  }

  get history(): CommandHistory<CommandWithID> {
    return this._history;
  }

  async setup(): Promise<void> {
    try {
      const history = await api.setupPrompt(this.target, this.sessionID);
      this._history = {
        discarded: history.discarded,
        commands: history.commands.map((c) => ({ ...c, id: this._nextID++ })),
      };
    } catch (e) {
      this.onError(e);
    }
  }

  onCommand(command: Command): void {
    this.buffer.push({ ...command, id: this._nextID++ });
    if (this.bufferTimer) {
      return;
    }
    this.bufferTimer = window.setTimeout(() => {
      addCommand<CommandWithID>(this._history, this.buffer, 1000, 100);
      this.buffer = [];
      this.bufferTimer = null;
    }, 250);
  }

  onError(e: unknown) {
    this.onCommand(
      newCommand(
        CommandType.SYSTEM,
        `Failed to load command history: ${this.target}: ${this.sessionID}: ${e}`,
      ),
    );
  }

  invokeCommand(type: CommandType, command: string): void {
    api.invokePromptCommand(this.target, this.sessionID, type, command);
  }
}

export function createStore(): UnwrapNestedRefs<Store> {
  return new Store().reactive;
}

let store: UnwrapNestedRefs<Store>;

export function useStore(): UnwrapNestedRefs<Store> {
  if (!store) {
    store = createStore();
  }
  return store;
}
