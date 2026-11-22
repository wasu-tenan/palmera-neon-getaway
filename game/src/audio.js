// Every sound in Palmera City is synthesized with WebAudio — no audio files.
// A lazy AudioContext wakes on the first user gesture; the engine hum, the
// two-tone siren and a slow bass groove run as standing nodes whose gains the
// game rides each frame, and the one-shots (shots, punches, crashes, cash,
// jingles) are built per call from oscillators and filtered noise.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineNodes = null;
  let sirenNodes = null;
  let musicNodes = null;
  let musicTimer = 0;
  let musicStep = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function noiseBuffer() {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  let sharedNoise = null;
  function noise() {
    if (!sharedNoise) sharedNoise = noiseBuffer();
    return sharedNoise;
  }

  function blip(freqA, freqB, seconds, type, gainValue, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t + seconds);
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function burst(seconds, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + seconds + 0.02);
  }

  function startEngine() {
    if (!ensure() || engineNodes) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(master);
    osc.start();
    sub.start();
    engineNodes = { osc, sub, gain, filter };
  }

  function setEngine(speedRatio, running) {
    if (!engineNodes) return;
    const t = ctx.currentTime;
    const freq = 50 + speedRatio * 165;
    engineNodes.osc.frequency.setTargetAtTime(freq, t, 0.06);
    engineNodes.sub.frequency.setTargetAtTime(freq / 2, t, 0.06);
    engineNodes.filter.frequency.setTargetAtTime(280 + speedRatio * 900, t, 0.08);
    engineNodes.gain.gain.setTargetAtTime(running ? 0.055 + speedRatio * 0.05 : 0.0, t, 0.09);
  }

  function stopEngine() {
    if (!engineNodes) return;
    try { engineNodes.osc.stop(); engineNodes.sub.stop(); } catch { /* already stopped */ }
    engineNodes = null;
  }

  function startSiren() {
    if (!ensure() || sirenNodes) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 660;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain).connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, lfo, gain };
  }

  function setSiren(level) {
    if (!sirenNodes) return;
    sirenNodes.gain.gain.setTargetAtTime(Math.min(0.05, level * 0.05), ctx.currentTime, 0.15);
  }

  function stopSiren() {
    if (!sirenNodes) return;
    try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
    sirenNodes = null;
  }

  // A lazy beach-town groove: a four-bar bass line and soft hats, scheduled a
  // step ahead from the game's frame loop so it never drifts when tabbed away.
  const BASS_LINE = [55, 0, 55, 65.4, 0, 49, 0, 55, 61.7, 0, 55, 0, 73.4, 0, 65.4, 0];
  function startMusic() {
    if (!ensure() || musicNodes) return;
    musicNodes = { on: true };
    musicStep = 0;
    musicTimer = 0;
  }
  function stopMusic() {
    musicNodes = null;
  }
  function updateMusic(dt) {
    if (!musicNodes || !ctx) return;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer = 0.21;
    const note = BASS_LINE[musicStep % BASS_LINE.length];
    if (note > 0) blip(note, note, 0.19, 'triangle', 0.055);
    if (musicStep % 2 === 0) burst(0.03, 6000, 0.012, 'highpass');
    if (musicStep % 16 === 8) blip(220, 220, 0.3, 'sine', 0.02);
    musicStep += 1;
  }

  return {
    wake: ensure,
    setMuted(value) {
      muted = value;
      if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.5, ctx.currentTime, 0.03);
    },
    isMuted: () => muted,
    shot() { burst(0.16, 1800, 0.5); blip(160, 40, 0.12, 'square', 0.25); },
    punch() { burst(0.08, 500, 0.3); },
    hit() { blip(120, 60, 0.1, 'square', 0.2); },
    crash(strength) { burst(0.25, 700, Math.min(0.6, 0.2 + strength * 0.4)); blip(90, 35, 0.22, 'sawtooth', 0.2); },
    door() { blip(300, 180, 0.07, 'square', 0.12); },
    pickup() { blip(660, 990, 0.09, 'sine', 0.18); },
    cash() { blip(880, 880, 0.07, 'square', 0.12); blip(1318, 1318, 0.12, 'square', 0.12, 0.07); },
    denied() { blip(180, 120, 0.16, 'square', 0.16); },
    jingle(win) {
      const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
      notes.forEach((n, i) => blip(n, n, 0.16, 'triangle', 0.2, i * 0.11));
    },
    startEngine, setEngine, stopEngine,
    startSiren, setSiren, stopSiren,
    startMusic, stopMusic, updateMusic,
  };
}
