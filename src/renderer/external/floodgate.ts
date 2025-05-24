import api from "@/renderer/ipc/api";
import { Color } from "tsshogi";
import YAML from "yaml";

export type Game = {
  id: string;
  dateTime: Date;
  rule: string;
  url: string;
  blackName: string;
  whiteName: string;
  playing: boolean;
  winner?: Color;
};

export type GameQuery = {
  playerName?: string;
  begin?: number;
};

export type Player = {
  name: string;
  rate: number;
};

const floodgateBaseURL = "http://wdoor.c.u-tokyo.ac.jp";
const playingURL = `${floodgateBaseURL}/shogi/LATEST/playing.txt`;
const gameHistoryURL = `${floodgateBaseURL}/shogi/LATEST/floodgate_history_300_10F.yaml`;
const playersURL = `${floodgateBaseURL}/shogi/LATEST/floodgate-players.txt`;

export async function listLatestGames(): Promise<Game[]> {
  const playing = await listPlayingGames();
  const endedGames = await listEndedGames();
  return [...playing, ...endedGames];
}

const gameIDRegex =
  /^wdoor\+floodgate-([^+/]+)\+[^+/]+\+[^+/]+\+([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})$/;

function parseGameID(gameID: string): { rule: string; dateTime: Date } | undefined {
  const match = gameIDRegex.exec(gameID);
  if (!match) {
    return;
  }
  const rule = match[1];
  const year = match[2];
  const month = match[3];
  const day = match[4];
  const hour = match[5];
  const minute = match[6];
  const second = match[7];
  const dateTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
  return { rule, dateTime };
}

function getCSAFileURL(gameID: string): string | undefined {
  const match = gameIDRegex.exec(gameID);
  if (!match) {
    return;
  }
  const year = match[2];
  const month = match[3];
  const day = match[4];
  return `${floodgateBaseURL}/shogi/LATEST/${year}/${month}/${day}/${gameID}.csa`;
}

async function listPlayingGames(): Promise<Game[]> {
  const text = await api.loadRemoteTextFile(playingURL);
  const lines = text.split("\n");
  const games: Game[] = [];
  for (const line of lines) {
    const [filename, blackName, whiteName] = line.split(/\s+/);
    if (!filename || !blackName || !whiteName) {
      continue;
    }
    if (!filename.endsWith(".csa")) {
      continue;
    }
    const id = filename.slice(0, -4);
    const gameInfo = parseGameID(id);
    if (!gameInfo) {
      continue;
    }
    const url = getCSAFileURL(id);
    if (!url) {
      continue;
    }
    games.push({
      id,
      dateTime: gameInfo.dateTime,
      rule: gameInfo.rule,
      url,
      blackName,
      whiteName,
      playing: true,
    });
  }
  games.sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
  return games;
}

async function listEndedGames(): Promise<Game[]> {
  const yaml = await api.loadRemoteTextFile(gameHistoryURL);
  const list = YAML.parse(yaml);
  if (!Array.isArray(list)) {
    return [];
  }
  const games: Game[] = [];
  for (const entry of list) {
    const id = String(entry[":game_id"] || "");
    const gameInfo = parseGameID(id);
    const rule = gameInfo?.rule;
    const url = getCSAFileURL(id);
    const dateTime = gameInfo?.dateTime;
    const blackFullName = String(entry[":black"] || "");
    const whiteFullName = String(entry[":white"] || "");
    const blackName = blackFullName.split("+")[0];
    const whiteName = whiteFullName.split("+")[0];
    const winner =
      entry[":winner"] === ""
        ? undefined
        : entry[":winner"] === blackFullName
          ? Color.BLACK
          : Color.WHITE;
    if (id && rule && dateTime && url && blackName && whiteName) {
      games.push({
        id,
        dateTime,
        rule,
        url,
        blackName,
        whiteName,
        playing: false,
        winner,
      });
    }
  }
  games.sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
  return games;
}

export async function listPlayers(): Promise<Player[]> {
  const text = await api.loadRemoteTextFile(playersURL);
  const lines = text.split("\n");
  const players: Player[] = [];
  for (const line of lines) {
    const [name, rate] = line.split(/\s+/);
    if (!name || !rate) {
      continue;
    }
    players.push({ name, rate: parseInt(rate) });
  }
  return players;
}
