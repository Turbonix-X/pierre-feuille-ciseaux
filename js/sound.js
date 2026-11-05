// ===== Sons (générés en direct, aucun fichier audio) et vibrations =====

const Sound = (() => {
  let ctx = null;
  let master = null;
  let reverb = null;
  let noise = null;
  let enabled = true;

  function audio() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -16;
      master.ratio.value = 4;
      master.connect(ctx.destination);
      reverb = ctx.createConvolver();
      reverb.buffer = makeImpulse(ctx, 1.1, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      reverb.connect(wet).connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Une petite salle, pour que les sons respirent
  function makeImpulse(c, seconds, decay) {
    const length = Math.floor(c.sampleRate * seconds);
    const buffer = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return buffer;
  }

  function noiseBuffer(c) {
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  // Enveloppe qui part vers la sortie (et un peu vers la réverbération)
  function env(c, peak, attack, decay, when = 0, send = 0.5) {
    const g = c.createGain();
    const t = c.currentTime + when;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(master);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(reverb);
    }
    return g;
  }

  function burstOf(c, { type = "bandpass", freq = 1000, q = 1, peak = 0.3, attack = 0.002, decay = 0.1, when = 0, send = 0.4, sweepTo = null }) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    const t = c.currentTime + when;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    src.connect(f).connect(env(c, peak, attack, decay, when, send));
    src.start(t, Math.random() * 1.5, attack + decay + 0.05);
  }

  function tone(c, { type = "sine", freq = 440, to = null, peak = 0.2, attack = 0.005, decay = 0.2, when = 0, send = 0.4 }) {
    const o = c.createOscillator();
    o.type = type;
    const t = c.currentTime + when;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    o.connect(env(c, peak, attack, decay, when, send));
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  const play = (fn) => (...args) => {
    const c = audio();
    if (c) fn(c, ...args);
  };

  return {
    // --- Interface ---
    click: play((c) => tone(c, { freq: 900, to: 500, peak: 0.08, attack: 0.002, decay: 0.05, send: 0 })),
    pick: play((c) => {
      tone(c, { type: "triangle", freq: 620, to: 880, peak: 0.11, decay: 0.09, send: 0.15 });
    }),
    tick: play((c, urgent = false) => tone(c, { type: "square", freq: urgent ? 1400 : 980, peak: urgent ? 0.07 : 0.045, attack: 0.001, decay: 0.035, send: 0 })),
    go: play((c) => {
      tone(c, { type: "triangle", freq: 660, peak: 0.12, decay: 0.08 });
      tone(c, { type: "triangle", freq: 990, peak: 0.13, decay: 0.14, when: 0.07 });
    }),
    // --- Le chant : trois coups de tambour qui montent ---
    beat: play((c, i = 0) => {
      const base = [120, 142, 170][i] || 120;
      tone(c, { freq: base * 1.6, to: base * 0.6, peak: 0.55, attack: 0.003, decay: 0.2, send: 0.3 });
      burstOf(c, { type: "lowpass", freq: 900, peak: 0.16, decay: 0.05, send: 0.2 });
    }),
    whoosh: play((c, d = 0.4, peak = 0.11) => {
      burstOf(c, { freq: 400, sweepTo: 2400, q: 1.1, peak, attack: d * 0.5, decay: d * 0.5, send: 0.25 });
    }),
    reveal: play((c) => {
      burstOf(c, { freq: 700, sweepTo: 3000, q: 0.8, peak: 0.09, attack: 0.04, decay: 0.14, send: 0.4 });
      tone(c, { type: "triangle", freq: 520, to: 1040, peak: 0.08, decay: 0.16 });
    }),
    // --- Les matières ---
    rockHit: play((c, strength = 1) => {
      tone(c, { freq: 150, to: 38, peak: 0.85 * strength, attack: 0.002, decay: 0.42, send: 0.6 });
      burstOf(c, { type: "lowpass", freq: 1500, sweepTo: 200, peak: 0.5 * strength, decay: 0.32, send: 0.6 });
      for (let k = 0; k < 6; k++) burstOf(c, { freq: 1200 + Math.random() * 2600, q: 5, peak: 0.1 * strength, decay: 0.05, when: 0.05 + k * 0.05 + Math.random() * 0.03, send: 0.4 });
    }),
    metal: play((c, strength = 1) => {
      const base = 1900 + Math.random() * 500;
      [1, 1.47, 2.09, 2.76, 3.9].forEach((r, k) => tone(c, { freq: base * r, peak: (0.1 * strength) / (k + 1), attack: 0.001, decay: 0.75 / (k * 0.5 + 1), send: 0.7 }));
      burstOf(c, { freq: 5000, q: 1, peak: 0.16 * strength, decay: 0.04 });
    }),
    snip: play((c) => {
      burstOf(c, { type: "highpass", freq: 4200, peak: 0.26, attack: 0.001, decay: 0.03, send: 0.2 });
      burstOf(c, { freq: 6400, q: 6, peak: 0.26, attack: 0.001, decay: 0.05, when: 0.05, send: 0.25 });
      tone(c, { freq: 3100, to: 2400, peak: 0.05, attack: 0.001, decay: 0.09, when: 0.05, send: 0.5 });
    }),
    rip: play((c, d = 0.3) => {
      const steps = 10;
      for (let k = 0; k < steps; k++) {
        burstOf(c, { freq: 1700 + Math.random() * 2600, q: 0.8, peak: 0.1 + Math.random() * 0.07, attack: 0.002, decay: d / steps, when: (k * d) / steps, send: 0.15 });
      }
    }),
    rustle: play((c, d = 0.5) => {
      const steps = 12;
      for (let k = 0; k < steps; k++) {
        burstOf(c, { type: "highpass", freq: 2200 + Math.random() * 3000, peak: 0.035 + Math.random() * 0.05, attack: 0.004, decay: 0.04, when: (k * d) / steps, send: 0.2 });
      }
    }),
    burn: play((c, d = 1.3) => {
      burstOf(c, { type: "lowpass", freq: 260, sweepTo: 950, peak: 0.34, attack: d * 0.3, decay: d * 0.7, send: 0.4 });
      for (let k = 0; k < 26; k++) burstOf(c, { freq: 2200 + Math.random() * 4000, q: 7, peak: 0.05 + Math.random() * 0.08, decay: 0.018, when: Math.random() * d, send: 0.2 });
    }),
    ignite: play((c) => {
      burstOf(c, { type: "lowpass", freq: 300, sweepTo: 1800, peak: 0.28, attack: 0.05, decay: 0.3, send: 0.5 });
    }),
    sizzle: play((c, d = 1) => {
      burstOf(c, { type: "highpass", freq: 3500, sweepTo: 7500, peak: 0.2, attack: 0.03, decay: d, send: 0.4 });
      for (let k = 0; k < 12; k++) tone(c, { freq: 500 + Math.random() * 900, to: 1500, peak: 0.03, attack: 0.002, decay: 0.03, when: Math.random() * d * 0.7, send: 0.3 });
    }),
    splash: play((c, strength = 1) => {
      burstOf(c, { type: "lowpass", freq: 2600, sweepTo: 300, peak: 0.42 * strength, attack: 0.004, decay: 0.5, send: 0.6 });
      for (let k = 0; k < 10; k++) {
        const f = 500 + Math.random() * 900;
        tone(c, { freq: f, to: f * 2.4, peak: 0.07, attack: 0.002, decay: 0.06 + Math.random() * 0.05, when: 0.05 + Math.random() * 0.5, send: 0.5 });
      }
    }),
    bubble: play((c, n = 8) => {
      for (let k = 0; k < n; k++) {
        const f = 350 + Math.random() * 500;
        tone(c, { freq: f, to: f * 2, peak: 0.08, attack: 0.002, decay: 0.07, when: k * 0.08 + Math.random() * 0.04, send: 0.5 });
      }
    }),
    creak: play((c) => {
      tone(c, { type: "sawtooth", freq: 180, to: 95, peak: 0.07, attack: 0.04, decay: 0.42, send: 0.5 });
      tone(c, { type: "sawtooth", freq: 260, to: 150, peak: 0.04, attack: 0.05, decay: 0.34, when: 0.1, send: 0.5 });
    }),
    boom: play((c) => {
      tone(c, { freq: 110, to: 32, peak: 0.8, attack: 0.002, decay: 0.5, send: 0.7 });
      burstOf(c, { type: "lowpass", freq: 3000, sweepTo: 150, peak: 0.42, decay: 0.5, send: 0.7 });
    }),
    clash: play((c) => {
      burstOf(c, { freq: 1500, q: 1.2, peak: 0.36, decay: 0.1, send: 0.6 });
      tone(c, { freq: 220, to: 90, peak: 0.34, decay: 0.2, send: 0.5 });
    }),
    sparkle: play((c) => {
      [1568, 1975.5, 2349.3, 3136].forEach((f, k) => tone(c, { freq: f, peak: 0.05, attack: 0.002, decay: 0.34, when: k * 0.055, send: 0.9 }));
    }),
    // --- Les attaques des armes personnalisées ---
    eject: play((c) => {
      tone(c, { type: "triangle", freq: 300, to: 2000, peak: 0.14, attack: 0.01, decay: 0.48, send: 0.6 });
      burstOf(c, { freq: 700, sweepTo: 3600, q: 1, peak: 0.13, attack: 0.03, decay: 0.42, send: 0.5 });
    }),
    charge: play((c) => {
      tone(c, { type: "sawtooth", freq: 90, to: 700, peak: 0.1, attack: 0.44, decay: 0.05, send: 0.3 });
      burstOf(c, { freq: 500, sweepTo: 4200, q: 3, peak: 0.1, attack: 0.44, decay: 0.05, send: 0.3 });
    }),
    suck: play((c) => {
      burstOf(c, { freq: 4200, sweepTo: 240, q: 2, peak: 0.2, attack: 0.65, decay: 0.3, send: 0.6 });
      tone(c, { type: "sine", freq: 950, to: 75, peak: 0.16, attack: 0.1, decay: 0.85, send: 0.6 });
    }),
    zap: play((c, strength = 1) => {
      for (let k = 0; k < 7; k++) burstOf(c, { type: "highpass", freq: 2200 + Math.random() * 4400, peak: 0.13 * strength, attack: 0.001, decay: 0.014, when: k * 0.016 + Math.random() * 0.005, send: 0.35 });
      tone(c, { type: "sawtooth", freq: 1300, to: 120, peak: 0.11 * strength, attack: 0.001, decay: 0.12, send: 0.5 });
    }),
    // --- Les résultats ---
    win: play((c) => {
      [659.3, 830.6, 987.8, 1318.5].forEach((f, k) => tone(c, { type: "triangle", freq: f, peak: 0.13, attack: 0.008, decay: 0.42, when: k * 0.075, send: 0.7 }));
    }),
    lose: play((c) => {
      [392, 329.6, 261.6].forEach((f, k) => tone(c, { type: "triangle", freq: f, peak: 0.12, attack: 0.01, decay: 0.42, when: k * 0.13, send: 0.6 }));
    }),
    draw: play((c) => {
      tone(c, { type: "triangle", freq: 440, peak: 0.08, attack: 0.008, decay: 0.2 });
      tone(c, { type: "triangle", freq: 440, peak: 0.08, attack: 0.008, decay: 0.26, when: 0.13 });
    }),
    fanfare: play((c) => {
      const notes = [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5];
      const times = [0, 0.11, 0.22, 0.34, 0.54, 0.65, 0.78];
      notes.forEach((f, k) => {
        const last = k === notes.length - 1;
        tone(c, { type: "triangle", freq: f, peak: 0.15, attack: 0.008, decay: last ? 1.3 : 0.24, when: times[k], send: 0.7 });
        tone(c, { type: "square", freq: f / 2, peak: 0.03, attack: 0.008, decay: last ? 1.1 : 0.2, when: times[k], send: 0.3 });
      });
    }),
    defeat: play((c) => {
      [392, 370, 349.2, 329.6].forEach((f, k) => tone(c, { type: "sawtooth", freq: f / 2, peak: 0.06, attack: 0.012, decay: k === 3 ? 0.9 : 0.26, when: k * 0.26, send: 0.6 }));
    }),
    // --- Le tournoi ---
    advance: play((c) => {
      burstOf(c, { freq: 500, sweepTo: 2600, q: 1, peak: 0.08, attack: 0.15, decay: 0.15, send: 0.5 });
      tone(c, { type: "triangle", freq: 784, peak: 0.1, decay: 0.2, when: 0.26 });
      tone(c, { type: "triangle", freq: 1174.7, peak: 0.1, decay: 0.3, when: 0.33 });
    }),
    shuffle: play((c, n = 14) => {
      for (let k = 0; k < n; k++) burstOf(c, { type: "highpass", freq: 2600 + Math.random() * 2000, peak: 0.07, attack: 0.002, decay: 0.03, when: k * 0.05, send: 0.2 });
    }),
    champion: play((c) => {
      const notes = [392, 523.3, 659.3, 784, 1046.5, 1318.5, 1568];
      notes.forEach((f, k) => {
        tone(c, { type: "triangle", freq: f, peak: 0.15, attack: 0.008, decay: k === 6 ? 1.8 : 0.3, when: k * 0.12, send: 0.9 });
        tone(c, { type: "sine", freq: f * 2, peak: 0.05, attack: 0.008, decay: k === 6 ? 1.4 : 0.22, when: k * 0.12, send: 0.9 });
      });
      for (let k = 0; k < 8; k++) burstOf(c, { freq: 5000 + Math.random() * 3000, q: 8, peak: 0.08, decay: 0.05, when: 1 + Math.random() * 1.2, send: 0.9 });
    }),
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },
  };
})();

const Haptics = (() => {
  let enabled = true;
  return {
    buzz(pattern) {
      // Le navigateur refuse de vibrer tant qu'on n'a pas touché la page
      const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (enabled && touched && navigator.vibrate) {
        try { navigator.vibrate(pattern); } catch (e) { /* non supporté */ }
      }
    },
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },
  };
})();
