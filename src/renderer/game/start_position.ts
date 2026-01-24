import { detectRecordFormat, Record, RecordFormatType } from "tsshogi";
import api from "@/renderer/ipc/api.js";

export class StartPositionList {
  private usiList: string[] = [];
  private maxRepeat: number = 1;
  private index = 0;
  private repeat = 0;

  clear(): void {
    this.usiList = [];
    this.maxRepeat = 1;
    this.index = 0;
    this.repeat = 0;
  }

  async reset(params: {
    filePath: string;
    swapPlayers: boolean;
    order: "sequential" | "shuffle";
    maxGames: number;
  }): Promise<void> {
    // load SFEN file
    const usiList = await api.loadSFENFile(params.filePath);
    if (params.order === "shuffle") {
      for (let i = usiList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [usiList[i], usiList[j]] = [usiList[j], usiList[i]];
      }
    }
    const maxPositions = Math.ceil(params.maxGames / (params.swapPlayers ? 2 : 1));
    if (usiList.length > maxPositions) {
      usiList.length = maxPositions;
    }

    // add "sfen " prefix to simple SFEN strings
    for (let i = 0; i < usiList.length; i++) {
      if (
        !usiList[i].startsWith("sfen ") &&
        detectRecordFormat(usiList[i]) === RecordFormatType.SFEN
      ) {
        usiList[i] = `sfen ${usiList[i]}`;
      }
    }

    // validate USI
    if (usiList.length === 0) {
      throw new Error("No available positions in the list.");
    }
    for (let i = 0; i < usiList.length; i++) {
      const record = Record.newByUSI(usiList[i]);
      if (!(record instanceof Record)) {
        throw record;
      }
    }

    this.usiList = usiList;
    this.maxRepeat = params.swapPlayers ? 2 : 1;
    this.index = 0;
    this.repeat = 0;
  }

  next(): string {
    if (this.usiList.length === 0) {
      return "position startpos";
    }
    if (this.repeat < this.maxRepeat) {
      this.repeat++;
    } else {
      this.index++;
      this.repeat = 1;
      if (this.index >= this.usiList.length) {
        this.index = 0;
      }
    }
    return this.usiList[this.index];
  }
}
