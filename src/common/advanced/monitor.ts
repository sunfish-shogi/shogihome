import { CSAProtocolVersion } from "@/common/settings/csa.js";
import { Command } from "./command.js";

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
  usiSessions: USISessionState[];
  csaSessions: CSASessionState[];
};
