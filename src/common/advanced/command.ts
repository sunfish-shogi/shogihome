import { getDateTimeStringMs } from "@/common/helpers/datetime.js";

export enum CommandType {
  SEND = "send",
  RECEIVE = "receive",
  SYSTEM = "system",
}

export type Command = {
  type: CommandType;
  command: string;
  dateTime: string;
  timeMs: number;
};

export function newCommand(type: CommandType, command: string): Command {
  const date = new Date();
  return {
    type,
    command,
    dateTime: getDateTimeStringMs(date),
    timeMs: date.getTime(),
  };
}

export type CommandHistory<T = Command> = {
  discarded: number;
  commands: T[];
};

export function addCommand<T>(
  history: CommandHistory<T>,
  commands: T | T[],
  maxHistory: number,
  discardingSize: number,
) {
  if (!Array.isArray(commands)) {
    commands = [commands];
  }
  for (const command of commands) {
    history.commands.push(command);
  }
  if (history.commands.length > maxHistory) {
    const d = Math.max(discardingSize, history.commands.length - maxHistory);
    history.discarded += d;
    history.commands.splice(0, d);
  }
}
