import { soundSourceMap, SoundType } from "@/renderer/assets/sound";
import {
  ImmutableNode,
  SpecialMoveType,
  Color,
  SpecialMove,
  Move,
  PieceType,
  Square,
} from "tsshogi";

export class SoundManager {
  private synth: SpeechSynthesis;
  private audioContext: AudioContext;
  private audioBuffers: Map<string, AudioBuffer>; // 音源名をキーにAudioBufferを保存

  constructor() {
    this.synth = window.speechSynthesis;
    // 互換性のため AudioContext と webkitAudioContext を併用
    const win = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    this.audioContext = new (win.AudioContext || win.webkitAudioContext!)();
    this.audioBuffers = new Map();
    Object.values(SoundType).forEach((st) => {
      this.preloadSounds(st);
    });
  }

  async preloadSounds(name: SoundType): Promise<void> {
    const path = soundSourceMap[name as keyof typeof soundSourceMap];
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.audioBuffers.set(name, audioBuffer);
  }

  async playSequence(names: SoundType[]): Promise<void> {
    let nextScheduleTime = this.audioContext.currentTime;
    names.forEach((name) => {
      const audioBuffer = this.audioBuffers.get(name);
      if (!audioBuffer) {
        return;
      }
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start(nextScheduleTime);
      nextScheduleTime = nextScheduleTime + audioBuffer.duration;
    });
  }

  turnVoice(nextMove: Move): SoundType[] {
    const voices: SoundType[] = [];
    if (nextMove.color === Color.BLACK) {
      voices.push(SoundType.BLACK);
    } else if (nextMove.color === Color.WHITE) {
      voices.push(SoundType.WHITE);
    }
    return voices;
  }

  getPlaceVoice(currentMove: Move, nextMove: Move): SoundType[] {
    const voices: SoundType[] = [];

    if (nextMove.to === currentMove.to) {
      voices.push(SoundType.ONAJIKU);
      return voices;
    }
    const nextPlace = `${nextMove.to.file}${nextMove.to.rank}`;
    if (Object.values(SoundType).includes(nextPlace as SoundType)) {
      voices.push(nextPlace as SoundType);
    }

    return voices;
  }

  getPieceVoice(nextMove: Move): SoundType[] {
    const voices: SoundType[] = [];
    switch (nextMove.pieceType) {
      case PieceType.KING:
        voices.push(SoundType.GYOKU);
        break;
      case PieceType.GOLD:
        voices.push(SoundType.KIN);
        break;
      case PieceType.SILVER:
        voices.push(SoundType.GIN);
        break;
      case PieceType.KNIGHT:
        voices.push(SoundType.KEI);
        break;
      case PieceType.LANCE:
        voices.push(SoundType.KYO);
        break;
      case PieceType.BISHOP:
        voices.push(SoundType.KAKU);
        break;
      case PieceType.ROOK:
        voices.push(SoundType.HISHA);
        break;
      case PieceType.PAWN:
        voices.push(SoundType.FU);
        break;
      case PieceType.PROM_SILVER:
        voices.push(SoundType.NARIGIN);
        break;
      case PieceType.PROM_KNIGHT:
        voices.push(SoundType.NARIKEI);
        break;
      case PieceType.PROM_LANCE:
        voices.push(SoundType.NARIKYO);
        break;
      case PieceType.HORSE:
        voices.push(SoundType.UMA);
        break;
      case PieceType.DRAGON:
        voices.push(SoundType.RYU);
        break;
    }
    return voices;
  }

  changeVoice(nextMove: Move): SoundType[] {
    const voices: SoundType[] = [];
    if (nextMove.promote) {
      voices.push(SoundType.NARU);
    }
    return voices;
  }

  utuVoice(nextMove: Move): SoundType[] {
    const voices: SoundType[] = [];
    if (!(nextMove.from instanceof Square)) {
      if (Object.values(PieceType).includes(nextMove.from)) {
        voices.push(SoundType.UTU);
      }
    }
    return voices;
  }

  gameVoice(current: ImmutableNode): SoundType[] {
    const voices: SoundType[] = [];
    const currentMove = current.move as Move | null;
    if (!currentMove) {
      return voices;
    }
    const nextMove = current.next?.move as Move | null;
    if (!nextMove) {
      return voices;
    }
    voices.push(...this.turnVoice(nextMove));
    voices.push(...this.getPlaceVoice(currentMove, nextMove));
    voices.push(...this.getPieceVoice(nextMove));
    voices.push(...this.changeVoice(nextMove));
    voices.push(...this.utuVoice(nextMove));

    return voices;
  }

  gameEndVoice(current: ImmutableNode): SoundType[] {
    const voices: SoundType[] = [];
    if (
      current.next?.move &&
      "type" in current.next.move &&
      current.next?.move.type === SpecialMoveType.RESIGN
    ) {
      if (current.next?.nextColor === Color.BLACK) {
        voices.push(SoundType.MADE);
        voices.push(SoundType.WHITE_WIN);
      } else if (current.next?.nextColor === Color.WHITE) {
        voices.push(SoundType.MADE);
        voices.push(SoundType.BLACK_WIN);
      }
    }
    return voices;
  }

  createVoiceArray(current: ImmutableNode): SoundType[] {
    const voices: SoundType[] = [];
    // 勝敗が決まったときの処理
    voices.push(...this.gameEndVoice(current));
    if (voices.length > 0) {
      return voices;
    }
    voices.push(...this.gameVoice(current));
    return voices;
  }

  read(current: ImmutableNode): void {
    const voices = this.createVoiceArray(current);
    console.log(current);
    this.playSequence(voices);
  }
}
