import { PlayerSettings } from "@/common/settings/player.js";
import { humanPlayer } from "./human.js";
import { Player, SearchInfo } from "./player.js";
import { USIPlayer } from "./usi.js";
import { BasicPlayer } from "./basic.js";
import * as uri from "@/common/uri.js";

export interface PlayerBuilder {
  build(playerSettings: PlayerSettings, onSearchInfo?: (info: SearchInfo) => void): Promise<Player>;
}

export function defaultPlayerBuilder(engineTimeoutSeconds?: number): PlayerBuilder {
  return {
    async build(
      playerSettings: PlayerSettings,
      onSearchInfo?: (info: SearchInfo) => void,
    ): Promise<Player> {
      if (playerSettings.uri === uri.ES_HUMAN) {
        return humanPlayer;
      } else if (uri.isBasicEngine(playerSettings.uri)) {
        return new BasicPlayer(playerSettings.uri);
      } else if (uri.isUSIEngine(playerSettings.uri) && playerSettings.usi) {
        const player = new USIPlayer(playerSettings.usi, engineTimeoutSeconds ?? 10, onSearchInfo);
        await player.launch();
        return player;
      }
      throw new Error(
        "defaultPlayerBuilder#build: 予期せぬプレイヤーURIです: " + playerSettings.uri,
      );
    },
  };
}
