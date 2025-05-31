import { wcscGameListsURL } from "@/common/links/github";
import api from "@/renderer/ipc/api";

export type Edition = {
  name: string;
  year: number;
  url: string;
};

export type Game = {
  title: string;
  url: string;
};

export async function listEditions(): Promise<Edition[]> {
  const json = await api.loadRemoteTextFile(wcscGameListsURL);
  return JSON.parse(json) as Edition[];
}

export async function listGames(url: string): Promise<Game[]> {
  const text = await api.loadRemoteTextFile(url);
  const games: Game[] = [];
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  for (let i = 1; i < lines.length; i++) {
    const url = lines[i];
    if (!url.startsWith("http")) {
      continue;
    }
    const title = lines[i - 1];
    games.push({ title, url });
  }
  return games;
}
