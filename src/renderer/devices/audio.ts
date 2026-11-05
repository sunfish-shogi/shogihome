let lastLongBeep: OscillatorNode | undefined;
let context: AudioContext | undefined;

function getAudioContext(): AudioContext {
  if (!context || context.state === "closed") {
    context = new AudioContext();
  }
  return context;
}

function beep(params: { frequency: number; volume: number; time?: number }): void {
  if (params.volume <= 0) {
    return;
  }
  if (lastLongBeep) {
    return;
  }
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.type = "sine";
  oscillator.frequency.value = params.frequency;
  gain.gain.value = params.volume * 0.005;
  oscillator.onended = () => {
    gain.disconnect(context.destination);
    oscillator.disconnect(gain);
  };
  oscillator.start(context.currentTime);
  if (params?.time) {
    oscillator.stop(context.currentTime + params.time);
  }
  if (!params?.time) {
    lastLongBeep = oscillator;
  }
}

export function beepShort(params: { frequency: number; volume: number }): void {
  beep({
    frequency: params.frequency,
    time: 0.1,
    volume: params.volume,
  });
}

export function beepUnlimited(params: { frequency: number; volume: number }): void {
  beep({
    frequency: params.frequency,
    volume: params.volume,
  });
}

export function stopBeep(): void {
  if (lastLongBeep) {
    lastLongBeep.stop();
    lastLongBeep = undefined;
  }
}

const PIECE_SOUND_URL = "sound/piece.mp3";

// デコード済みの駒音。初回の再生時に一度だけ取得してデコードし、以後は使い回す。
//
// 再生のたびに new Audio() すると、メディア要素ごとにファイルの要求が発生する。
// Web 版では Service Worker の再検証 (304) が毎回走り、メディア要素の Range 付きの
// 要求は 206 が返るため Service Worker のキャッシュにも保存されない。
// fetch() で取得すれば Range の無い通常の要求になり、要求も初回の 1 回だけで済む。
let pieceSound: Promise<AudioBuffer> | undefined;

function loadPieceSound(context: AudioContext): Promise<AudioBuffer> {
  if (!pieceSound) {
    pieceSound = (async () => {
      const response = await fetch(PIECE_SOUND_URL);
      if (!response.ok) {
        throw new Error(`failed to load ${PIECE_SOUND_URL}: ${response.status}`);
      }
      return await context.decodeAudioData(await response.arrayBuffer());
    })().catch((e) => {
      // 失敗した場合は次回の再生で取得し直す。
      pieceSound = undefined;
      throw e;
    });
  }
  return pieceSound;
}

let lastPieceBeatTime: number;

export function playPieceBeat(volume: number): void {
  if (volume <= 0) {
    return;
  }
  const time = Date.now();
  if (lastPieceBeatTime && time < lastPieceBeatTime + 200) {
    return;
  }
  lastPieceBeatTime = time;
  const context = getAudioContext();
  // 自動再生の制限などで停止している場合に備える。
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
  loadPieceSound(context)
    .then((buffer) => {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = volume * 0.01;
      source.connect(gain);
      gain.connect(context.destination);
      source.onended = () => {
        gain.disconnect(context.destination);
        source.disconnect(gain);
      };
      source.start();
    })
    .catch(() => {
      // 効果音が鳴らないだけなので無視する。
    });
}
