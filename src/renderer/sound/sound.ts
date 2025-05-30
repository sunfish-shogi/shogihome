import {soundSourceMap, SoundType} from "@/renderer/assets/sound";

const preloadedSounds: { [path: string]: HTMLAudioElement } = {};

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
    let nextScheduleTime = this.audioContext.currentTime;;
    names.forEach(name => {
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

  getPlaceVoice(text: string): SoundType | undefined {
    if (text.includes(SoundType.ONE_ONE)) {
      return SoundType.ONE_ONE;
    }
    if (text.includes(SoundType.ONE_TWO)) {
      return SoundType.ONE_TWO;
    }
    if (text.includes(SoundType.ONE_THREE)) {
      return SoundType.ONE_THREE;
    }
    if (text.includes(SoundType.ONE_FOUR)) {
      return SoundType.ONE_FOUR;
    }
    if (text.includes(SoundType.ONE_FIVE)) {
      return SoundType.ONE_FIVE;
    }
    if (text.includes(SoundType.ONE_SIX)) {
      return SoundType.ONE_SIX;
    }
    if (text.includes(SoundType.ONE_SEVEN)) {
      return SoundType.ONE_SEVEN;
    }
    if (text.includes(SoundType.ONE_EIGHT)) {
      return SoundType.ONE_EIGHT;
    }
    if (text.includes(SoundType.ONE_NINE)) {
      return SoundType.ONE_NINE;
    }
    if (text.includes(SoundType.TWO_ONE)) {
      return SoundType.TWO_ONE;
    }
    if (text.includes(SoundType.TWO_TWO)) {
      return SoundType.TWO_TWO;
    }
    if (text.includes(SoundType.TWO_THREE)) {
      return SoundType.TWO_THREE;
    }
    if (text.includes(SoundType.TWO_FOUR)) {
      return SoundType.TWO_FOUR;
    }
    if (text.includes(SoundType.TWO_FIVE)) {
      return SoundType.TWO_FIVE;
    }
    if (text.includes(SoundType.TWO_SIX)) {
      return SoundType.TWO_SIX;
    }
    if (text.includes(SoundType.TWO_SEVEN)) {
      return SoundType.TWO_SEVEN;
    }
    if (text.includes(SoundType.TWO_EIGHT)) {
      return SoundType.TWO_EIGHT;
    }
    if (text.includes(SoundType.TWO_NINE)) {
      return SoundType.TWO_NINE;
    }
    if (text.includes(SoundType.THREE_ONE)) {
      return SoundType.THREE_ONE;
    }
    if (text.includes(SoundType.THREE_TWO)) {
      return SoundType.THREE_TWO;
    }
    if (text.includes(SoundType.THREE_THREE)) {
      return SoundType.THREE_THREE;
    }
    if (text.includes(SoundType.THREE_FOUR)) {
      return SoundType.THREE_FOUR;
    }
    if (text.includes(SoundType.THREE_FIVE)) {
      return SoundType.THREE_FIVE;
    }
    if (text.includes(SoundType.THREE_SIX)) {
      return SoundType.THREE_SIX;
    }
    if (text.includes(SoundType.THREE_SEVEN)) {
      return SoundType.THREE_SEVEN;
    }
    if (text.includes(SoundType.THREE_EIGHT)) {
      return SoundType.THREE_EIGHT;
    }
    if (text.includes(SoundType.THREE_NINE)) {
      return SoundType.THREE_NINE;
    }
    if (text.includes(SoundType.FOUR_ONE)) {
      return SoundType.FOUR_ONE;
    }
    if (text.includes(SoundType.FOUR_TWO)) {
      return SoundType.FOUR_TWO;
    }
    if (text.includes(SoundType.FOUR_THREE)) {
      return SoundType.FOUR_THREE;
    }
    if (text.includes(SoundType.FOUR_FOUR)) {
      return SoundType.FOUR_FOUR;
    }
    if (text.includes(SoundType.FOUR_FIVE)) {
      return SoundType.FOUR_FIVE;
    }
    if (text.includes(SoundType.FOUR_SIX)) {
      return SoundType.FOUR_SIX;
    }
    if (text.includes(SoundType.FOUR_SEVEN)) {
      return SoundType.FOUR_SEVEN;
    }
    if (text.includes(SoundType.FOUR_EIGHT)) {
      return SoundType.FOUR_EIGHT;
    }
    if (text.includes(SoundType.FOUR_NINE)) {
      return SoundType.FOUR_NINE;
    }
    if (text.includes(SoundType.FIVE_ONE)) {
      return SoundType.FIVE_ONE;
    }
    if (text.includes(SoundType.FIVE_TWO)) {
      return SoundType.FIVE_TWO;
    }
    if (text.includes(SoundType.FIVE_THREE)) {
      return SoundType.FIVE_THREE;
    }
    if (text.includes(SoundType.FIVE_FOUR)) {
      return SoundType.FIVE_FOUR;
    }
    if (text.includes(SoundType.FIVE_FIVE)) {
      return SoundType.FIVE_FIVE;
    }
    if (text.includes(SoundType.FIVE_SIX)) {
      return SoundType.FIVE_SIX;
    }
    if (text.includes(SoundType.FIVE_SEVEN)) {
      return SoundType.FIVE_SEVEN;
    }
    if (text.includes(SoundType.FIVE_EIGHT)) {
      return SoundType.FIVE_EIGHT;
    }
    if (text.includes(SoundType.FIVE_NINE)) {
      return SoundType.FIVE_NINE;
    }
    if (text.includes(SoundType.SIX_ONE)) {
      return SoundType.SIX_ONE;
    }
    if (text.includes(SoundType.SIX_TWO)) {
      return SoundType.SIX_TWO;
    }
    if (text.includes(SoundType.SIX_THREE)) {
      return SoundType.SIX_THREE;
    }
    if (text.includes(SoundType.SIX_FOUR)) {
      return SoundType.SIX_FOUR;
    }
    if (text.includes(SoundType.SIX_FIVE)) {
      return SoundType.SIX_FIVE;
    }
    if (text.includes(SoundType.SIX_SIX)) {
      return SoundType.SIX_SIX;
    }
    if (text.includes(SoundType.SIX_SEVEN)) {
      return SoundType.SIX_SEVEN;
    }
    if (text.includes(SoundType.SIX_EIGHT)) {
      return SoundType.SIX_EIGHT;
    }
    if (text.includes(SoundType.SIX_NINE)) {
      return SoundType.SIX_NINE;
    }
    if (text.includes(SoundType.SEVEN_ONE)) {
      return SoundType.SEVEN_ONE;
    }
    if (text.includes(SoundType.SEVEN_TWO)) {
      return SoundType.SEVEN_TWO;
    }
    if (text.includes(SoundType.SEVEN_THREE)) {
      return SoundType.SEVEN_THREE;
    }
    if (text.includes(SoundType.SEVEN_FOUR)) {
      return SoundType.SEVEN_FOUR;
    }
    if (text.includes(SoundType.SEVEN_FIVE)) {
      return SoundType.SEVEN_FIVE;
    }
    if (text.includes(SoundType.SEVEN_SIX)) {
      return SoundType.SEVEN_SIX;
    }
    if (text.includes(SoundType.SEVEN_SEVEN)) {
      return SoundType.SEVEN_SEVEN;
    }
    if (text.includes(SoundType.SEVEN_EIGHT)) {
      return SoundType.SEVEN_EIGHT;
    }
    if (text.includes(SoundType.SEVEN_NINE)) {
      return SoundType.SEVEN_NINE;
    }
    if (text.includes(SoundType.EIGHT_ONE)) {
      return SoundType.EIGHT_ONE;
    }
    if (text.includes(SoundType.EIGHT_TWO)) {
      return SoundType.EIGHT_TWO;
    }
    if (text.includes(SoundType.EIGHT_THREE)) {
      return SoundType.EIGHT_THREE;
    }
    if (text.includes(SoundType.EIGHT_FOUR)) {
      return SoundType.EIGHT_FOUR;
    }
    if (text.includes(SoundType.EIGHT_FIVE)) {
      return SoundType.EIGHT_FIVE;
    }
    if (text.includes(SoundType.EIGHT_SIX)) {
      return SoundType.EIGHT_SIX;
    }
    if (text.includes(SoundType.EIGHT_SEVEN)) {
      return SoundType.EIGHT_SEVEN;
    }
    if (text.includes(SoundType.EIGHT_EIGHT)) {
      return SoundType.EIGHT_EIGHT;
    }
    if (text.includes(SoundType.EIGHT_NINE)) {
      return SoundType.EIGHT_NINE;
    }
    if (text.includes(SoundType.NINE_ONE)) {
      return SoundType.NINE_ONE;
    }
    if (text.includes(SoundType.NINE_TWO)) {
      return SoundType.NINE_TWO;
    }
    if (text.includes(SoundType.NINE_THREE)) {
      return SoundType.NINE_THREE;
    }
    if (text.includes(SoundType.NINE_FOUR)) {
      return SoundType.NINE_FOUR;
    }
    if (text.includes(SoundType.NINE_FIVE)) {
      return SoundType.NINE_FIVE;
    }
    if (text.includes(SoundType.NINE_SIX)) {
      return SoundType.NINE_SIX;
    }
    if (text.includes(SoundType.NINE_SEVEN)) {
      return SoundType.NINE_SEVEN;
    }
    if (text.includes(SoundType.NINE_EIGHT)) {
      return SoundType.NINE_EIGHT;
    }
    if (text.includes(SoundType.NINE_NINE)) {
      return SoundType.NINE_NINE;
    }
    if (text.includes(SoundType.ONAJIKU)) {
      return SoundType.ONAJIKU;
    }
  }

  getKomaVoice(text: string): SoundType | undefined {
    if (text.includes(SoundType.NARIKYO)) {
      return SoundType.NARIKYO;
    }
    if (text.includes(SoundType.NARIKEI)) {
      return SoundType.NARIKEI;
    }
    if (text.includes(SoundType.NARIGIN)) {
      return SoundType.NARIGIN;
    }
    if (text.includes(SoundType.FU)) {
      return SoundType.FU;
    }
    if (text.includes(SoundType.KYO)) {
      return SoundType.KYO;
    }
    if (text.includes(SoundType.KEI)) {
      return SoundType.KEI;
    }
    if (text.includes(SoundType.GIN)) {
      return SoundType.GIN;
    }
    if (text.includes(SoundType.KIN)) {
      return SoundType.KIN;
    }
    if (text.includes(SoundType.KAKU)) {
      return SoundType.KAKU;
    }
    if (text.includes(SoundType.HISHA)) {
      return SoundType.HISHA;
    }
    if (text.includes(SoundType.OU)) {
      return SoundType.OU;
    }
    if (text.includes(SoundType.GYOKU)) {
      return SoundType.GYOKU;
    }
    if (text.includes(SoundType.TOKIN)) {
      return SoundType.TOKIN;
    }
    if (text.includes(SoundType.RYU)) {
      return SoundType.RYU;
    }
    if (text.includes(SoundType.UMA)) {
      return SoundType.UMA;
    }
  }

  getChangeVoice(text: string): SoundType | undefined {
    if (text.includes(SoundType.NARU)) {
      return SoundType.NARU;
    }
    if (text.includes(SoundType.NARAZU)) {
      return SoundType.NARAZU;
    }
  }

  createVoiceArray(displayText: string, nextColor: string): SoundType[] {
    const voices: SoundType[] = [];
    // 勝敗が決まったときの処理
    if (nextColor === SoundType.BLACK && displayText.startsWith("投了")) {
      voices.push(SoundType.MADE);
      voices.push(SoundType.WHITE_WIN);
      return voices;
    } else if (nextColor === SoundType.WHITE && displayText.startsWith("投了")) {
      voices.push(SoundType.MADE);
      voices.push(SoundType.BLACK_WIN);
      return voices;
    }
    // 対局中
    if (nextColor === SoundType.BLACK) {
      voices.push(SoundType.BLACK);
    } else if (nextColor === SoundType.WHITE) {
      voices.push(SoundType.WHITE);
    }
    let text = displayText.slice(1);
    const place = this.getPlaceVoice(text);
    if (place !== undefined) {
      voices.push(place);
      text = text.replace(place, "");
    }
    const koma = this.getKomaVoice(text);
    if (koma !== undefined) {
      voices.push(koma);
      text = text.replace(koma, "");
    }
    const change = this.getChangeVoice(text);
    if (change !== undefined) {
      voices.push(change);
      text = text.replace(change, "");
    }
    return voices;
  }

  read(displayText: string, nextColor: string) {
    const voices = this.createVoiceArray(displayText, nextColor);
    this.playSequence(voices);
  }
}
