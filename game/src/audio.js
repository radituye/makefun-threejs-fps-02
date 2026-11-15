// Synthesised sound effects: every sound is built from oscillators and filtered
// noise at runtime, so the game ships no audio files and makes no network request.
// The context is created on the first user gesture (the play click), because a
// browser will not let audio start before one. M toggles mute.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
    const length = context.sampleRate * 0.5;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(duration, filterType, frequency, gainValue, decay = 0.001) {
    if (!ensure() || !context) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(decay, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  function tone(type, from, to, duration, gainValue) {
    if (!ensure() || !context) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    const now = context.currentTime;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function click(delay, frequency = 2200) {
    if (!ensure() || !context) return;
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.04);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shot(kind) {
      // A crack (noise through a high-pass) over a low thump; heavier guns thump lower.
      const thump = kind === 'lance' ? 90 : kind === 'harrier' ? 130 : kind === 'hornet' ? 170 : 210;
      noise(0.09, 'highpass', 900, kind === 'lance' ? 0.5 : 0.34);
      tone('sine', thump, 45, 0.12, 0.5);
    },
    enemyShot(distance) {
      const volume = Math.max(0.05, 0.3 - distance * 0.006);
      noise(0.08, 'bandpass', 700, volume);
      tone('sine', 120, 50, 0.1, volume * 0.8);
    },
    dryFire() {
      click(0, 1600);
    },
    reload() {
      click(0, 1800);
      click(0.25, 1200);
      click(0.55, 2400);
    },
    hit() {
      tone('sine', 1500, 1100, 0.05, 0.22);
    },
    kill() {
      tone('sine', 880, 880, 0.07, 0.25);
      tone('sine', 1320, 1320, 0.09, 0.2);
    },
    hurt() {
      tone('sawtooth', 160, 70, 0.18, 0.25);
      noise(0.12, 'lowpass', 400, 0.2);
    },
    buy() {
      tone('sine', 660, 660, 0.06, 0.2);
      tone('sine', 990, 990, 0.08, 0.18);
    },
    denied() {
      tone('square', 220, 180, 0.12, 0.14);
    },
    plantBeep(final) {
      tone('sine', final ? 1400 : 980, final ? 1400 : 980, final ? 0.3 : 0.09, 0.22);
    },
    defuseBeep() {
      tone('sine', 740, 740, 0.07, 0.16);
    },
    explosion() {
      noise(0.9, 'lowpass', 320, 0.9);
      tone('sine', 110, 28, 0.8, 0.8);
      noise(0.25, 'highpass', 1400, 0.3);
    },
    grenadePin() {
      click(0, 2600);
    },
    bounce() {
      tone('sine', 320, 180, 0.06, 0.12);
    },
    roundWin() {
      [523, 659, 784].forEach((frequency, index) => {
        if (!ensure() || !context) return;
        const now = context.currentTime + index * 0.12;
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        oscillator.connect(gain).connect(master);
        oscillator.start(now);
        oscillator.stop(now + 0.24);
      });
    },
    roundLose() {
      [392, 330, 262].forEach((frequency, index) => {
        if (!ensure() || !context) return;
        const now = context.currentTime + index * 0.14;
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        oscillator.connect(gain).connect(master);
        oscillator.start(now);
        oscillator.stop(now + 0.28);
      });
    },
  };
}
