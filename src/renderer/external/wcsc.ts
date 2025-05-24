import api from "@/renderer/ipc/api";

export type Game = {
  title: string;
  url: string;
};

export async function listGames(edition: number): Promise<Game[]> {
  const url = `http://live4.computer-shogi.org/wcsc${edition}/list.txt`;
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
