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

let lastPieceBeatTime: number;

export function playPieceBeat(volume: number): void {
  if (volume <= 0) {
    return;
  }
  const time = Date.now();
  if (lastPieceBeatTime && time < lastPieceBeatTime + 200) {
    return;
  }
  const audio = new Audio("sound/piece.mp3");
  audio.volume = volume * 0.01;
  audio.play();
  lastPieceBeatTime = time;
}
