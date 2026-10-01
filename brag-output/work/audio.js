// Music + SFX written as one piece: 120 BPM, A minor (Am–F–C–G), bars land on t = 0.5 + 2k.
// Everything renders offline and deterministically.
window.renderAudio = async function (DUR, EV) {
  const SR = 48000, TAIL = 0;
  const ctx = new OfflineAudioContext(2, Math.ceil((DUR + TAIL) * SR), SR);
  const BEAT = 0.5, OFF = 0.0; // bar downbeats at 0, 2, 4 …
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // deterministic noise
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const noiseBuf = (sec) => {
    const b = ctx.createBuffer(1, Math.ceil(sec * SR), SR), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd();
    return b;
  };
  const NOISE = noiseBuf(2);

  // master chain
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2; comp.knee.value = 8;
  master.connect(comp).connect(ctx.destination);
  // fade master at the very end
  master.gain.setValueAtTime(0.9, DUR - 0.6); master.gain.linearRampToValueAtTime(0.0, DUR);

  // shared reverb (generated impulse)
  const rev = ctx.createConvolver();
  const ir = ctx.createBuffer(2, SR * 2.2, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * Math.pow(1 - i / d.length, 3.2); }
  rev.buffer = ir;
  const revOut = ctx.createGain(); revOut.gain.value = 0.32; rev.connect(revOut).connect(master);

  // buses
  const bus = (g, revSend = 0) => { const n = ctx.createGain(); n.gain.value = g; n.connect(master); if (revSend) { const s = ctx.createGain(); s.gain.value = revSend; n.connect(s).connect(rev); } return n; };
  const musicBus = bus(1.0, 0.25);
  const drumBus = bus(0.9, 0.05);
  const sfxBus = bus(0.55, 0.45);

  // sidechain-ish duck on the music bus following the kick
  const duck = (t) => { musicBus.gain.setValueAtTime(0.55, t); musicBus.gain.linearRampToValueAtTime(1.0, t + 0.22); };

  // harmony: one chord per bar
  const CH = { Am: [57, 60, 64], F: [53, 57, 60], C: [55, 60, 64], G: [55, 59, 62] };
  const ROOT = { Am: 45, F: 41, C: 48, G: 43 };
  const CYCLE = ['Am', 'F', 'C', 'G'];
  const chordAt = (t) => (t >= EV.punch - 0.01 ? 'Am' : CYCLE[Math.floor(t / 2) % 4]);

  // --- instruments
  function pad(t0, dur, notes, gain, cutoff) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.25); g.gain.setValueAtTime(gain, t0 + dur - 0.2); g.gain.linearRampToValueAtTime(0, t0 + dur + 0.3);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.4;
    f.connect(g).connect(musicBus);
    notes.forEach((n) => [-7, 7].forEach((det) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = 0.06; o.connect(og).connect(f); o.start(t0); o.stop(t0 + dur + 0.4);
    }));
  }
  function bass(t0, dur, n, gain) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n);
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = midi(n - 12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.01); g.gain.exponentialRampToValueAtTime(gain * 0.35, t0 + dur * 0.9); g.gain.linearRampToValueAtTime(0, t0 + dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    o.connect(f); s.connect(f); f.connect(g).connect(musicBus);
    o.start(t0); s.start(t0); o.stop(t0 + dur + 0.05); s.stop(t0 + dur + 0.05);
  }
  function pluck(t0, n, gain, bus = musicBus, decay = 0.25) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = midi(n + 12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t0 + decay);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g); g.connect(bus);
    o.start(t0); o2.start(t0); o.stop(t0 + decay + 0.05); o2.stop(t0 + decay + 0.05);
  }
  function kick(t0, gain = 0.9) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(44, t0 + 0.14);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.38);
    o.connect(g).connect(drumBus); o.start(t0); o.stop(t0 + 0.4); duck(t0);
  }
  function noiseHit(t0, dur, type, freq, q, gain, bus = drumBus) {
    const s = ctx.createBufferSource(); s.buffer = NOISE; s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f).connect(g).connect(bus); s.start(t0, (t0 * 0.37) % 1.5); s.stop(t0 + dur + 0.02);
  }
  const hat = (t, g = 0.09) => noiseHit(t, 0.05, 'highpass', 8000, 0.7, g);
  const clap = (t, g = 0.22) => { noiseHit(t, 0.16, 'bandpass', 1600, 0.9, g); noiseHit(t + 0.012, 0.12, 'bandpass', 1200, 0.9, g * 0.6); };
  function whoosh(t0, dur, from, to, gain) {
    const s = ctx.createBufferSource(); s.buffer = NOISE;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(sfxBus); s.start(t0, 0.3); s.stop(t0 + dur + 0.02);
  }
  function boom(t0, gain) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(32, t0 + 0.9);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
    o.connect(g).connect(sfxBus); o.start(t0); o.stop(t0 + 1.5);
    noiseHit(t0, 0.6, 'lowpass', 900, 0.5, gain * 0.35, sfxBus);
  }
  function chime(t0, notes, gain) {
    notes.forEach((n, i) => {
      const t = t0 + i * 0.09;
      [1, 2.01, 3.0].forEach((h, k) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n) * h;
        const g = ctx.createGain(); const a = gain / (k + 1) / (k ? 2 : 1);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9 - k * 0.2);
        o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 1);
      });
    });
  }
  function click(t0) {
    noiseHit(t0, 0.03, 'bandpass', 3500, 2, 0.25, sfxBus);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(81);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    o.connect(g).connect(sfxBus); o.start(t0); o.stop(t0 + 0.1);
  }
  function riser(t0, t1, gain) {
    const s = ctx.createBufferSource(); s.buffer = NOISE; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(600, t0); f.frequency.exponentialRampToValueAtTime(7000, t1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
    s.connect(f).connect(g).connect(sfxBus); s.start(t0); s.stop(t1 + 0.02);
  }

  // --- arrangement
  const P = EV.punch, R = EV.reveal, X = EV.cuts[0]; // X: drums enter with the inbox scene
  for (let t0 = 0; t0 < P; t0 += 2) {
    const d = Math.min(2, P - t0);
    pad(t0, d, CH[chordAt(t0)], t0 < R ? 0.6 : 0.72, t0 < X ? 900 : t0 < R ? 1500 : 2300);
  }
  pad(P, DUR - P, [57, 60, 64, 69], 0.75, 2600); // final ringing chord

  for (let t = 0; t < P - 0.5; t += BEAT / 4) {
    const step = Math.round(t / (BEAT / 4)), c = CH[chordAt(t)];
    const seq = [0, 1, 2, 1, 2, 0, 1, 2];
    pluck(t, c[seq[step % 8]] + 12, t < X ? 0.035 : t < R ? 0.05 : 0.055, musicBus, 0.18);
  }
  for (let t = 0.5; t < X; t += BEAT / 2) hat(t, 0.04);

  const gap = (t) => t > R - 0.5 && t < R; // breath before the reveal
  for (let t = X; t < P - 0.5 - 1e-6; t += BEAT) {
    if (gap(t)) continue;
    const beat = Math.round(t / BEAT) % 4;
    kick(t, t < R ? 0.7 : 0.88);
    if (beat === 1 || beat === 3) clap(t, t < R ? 0.12 : 0.19);
    hat(t + BEAT / 2, 0.065);
    if (t >= R) hat(t + BEAT / 4, 0.03);
  }
  for (let t = X; t < P - 0.5 - 1e-6; t += BEAT / 2) {
    if (gap(t)) continue;
    bass(t, BEAT / 2 - 0.02, ROOT[chordAt(t)], t < R ? 0.16 : 0.21);
  }
  for (let t = P; t < DUR - 1.5; t += BEAT * 2) kick(t, 0.5);
  bass(P, 2.0, 45, 0.22); bass(P + 2, 1.8, 45, 0.17);

  // --- SFX (A minor)
  EV.clicks.forEach(click);
  EV.cuts.forEach((t) => whoosh(t - 0.3, 0.45, 500, 3800, 0.13));
  EV.pushes.forEach((t) => whoosh(t - 0.25, 0.6, 2500, 400, 0.11));
  chime(EV.toast, [76, 81], 0.12);
  whoosh(EV.toast + 0.5, 0.9, 300, 1600, 0.06);
  riser(R - 1.5, R, 0.12);
  boom(R, 0.55); chime(R, [69, 76], 0.07);
  const TICK = [81, 84, 88, 84];
  EV.ticks.forEach((t, i) => pluck(t, TICK[i % 4], 0.11, sfxBus, 0.5));
  whoosh(P - 0.4, 0.4, 600, 5000, 0.12);
  boom(P, 0.5);
  [69, 72, 76].forEach((n, i) => pluck(EV.stats[i], n, 0.13, sfxBus, 0.6));
  chime(EV.outro, [81, 88], 0.05);

  return await ctx.startRendering();
};
