import { CSAProtocolVersion } from "@/common/settings/csa.js";
import { Command } from "./command.js";

export type OSState = {
  version: string;
  arch: string;
  cpuTotalTime: number;
  cpuIdleTime: number;
  memoryTotal: number;
  memoryFree: number;
};

export function blankOSState(): OSState {
  return {
    version: "-",
    arch: "-",
    cpuTotalTime: 0,
    cpuIdleTime: 0,
    memoryTotal: 0,
    memoryFree: 0,
  };
}

export type USISessionState = {
  sessionID: number;
  uri: string;
  name: string;
  path: string;
  pid?: number;
  stateCode: string;
  lastReceived?: Command;
  lastSent?: Command;
  createdMs: number;
  updatedMs: number;
  closed: boolean;
};

export type CSASessionState = {
  sessionID: number;
  host: string;
  port: number;
  loginID: string;
  protocolVersion: CSAProtocolVersion;
  stateCode: string;
  lastReceived?: Command;
  lastSent?: Command;
  createdMs: number;
  loggedInMs?: number;
  updatedMs: number;
  closed: boolean;
};

export type SessionStates = {
  os: OSState;
  usiSessions: USISessionState[];
  csaSessions: CSASessionState[];
};
