// ===== Le site : déroulement des manches, réglages, tournoi, personnalisation, sauvegarde =====

const SAVE_KEY = "pfc-save";
const PREFS_KEY = "tx-prefs";
const SAVE_VERSION = 1;
const MAX_CUSTOM = 12;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MODE_TEXT = {
  normal: "Le jeu classique : chacun joue en même temps, et l’arme la plus forte gagne la manche.",
  inverse: "Tout à l’envers : le combat se déroule normalement, mais c’est celui qui le perd qui marque le point !",
  mirror: "Il faut jouer la même chose. À chaque manche, le 🎯 chasseur marque s’il joue le même coup que le 🏃 fugitif. Sinon, personne ne marque, et les rôles s’échangent.",
  blind: "L’ordi annonce son coup à l’avance… mais il peut mentir. À toi de décider si tu le crois. Tu règles ses chances de mentir dans les réglages.",
  duo: "Vous jouez ensemble : faites le même signe pour marquer tous les deux. Attention, chaque signe différent compte comme un raté.",
};
const modeText = (mode) => (mode === "blitz"
  ? `Tu as ${settings.blitz} secondes pour choisir. Passé ce délai, tu perds la manche. Contre un bot, les manches s’enchaînent toutes seules.`
  : MODE_TEXT[mode]);

const CHANT = ["Pierre…", "Feuille…", "Ciseaux…", "Go !"];

const COLOR_PRESETS = ["#ffd60a", "#9b6dff", "#e8336f", "#1d4ed8", "#0f7b5f", "#f3f1f8", "#16141c"];
const SKIN_PRESETS = ["#fde0c8", "#f5c8a0", "#e5a97c", "#c98a5b", "#a56a3f", "#7a4a2a", "#4f2f1c"];
const ROCK_SHADES = [
  ["#121214", "Noir de jais"], ["#23252a", "Noir charbon"], ["#34373d", "Anthracite"], ["#4b4f57", "Ardoise"],
  ["#6c7078", "Gris"], ["#92969e", "Gris clair"], ["#bcc0c6", "Gris perle"],
];
const INK_COLORS = ["#15131c", "#1d4ed8", "#c1121f", "#0f7b5f", "#6f45d9", "#ff8800", "#e8336f"];
const NOMS_FR = {
  rouge: "#e11d2e", bleu: "#1d4ed8", vert: "#16a34a", jaune: "#ffd60a", noir: "#141414", blanc: "#ffffff",
  gris: "#808080", orange: "#ff8800", violet: "#7c3aed", mauve: "#9b6dff", rose: "#ff4d8d", marron: "#7c4a21",
  turquoise: "#14b8a6", or: "#d4af37", argent: "#c0c0c0", cyan: "#22d3ee", bordeaux: "#7b1e3a", beige: "#e8dcc0",
};

const DEFAULT_KEYS = () => ({ rock: "Digit1", paper: "Digit2", scissors: "Digit3", fire: "Digit4", water: "Digit5" });

const DEFAULT_SETTINGS = () => ({
  mode: "normal",
  opponent: "bot",
  level: 5,
  format: { type: "bo", n: 3 },
  firstTo: 5,
  speed: 1,
  handStyle: "gesture",
  truth: 50,
  blitz: 2,
  extras: { fire: false, water: false },
  keys: DEFAULT_KEYS(),
  keyLabels: {},
  restartKey: "KeyR",
  names: ["Toi", "L’ordi"],
});

const DEFAULT_COSMETICS = () => [
  { skin: "#e5a97c", rock: { color: "#4b4f57", pattern: "plain" }, scissors: { color: "#ffd60a", rust: false }, paper: { text: "Turbonix", textColor: "#15131c", ink: null } },
  { skin: "#a56a3f", rock: { color: "#23252a", pattern: "veined" }, scissors: { color: "#9b6dff", rust: false }, paper: { text: "L’ordi t’a vu", textColor: "#6f45d9", ink: null } },
];

const emptyStats = () => ({
  rounds: 0, wins: 0, losses: 0, draws: 0, matches: 0, matchWins: 0, streak: 0, weapons: {},
  levels: Array.from({ length: 21 }, () => ({ m: 0, w: 0, l: 0, rw: 0, rl: 0, rd: 0 })),
});

let settings = DEFAULT_SETTINGS();
let cosmetics = DEFAULT_COSMETICS();
let customs = [];
let overrides = {};
let stats = emptyStats();
let memory = {};
let memorySig = "";

let roundLog = [];
let recentColors = [];

let set = null;
let match = null;
let matchCounter = 0;
let phase = "idle";
let chooser = 0;
let picks = [undefined, undefined];
let decisions = [null, null];
let announcement = null;
let runToken = 0;
let timerRaf = 0;
let timerEnd = 0;
let timerTicks = 0;
let lastRecord = null;
let blitzTimer = 0;
let blitzPaused = false;

let tour = null;
let tourSetup = null;
let tourMatch = null;
let tourView = "setup";
let tourBusy = false;

let cosSide = 0;
const thumbs = [{}, {}];

// --- Couleurs et petits outils -------------------------------------------------

const probe = document.createElement("canvas").getContext("2d");
function parseColor(text) {
  let s = text.trim().toLowerCase();
  if (!s) return null;
  if (NOMS_FR[s]) return NOMS_FR[s];
  if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(s)) s = "#" + s;
  probe.fillStyle = "#010203";
  probe.fillStyle = s;
  const out = probe.fillStyle;
  if (out === "#010203" && s !== "#010203") return null;
  return out.startsWith("#") ? out : null;
}

let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function setPill(el, index) {
  el.dataset.active = index;
  el.querySelectorAll("button").forEach((b, k) => b.classList.toggle("active", k === index));
}

function burst(zone, amount = 26, big = false) {
  if (reduceMotion()) return;
  const colors = ["#ffd60a", "#9b6dff", "#ffffff", "#ffe766", "#c4a8ff"];
  for (let k = 0; k < amount; k++) {
    const p = document.createElement("span");
    p.className = big && k % 3 === 0 ? "particle star" : "particle";
    p.style.background = p.style.color = colors[k % colors.length];
    const size = (big ? 6 : 4) + Math.random() * (big ? 10 : 7);
    p.style.width = p.style.height = size + "px";
    if (big) { p.style.left = 20 + Math.random() * 60 + "%"; p.style.top = 25 + Math.random() * 50 + "%"; }
    zone.appendChild(p);
    const a = Math.random() * Math.PI * 2;
    const d = (big ? 90 : 70) + Math.random() * (big ? 160 : 110);
    p.animate([
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.2)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.15,.7,.3,1)" }).onfinish = () => p.remove();
  }
}

function showBanner(title, sub) {
  const zone = $("arena");
  zone.querySelectorAll(".banner").forEach((b) => b.remove());
  const b = document.createElement("div");
  b.className = "banner";
  b.innerHTML = `<span>${esc(title)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}`;
  zone.appendChild(b);
  b.addEventListener("animationend", () => b.remove());
  zone.classList.remove("jackpot");
  void zone.offsetWidth;
  zone.classList.add("jackpot");
  setTimeout(() => zone.classList.remove("jackpot"), 3600);
}

// Confettis jaunes et mauves
let confettiPieces = [];
let confettiRaf = 0;
function confetti(amount = 140) {
  if (reduceMotion()) return;
  const canvas = $("confetti");
  const ratio = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  const g = canvas.getContext("2d");
  const colors = ["#ffd60a", "#ffe766", "#9b6dff", "#c9b0ff", "#ffffff"];
  for (let i = 0; i < amount; i++) {
    confettiPieces.push({
      x: innerWidth * (0.15 + Math.random() * 0.7),
      y: -20 - Math.random() * innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3.5,
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 5,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[i % colors.length],
      t: Math.random() * 6,
    });
  }
  cancelAnimationFrame(confettiRaf);
  const tick = () => {
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    confettiPieces = confettiPieces.filter((p) => p.y < innerHeight + 30);
    confettiPieces.forEach((p) => {
      p.t += 0.09;
      p.x += p.vx + Math.sin(p.t) * 0.9;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.scale(1, Math.abs(Math.cos(p.t)) * 0.8 + 0.2);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    });
    if (confettiPieces.length) confettiRaf = requestAnimationFrame(tick);
    else g.clearRect(0, 0, innerWidth, innerHeight);
  };
  tick();
}

// --- Les armes actives et leurs images -----------------------------------------

function ensureKeys() {
  const used = new Set(Object.values(settings.keys));
  set.ids.forEach((id) => {
    if (settings.keys[id]) return;
    for (let d = 1; d <= 9; d++) {
      const code = `Digit${d}`;
      if (!used.has(code)) {
        settings.keys[id] = code;
        used.add(code);
        return;
      }
    }
    settings.keys[id] = "";
  });
}

function rebuildSet() {
  set = Rules.makeSet(customs, settings.extras, overrides);
  Stage.setWeaponSet(set);
  ensureKeys();
  const sig = set.ids.map((a) => a + ":" + set.ids.map((b) => set.rel(a, b)).join("")).join("|");
  if (sig !== memorySig) {
    memory = {};
    memorySig = sig;
  }
}

const fullSet = () => Rules.makeSet(customs.map((c) => ({ ...c, enabled: true })), { fire: true, water: true }, overrides);

function thumbOf(id, side) {
  const w = set.weapons[id] || fullSet().weapons[id];
  if (w && w.custom) return w.image || null;
  if (!Stage.ok) return null;
  if (!thumbs[side][id]) thumbs[side][id] = Stage.thumbnail(id, side);
  return thumbs[side][id];
}

function iconHtml(id, side = 0) {
  const w = set.weapons[id] || fullSet().weapons[id];
  if (!w) return `<span class="w-emoji">❔</span>`;
  const src = thumbOf(id, side);
  if (src) return `<img class="w-ico${w.custom ? " round" : ""}" src="${src}" alt="${esc(w.name)}" title="${esc(w.name)}">`;
  return `<span class="w-emoji" title="${esc(w.name)}">${w.emoji || "⭐"}</span>`;
}

const nameOfWeapon = (id) => {
  const w = set.weapons[id] || fullSet().weapons[id];
  return w ? w.name : "?";
};

function normalizeCode(code) {
  const m = /^Numpad(\d)$/.exec(code);
  return m ? `Digit${m[1]}` : code;
}
function keyLabel(code) {
  if (!code) return "—";
  const m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  if (settings.keyLabels[code]) return settings.keyLabels[code];
  return code.replace(/^Key/, "").replace(/^Arrow/, "").replace("Space", "Espace");
}

// --- La partie -----------------------------------------------------------------

const isTournament = () => settings.opponent === "tournament";
const inTourBoard = () => isTournament() && !tourMatch;

function buildPlayers() {
  if (settings.opponent === "human") {
    return [
      { name: settings.names[0] === "Toi" ? "Joueur 1" : settings.names[0], kind: "human" },
      { name: settings.names[1] === "L’ordi" ? "Joueur 2" : settings.names[1], kind: "human" },
    ];
  }
  return [
    { name: settings.names[0], kind: "human" },
    { name: settings.names[1], kind: "bot", level: settings.level },
  ];
}

function humanSide() {
  if (!match) return null;
  const a = match.players[0].kind === "human", b = match.players[1].kind === "human";
  if (a === b) return null;
  return a ? 0 : 1;
}

function cancelRun() {
  runToken++;
  stopTimer();
  clearTimeout(blitzTimer);
  blitzPaused = false;
  document.body.classList.remove("busy");
  $("arena").classList.remove("rolling", "skippable", "jackpot");
  $("arena").querySelectorAll(".banner").forEach((b) => b.remove());
  $("chant").textContent = "";
  $("bubble").classList.add("hidden");
  if (Stage.ok) Stage.reset();
}

function startMatch(players) {
  cancelRun();
  matchCounter++;
  match = Rules.createMatch({ players, format: { ...settings.format }, mode: settings.mode, firstHunter: Math.random() < 0.5 ? 0 : 1 });
  match.id = `${Date.now()}-${matchCounter}`;
  match.seed = Math.floor(Math.random() * 1000);
  lastRecord = null;
  renderBrain(null);
  setStatus("");
  prepareRound();
  scheduleSave();
}

function newMatch() {
  if (isTournament()) {
    if (tourMatch) startMatch(currentTourPlayers());
    else {
      cancelRun();
      match = null;
      phase = "idle";
      renderAll();
    }
    return;
  }
  startMatch(buildPlayers());
}

function matchHistoryFor(side) {
  const idx = (id) => (id === null || id === undefined ? null : set.ids.indexOf(id));
  return match.rounds.map((r) => ({
    me: idx(r.picks[side]),
    opp: idx(r.picks[1 - side]),
    out: r.winner === side ? 1 : r.winner === -1 ? 0 : -1,
  }));
}

function botDecide(side) {
  const p = match.players[side];
  const persistent = !isTournament() && settings.opponent === "bot";
  const hist = persistent ? (memory[match.mode] || []) : matchHistoryFor(side);
  const d = BotAI.decide({
    history: hist,
    n: set.ids.length,
    rel: (i, j) => set.relIndex(i, j),
    mode: match.mode,
    level: p.level,
    isHunter: match.hunter === side,
    seed: match.seed + side,
    names: set.ids.map(nameOfWeapon),
  });
  d.moveId = set.ids[d.move];
  return d;
}

function prepareRound() {
  picks = [undefined, undefined];
  decisions = [null, null];
  announcement = null;
  stopTimer();
  match.players.forEach((p, side) => {
    if (p.kind === "bot") decisions[side] = botDecide(side);
  });
  const human = humanSide();
  // Mode aveugle : l'ordi annonce son coup dès le début de la manche
  if (match.mode === "blind" && human !== null) {
    const botSide = 1 - human;
    const a = BotAI.announce({
      decision: decisions[botSide],
      n: set.ids.length,
      rel: (i, j) => set.relIndex(i, j),
      level: match.players[botSide].level,
      lieChance: 1 - settings.truth / 100,
      names: set.ids.map(nameOfWeapon),
    });
    announcement = { side: botSide, id: set.ids[a.announced], lied: a.lied, plan: a.plan };
    showAnnouncement();
  } else {
    $("bubble").classList.add("hidden");
  }
  const humans = match.players.map((p, s) => (p.kind === "human" ? s : -1)).filter((s) => s >= 0);
  if (!humans.length) {
    phase = "auto";
    Stage.setThinking(true);
    renderAll();
    const token = runToken;
    delay(650 / Math.min(4, effectiveSpeed())).then(() => { if (token === runToken) reveal(); });
    return;
  }
  chooser = humans[0];
  if (humans.length === 2) {
    phase = "curtain";
  } else {
    phase = match.mode === "blitz" ? "ready" : "choose";
  }
  renderAll();
  if (blitzChains() && !blitzPaused) scheduleBlitz();
}

// Mode éclair contre un bot : après la première manche, tout s'enchaîne sans cliquer
const blitzChains = () => !!match && match.mode === "blitz" && phase === "ready" && humanSide() !== null && match.rounds.length > 0;

function scheduleBlitz() {
  clearTimeout(blitzTimer);
  const token = runToken;
  blitzTimer = setTimeout(() => {
    if (token !== runToken || phase !== "ready" || blitzPaused) return;
    // Onglet caché : on attend le retour du joueur au lieu de lui faire perdre la manche
    if (document.hidden) {
      blitzPaused = true;
      renderMain();
      renderInfo();
      return;
    }
    readyToChoose();
  }, 1400);
}

function showAnnouncement() {
  const b = $("bubble");
  b.className = "bubble";
  b.innerHTML = `${iconHtml(announcement.id, announcement.side)}<span>« Je vais jouer ${esc(nameOfWeapon(announcement.id))} ! »</span>`;
}

// Le joueur est prêt : on enlève le rideau, ou on lance le chrono du mode éclair
function readyToChoose() {
  Sound.click();
  if (match.mode === "blitz") {
    phase = "choose";
    renderAll();
    Sound.go();
    startTimer();
  } else {
    phase = "choose";
    renderAll();
  }
}

function startTimer() {
  const total = settings.blitz * 1000;
  const urgentUnder = Math.max(700, total * 0.3);
  const tickEvery = settings.blitz === 2 ? 500 : 1000;
  const ring = $("blitzRing");
  ring.classList.remove("hidden", "urgent");
  timerEnd = performance.now() + total;
  timerTicks = 0;
  const tick = () => {
    const left = timerEnd - performance.now();
    if (left <= 0) {
      stopTimer();
      choose(null);
      return;
    }
    ring.style.setProperty("--left", left / total);
    $("blitzText").textContent = (left / 1000).toFixed(1).replace(".", ",");
    ring.classList.toggle("urgent", left < urgentUnder);
    const step = Math.floor((total - left) / tickEvery);
    if (step > timerTicks) {
      timerTicks = step;
      Sound.tick(left < urgentUnder);
    }
    timerRaf = requestAnimationFrame(tick);
  };
  tick();
}

function stopTimer() {
  cancelAnimationFrame(timerRaf);
  $("blitzRing").classList.add("hidden");
}

function choose(id) {
  if (phase !== "choose" || !match || match.over) return;
  stopTimer();
  if (id !== null) Sound.pick();
  else Sound.lose();
  Haptics.buzz(12);
  picks[chooser] = id;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const other = 1 - chooser;
  if (match.players[other].kind === "human" && picks[other] === undefined) {
    chooser = other;
    phase = "curtain";
    renderAll();
    return;
  }
  reveal();
}

const effectiveSpeed = () => (reduceMotion() ? 40 : settings.speed);

async function reveal() {
  phase = "anim";
  Stage.setThinking(false);
  stopTimer();
  const a = match.players[0].kind === "bot" ? decisions[0].moveId : picks[0];
  const b = match.players[1].kind === "bot" ? decisions[1].moveId : picks[1];
  const result = Rules.evaluate(set, match.mode, a, b, match.hunter);
  document.body.classList.add("busy");
  $("arena").classList.add("rolling", "skippable");
  $("bubble").classList.toggle("hidden", !announcement);
  renderAll();
  const token = runToken;
  if (Stage.ok) {
    Stage.unskip();
    Stage.setSpeed(effectiveSpeed());
    await Stage.playRound({ a, b, result, mode: match.mode });
  } else {
    $("fbA").textContent = a ? (set.weapons[a].emoji || "⭐") : "⏱️";
    $("fbB").textContent = b ? (set.weapons[b].emoji || "⭐") : "⏱️";
    await delay(700 / effectiveSpeed());
  }
  if (token !== runToken) return;
  commitRound(a, b, result);
}

function commitRound(a, b, result) {
  document.body.classList.remove("busy");
  $("arena").classList.remove("rolling", "skippable");
  $("chant").textContent = "";
  if (Stage.ok) Stage.unskip();
  const hunter = match.hunter;
  const trim = (d) => d && { moveId: d.moveId, dist: d.dist, predicted: d.predicted, predictedId: d.predicted === null ? null : set.ids[d.predicted], confidence: d.confidence, label: d.label, why: d.why, strategy: d.strategy, mistake: d.mistake, level: d.level };
  const record = {
    n: match.rounds.length + 1,
    picks: [a, b],
    winner: result.winner,
    raw: result.raw,
    text: result.text,
    same: result.same,
    hunter,
    mode: match.mode,
    brain: [trim(decisions[0]), trim(decisions[1])],
    ann: announcement,
    names: match.players.map((p) => p.name),
    kinds: match.players.map((p) => p.kind),
    level: match.players.map((p) => p.level || 0),
    matchId: match.id,
    format: Rules.formatLabel(match.format),
  };
  Rules.addRound(match, record);
  record.score = match.score.slice();
  lastRecord = record;
  roundLog.push(record);
  if (roundLog.length > 300) roundLog = roundLog.slice(-300);

  // Ce que l'ordi retient
  if (!isTournament() && settings.opponent === "bot") {
    const list = memory[match.mode] || (memory[match.mode] = []);
    const idx = (id) => (id === null ? null : set.ids.indexOf(id));
    list.push({ me: idx(b), opp: idx(a), out: record.winner === 1 || record.winner === 2 ? 1 : record.winner === 0 ? -1 : 0 });
    if (list.length > 400) list.splice(0, list.length - 400);
  }

  // Les statistiques du joueur humain
  const hs = humanSide();
  if (hs !== null) {
    const botLevel = match.players[1 - hs].level;
    const lv = stats.levels[botLevel];
    stats.rounds++;
    const mine = record.picks[hs];
    if (mine) stats.weapons[mine] = (stats.weapons[mine] || 0) + 1;
    if (record.winner === hs || record.winner === 2) { stats.wins++; stats.streak++; lv.rw++; }
    else if (record.winner === -1 && !result.fail) { stats.draws++; lv.rd++; }
    else { stats.losses++; stats.streak = 0; lv.rl++; }
  }

  // Le résultat à l'écran
  const zone = $("arena");
  zone.classList.remove("landed");
  void zone.offsetWidth;
  zone.classList.add("landed");
  const scoreEl = record.winner === 0 || record.winner === 2 ? $("score0") : record.winner === 1 || result.fail ? $("score1") : null;
  if (scoreEl) {
    scoreEl.classList.remove("pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("pop");
  }
  setStatus(outcomeHtml(record), true);
  if (result.fail) {
    Sound.lose();
    Haptics.buzz(40);
  } else if (hs === null) {
    if (record.winner === -1) Sound.draw(); else Sound.win();
  } else if (record.winner === hs || record.winner === 2) {
    Sound.win();
    Haptics.buzz([20, 40, 30]);
    burst(zone, 26);
  } else if (record.winner === -1) {
    Sound.draw();
  } else {
    Sound.lose();
    Haptics.buzz(40);
  }

  renderBrain(record);
  renderHistory();
  renderStats();
  scheduleSave();
  if (match.over) finishMatch();
  else prepareRound();
}

function subjectLine(record) {
  if (record.mode === "duo") return record.winner === 2 ? "Vous marquez ensemble !" : "Raté : ce n’était pas le même signe";
  const hs = record.kinds[0] === "human" && record.kinds[1] === "bot" ? 0 : record.kinds[1] === "human" && record.kinds[0] === "bot" ? 1 : null;
  if (record.winner === -1) return record.mode === "mirror" ? "Personne ne marque" : "Manche nulle";
  if (hs !== null) return record.winner === hs ? "Tu gagnes la manche !" : `${record.names[1 - hs]} gagne la manche`;
  return `${record.names[record.winner]} gagne la manche`;
}

function outcomeHtml(record) {
  const twist = record.mode === "inverse" && record.winner !== -1 ? " · mode inversé : le perdant du combat marque" : "";
  const lie = record.ann ? `<span class="line small">${record.ann.lied ? "🤥 Il a menti" : "😇 Il a dit la vérité"} : il avait annoncé ${esc(nameOfWeapon(record.ann.id))}.</span>` : "";
  return `<span class="result-label line">Manche ${record.n}</span><span class="line small">${esc(record.text)}${twist}</span>${lie}<strong>${esc(subjectLine(record))}</strong>`;
}

function setStatus(html, animate = false) {
  const el = $("status");
  el.innerHTML = html;
  el.classList.remove("reveal");
  if (animate) {
    void el.offsetWidth;
    el.classList.add("reveal");
  }
}

function finishMatch() {
  phase = "over";
  $("bubble").classList.add("hidden");
  const hs = humanSide();
  const w = match.winner;
  const duo = match.mode === "duo";
  const won = duo ? w === 2 : hs === null || w === hs;
  if (hs !== null) {
    const botLevel = match.players[1 - hs].level;
    const lv = stats.levels[botLevel];
    stats.matches++;
    lv.m++;
    if (won) { stats.matchWins++; lv.w++; } else lv.l++;
  }
  const title = duo ? (won ? "GAGNÉ ENSEMBLE !" : "RATÉ ENSEMBLE…") : hs === null ? `${match.players[w].name} gagne !` : won ? "TU GAGNES !" : "PERDU…";
  const sub = duo ? `${match.score[0]} réussite${match.score[0] > 1 ? "s" : ""}, ${match.score[1]} raté${match.score[1] > 1 ? "s" : ""}` : `${match.score[0]} à ${match.score[1]}`;
  if (won) {
    setTimeout(() => { Sound.fanfare(); Haptics.buzz([60, 40, 60, 40, 200]); }, 240);
    showBanner(title, sub);
    burst($("arena"), 40, true);
    confetti(150);
  } else {
    setTimeout(() => Sound.defeat(), 240);
    showBanner(title, sub);
  }
  renderAll();
  renderStats();
  scheduleSave();
}

// --- L'action du grand bouton jaune ---------------------------------------------

function mainAction() {
  if (isTournament()) {
    if (!tourMatch) {
      if (tourView === "setup") return startTournament();
      if (tour && tour.champion !== null) return resetTournament();
      if (!tourBusy) return tourContinue();
      return;
    }
    if (phase === "over") return closeTourMatch();
  }
  if (blitzChains()) {
    Sound.click();
    if (!blitzPaused) {
      blitzPaused = true;
      clearTimeout(blitzTimer);
      renderMain();
      renderInfo();
      return;
    }
    blitzPaused = false;
    return readyToChoose();
  }
  if (phase === "curtain" || phase === "ready") return readyToChoose();
  Sound.click();
  newMatch();
}

function mainLabel() {
  if (isTournament() && !tourMatch) {
    if (tourView === "setup") return ["🏆 Lancer le tournoi", false];
    if (tour && tour.champion !== null) return ["♻️ Nouveau tournoi", false];
    if (tourBusy) return ["⏳ Les bots s’affrontent…", true];
    const step = tour && Tournament.next(tour);
    if (step) {
      const pa = tour.players[step.match.a], pb = tour.players[step.match.b];
      const label = `▶ ${pa.name} contre ${pb.name}`;
      return [label.length > 38 ? "▶ Match suivant" : label, false];
    }
    return ["▶ Continuer", false];
  }
  if (isTournament() && phase === "over") return ["🏆 Retour au tableau", false];
  if (phase === "curtain") return [`👀 C’est bon, je suis ${match.players[chooser].name}`, false];
  if (blitzChains()) return [blitzPaused ? "▶ Reprendre" : "⏸ Pause", false];
  if (phase === "ready") return ["⚡ C’est parti !", false];
  return ["🔁 Rejouer", false];
}

// --- Affichage de la partie -----------------------------------------------------

function renderAll() {
  renderTabs();
  renderScore();
  renderWeapons();
  renderMain();
  renderCurtain();
  renderInfo();
  renderVisibility();
}

function renderVisibility() {
  const board = inTourBoard();
  $("arena").classList.toggle("hidden", board);
  $("turnBar").classList.toggle("hidden", board);
  $("weaponGrid").classList.toggle("hidden", board);
  $("status").classList.toggle("hidden", board);
  $("moveInfo").classList.toggle("hidden", board);
  $("tourView").classList.toggle("hidden", !board);
  $("tourSetup").classList.toggle("hidden", tourView !== "setup");
  $("tourBracket").classList.toggle("hidden", tourView === "setup");
  $("brainBtn").classList.toggle("hidden", settings.opponent === "human" || board);
  $("bracketBtn").classList.toggle("hidden", !(isTournament() && tourMatch));
  $("tourResetBtn").classList.toggle("hidden", !(isTournament() && tour && tour.champion === null && !tourBusy));
  $("levelBox").classList.toggle("hidden", settings.opponent !== "bot");
  $("blindBox").classList.toggle("hidden", settings.mode !== "blind");
  $("blitzBox").classList.toggle("hidden", settings.mode !== "blitz");
}

function renderTabs() {
  document.querySelectorAll("#modeTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === settings.mode));
  $("modeDesc").textContent = modeText(settings.mode) + (settings.mode === "blind" && settings.opponent === "human" ? " (Il faut un ordi pour ça : ce mode se joue contre lui.)" : "");
  $("rulesLink").href = `regles.html#${isTournament() ? "tournoi" : Rules.MODES[settings.mode].anchor}`;
  const oppIndex = { bot: 0, human: 1, tournament: 2 }[settings.opponent];
  setPill($("oppSwitch"), oppIndex);
}

function renderScore() {
  const bar = $("turnBar");
  if (!match) return;
  const choosing = (phase === "choose" || phase === "ready" || phase === "curtain");
  const duo = match.mode === "duo";
  const over = phase === "over";
  let active = chooser;
  if (over) active = duo ? (match.winner === 2 ? 0 : 1) : match.winner;
  bar.dataset.active = active;
  bar.classList.toggle("waiting", duo ? !over : !(choosing || over));
  bar.classList.toggle("choosing", choosing && !duo);
  [0, 1].forEach((s) => {
    const side = bar.querySelector(`.turn-side[data-p="${s}"]`);
    side.classList.toggle("active", ((choosing && !duo) || over) && active === s);
    const label = duo ? (s === 0 ? "🤝 Ensemble" : "❌ Ratés") : match.players[s].name + (match.players[s].kind === "bot" ? ` · niv. ${match.players[s].level}` : "");
    $(`name${s}`).textContent = label;
    $(`score${s}`).textContent = match.score[s];
    $(`role${s}`).textContent = match.mode === "mirror" && !over ? (match.hunter === s ? "🎯 Chasseur" : "🏃 Fugitif") : "";
    const pips = $(`pips${s}`);
    // En duo « premier à X », les ratés ne font pas perdre : ils sont juste comptés
    if (duo && s === 1 && match.format.type === "first") {
      pips.innerHTML = "";
    } else if (match.target <= 10) {
      let html = "";
      for (let k = 0; k < match.target; k++) html += `<span class="pip${k < match.score[s] ? " on" : ""}"></span>`;
      pips.innerHTML = html;
    } else {
      pips.innerHTML = `<small class="muted">/ ${match.target}</small>`;
    }
  });
}

function renderWeapons() {
  const grid = $("weaponGrid");
  const side = phase === "choose" || phase === "curtain" ? chooser : (humanSide() === 1 ? 1 : 0);
  grid.innerHTML = set.ids.map((id) => {
    const w = set.weapons[id];
    const src = thumbOf(id, side);
    const art = src ? `<img src="${src}" alt="">` : `<span class="fallback-emoji">${w.emoji || "⭐"}</span>`;
    return `<button class="weapon-btn" type="button" data-id="${esc(id)}" aria-label="Jouer ${esc(w.name)}">${art}<span class="w-name">${esc(w.name)}</span><kbd>${esc(keyLabel(settings.keys[id]))}</kbd></button>`;
  }).join("");
  grid.classList.toggle("locked", phase !== "choose");
  grid.classList.toggle("covered", phase === "curtain");
}

function renderMain() {
  const [label, disabled] = mainLabel();
  const btn = $("mainBtn");
  btn.textContent = label;
  btn.disabled = disabled;
}

function renderCurtain() {
  const c = $("curtain");
  if (phase !== "curtain") {
    c.classList.add("hidden");
    return;
  }
  const other = 1 - chooser;
  const already = picks[other] !== undefined;
  $("curtainTitle").textContent = `À toi, ${match.players[chooser].name} !`;
  $("curtainText").textContent = `${match.players[other].name}, regarde ailleurs${already ? " : ton choix est gardé secret." : "."} ${match.mode === "blitz" ? `Le chrono de ${settings.blitz} secondes part dès que tu cliques.` : "Clique quand tu es prêt."}`;
  c.classList.remove("hidden");
}

function renderInfo() {
  $("fallback").classList.toggle("hidden", Stage.ok);
  if (match) {
    const round = match.rounds.length + (match.over ? 0 : 1);
    $("matchInfo").innerHTML = isTournament() && !tourMatch ? "" : `${esc(Rules.formatLabel(match.format))} · <strong>${match.over ? "Partie finie" : `Manche ${round}`}</strong>${match.draws ? ` · ${match.draws} nulle${match.draws > 1 ? "s" : ""}` : ""}`;
  } else {
    $("matchInfo").textContent = "";
  }
  const info = $("moveInfo");
  if (!match) { info.textContent = ""; }
  else if (phase === "choose") {
    const mirror = match.mode === "mirror" ? (match.hunter === chooser ? " 🎯 Essaie de jouer le même coup." : " 🏃 Évite de jouer le même coup.") : match.mode === "duo" ? " 🤝 Essayez de jouer la même chose." : "";
    info.textContent = match.players[1 - chooser].kind === "human" ? `${match.players[chooser].name}, choisis en secret.${mirror}` : `Choisis ton coup.${mirror}`;
  } else if (phase === "ready") {
    if (blitzChains()) info.textContent = blitzPaused ? "En pause. Reprends quand tu veux." : "Prépare-toi : la manche suivante arrive…";
    else info.textContent = `Prépare-toi : tu auras ${settings.blitz} secondes.`;
  }
  else if (phase === "anim") info.textContent = "Clique sur la scène pour accélérer.";
  else if (phase === "auto") info.textContent = "Les deux bots réfléchissent…";
  else if (phase === "over") {
    if (match.mode === "duo") {
      info.textContent = match.winner === 2 ? "Vous avez gagné tous les deux !" : "Vous avez perdu tous les deux. Pas assez synchronisés…";
    } else {
      const w = match.players[match.winner];
      info.textContent = `${w.name} gagne la partie ${match.score[match.winner]} à ${match.score[1 - match.winner]}.`;
    }
  } else info.textContent = "";
  renderHint();
}

function renderHint() {
  if (inTourBoard()) {
    $("hint").textContent = "";
    return;
  }
  const keys = set.ids.map((id) => `<kbd>${esc(keyLabel(settings.keys[id]))}</kbd> ${esc(nameOfWeapon(id))}`).join(" · ");
  $("hint").innerHTML = `${keys} · <kbd>${esc(keyLabel(settings.restartKey))}</kbd> recommencer · <kbd>Espace</kbd> bouton jaune`;
}

// --- Le cerveau -----------------------------------------------------------------

function renderBrain(record) {
  const box = $("brainBody");
  const rec = record;
  if (settings.opponent === "human") {
    box.innerHTML = `<div class="brain-empty"><span>👥</span>Vous jouez à deux : pas d’ordi, donc pas de cerveau à regarder.</div>`;
    return;
  }
  if (!rec) {
    box.innerHTML = `<div class="brain-empty"><span>🧠</span>Joue une manche : tu verras ici ce que l’ordi a pensé que tu allais jouer.</div>`;
    return;
  }
  const botSide = rec.kinds[1] === "bot" ? 1 : rec.kinds[0] === "bot" ? 0 : null;
  if (botSide === null) {
    box.innerHTML = `<div class="brain-empty"><span>👥</span>Ce match se joue entre deux humains.</div>`;
    return;
  }
  const d = rec.brain[botSide];
  const youSide = 1 - botSide;
  const you = rec.picks[youSide];
  const youName = rec.kinds[youSide] === "human" ? "toi" : rec.names[youSide];
  let verdict = "";
  let cls = "";
  if (d.predictedId) {
    const hit = d.predictedId === you;
    cls = hit ? "hit" : "miss";
    verdict = hit ? "🎯 Bien vu : il avait deviné." : "❌ Raté : il s’est trompé.";
  } else {
    verdict = "🎲 Il n’a rien cherché à deviner.";
  }
  const youHtml = you ? `${iconHtml(you, youSide)}<strong>${esc(nameOfWeapon(you))}</strong>` : `<span class="w-emoji">⏱️</span><strong>Rien (trop tard)</strong>`;
  let bars = "";
  if (d.dist) {
    bars = `<div class="bars">${set.ids.map((id, i) => {
      const pct = Math.round((d.dist[i] || 0) * 100);
      return `<div class="bar-row"><div class="bar-label"><span>${iconHtml(id, youSide)}${esc(nameOfWeapon(id))}${id === you ? ` <span class="brain-bar-you">← ${esc(youName)}</span>` : ""}</span><small>${pct} %</small></div><div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
    }).join("")}</div>`;
  }
  const ann = rec.ann ? `<div class="brain-why"><strong>${rec.ann.lied ? "🤥 Il a menti" : "😇 Il a dit la vérité"}</strong>Il a annoncé ${esc(nameOfWeapon(rec.ann.id))}. ${esc(rec.ann.plan)}</div>` : "";
  const bothPredicted = roundLog.filter((r) => r.matchId === rec.matchId && r.brain[botSide] && r.brain[botSide].predictedId);
  const correct = bothPredicted.filter((r) => r.brain[botSide].predictedId === r.picks[youSide]).length;
  const foot = bothPredicted.length ? `Dans cette partie, il a bien deviné ${correct} fois sur ${bothPredicted.length}.` : "";
  box.innerHTML = `
    <div class="brain-think"><span class="lv-num">${d.level}</span><span>${esc(BotAI.LEVELS[d.level].name)} · ${esc(d.label)}</span></div>
    <div class="brain-duel">
      <div class="brain-box"><small>Il pensait que tu jouerais</small>${d.predictedId ? `${iconHtml(d.predictedId, youSide)}<strong>${esc(nameOfWeapon(d.predictedId))}</strong>` : `<span class="w-emoji">🤷</span><strong>Aucune idée</strong>`}</div>
      <div class="brain-box ${cls}"><small>Tu as joué</small>${youHtml}</div>
    </div>
    <p class="brain-verdict">${verdict}</p>
    ${bars}
    <div class="brain-why"><strong>Son raisonnement</strong>${esc(d.why)}</div>
    ${ann}
    <p class="brain-foot">${esc(foot)}</p>`;
}

// --- Historique et statistiques -------------------------------------------------

function renderHistory() {
  const box = $("historyList");
  if (!roundLog.length) {
    box.innerHTML = `<div class="history-empty">Aucune manche pour l’instant.</div>`;
    return;
  }
  const list = roundLog.slice(-120).reverse();
  let lastMatch = null;
  let first = true;
  box.innerHTML = list.map((r) => {
    let head = "";
    if (r.matchId !== lastMatch) {
      lastMatch = r.matchId;
      const lvl = (s) => (r.kinds[s] === "bot" ? ` (niv. ${r.level[s]})` : "");
      head = `<div class="round-match">${esc(Rules.MODES[r.mode].emoji)} ${esc(r.names[0])}${lvl(0)} contre ${esc(r.names[1])}${lvl(1)} · ${esc(r.format)}</div>`;
    }
    const hs = r.kinds[0] === "human" && r.kinds[1] === "bot" ? 0 : r.kinds[1] === "human" && r.kinds[0] === "bot" ? 1 : null;
    const duo = r.mode === "duo";
    const good = duo ? r.winner === 2 : r.winner !== -1 && hs !== null && r.winner === hs;
    const bad = duo ? r.winner !== 2 : r.winner !== -1 && hs !== null && r.winner !== hs;
    const pick = (s) => (r.picks[s] ? iconHtml(r.picks[s], s) : `<span class="w-emoji" title="Trop tard">⏱️</span>`);
    const short = duo ? (r.winner === 2 ? "Réussie" : "Ratée") : r.winner === -1 ? "Nulle" : hs !== null ? (good ? "Gagnée" : "Perdue") : r.names[r.winner];
    let extra = "";
    const botSide = r.kinds[1] === "bot" ? 1 : r.kinds[0] === "bot" ? 0 : null;
    if (botSide !== null && r.brain[botSide]) {
      const d = r.brain[botSide];
      extra += `<br><strong>🧠 ${esc(d.label)} :</strong> ${esc(d.why)}`;
      if (d.predictedId) extra += `<br><strong>Il pensait :</strong> ${esc(nameOfWeapon(d.predictedId))}${d.predictedId === r.picks[1 - botSide] ? " ✅" : " ❌"}`;
    }
    if (r.ann) extra += `<br><strong>Annonce :</strong> ${esc(nameOfWeapon(r.ann.id))} (${r.ann.lied ? "mensonge" : "vérité"})`;
    if (r.mode === "mirror") extra += `<br><strong>Chasseur :</strong> ${esc(r.names[r.hunter])}`;
    const cls = first ? " first" : "";
    first = false;
    return `${head}<details class="round-item${cls}">
      <summary><span class="round-num">${r.n}</span>${pick(0)}<span class="round-vs">VS</span>${pick(1)}
        <span class="round-result ${good ? "win" : bad ? "lose" : ""}">${esc(short)}</span><span class="round-score">${r.score ? r.score.join(" - ") : ""}</span></summary>
      <div class="round-detail">${esc(r.text)}${extra}</div>
    </details>`;
  }).join("");
}

function renderStats() {
  $("kpiRounds").textContent = stats.rounds;
  $("kpiMatches").textContent = stats.matches;
  const decisive = stats.wins + stats.losses;
  $("kpiRate").textContent = decisive ? `${Math.round((stats.wins / decisive) * 100)} %` : "—";
  $("kpiStreak").textContent = stats.streak ? `×${stats.streak}` : "—";
  const ids = Object.keys(stats.weapons);
  const total = ids.reduce((sum, id) => sum + stats.weapons[id], 0);
  const top = Math.max(1, ...ids.map((id) => stats.weapons[id]));
  const fs = fullSet();
  $("weaponBars").innerHTML = ids.length ? ids.filter((id) => fs.weapons[id]).sort((a, b) => stats.weapons[b] - stats.weapons[a]).map((id) => {
    const pct = Math.round((stats.weapons[id] / total) * 100);
    return `<div class="bar-row"><div class="bar-label"><span>${iconHtml(id, 0)}${esc(nameOfWeapon(id))} — ${stats.weapons[id]}</span><small>${pct} %</small></div><div class="bar"><div class="bar-fill" style="width:${(stats.weapons[id] / top) * 100}%"></div></div></div>`;
  }).join("") : `<p class="muted small">Tes coups apparaîtront ici.</p>`;

  const rows = [];
  for (let l = 1; l <= 20; l++) {
    const s = stats.levels[l];
    const dec = s.rw + s.rl;
    const rate = dec ? Math.round((s.rw / dec) * 100) : null;
    rows.push(`<tr data-level="${l}" class="${settings.level === l ? "active" : ""}"><td><span class="lv-num">${l}</span><span class="lv-name">${esc(BotAI.LEVELS[l].name)}</span></td><td>${s.m}</td><td>${s.w}</td><td>${s.l}</td><td>${s.rw}</td><td>${s.rl}</td><td class="col-rate"><span class="bar"><div class="bar-fill" style="width:${rate || 0}%"></div></span><span class="rate">${rate === null ? "—" : rate + " %"}</span></td></tr>`);
  }
  $("levelRows").innerHTML = rows.join("");
}

// --- Réglages -------------------------------------------------------------------

function renderSettings() {
  $("levelName").textContent = `${settings.level} · ${BotAI.LEVELS[settings.level].name}`;
  $("levelNote").textContent = `Il ${BotAI.LEVELS[settings.level].note}.`;
  document.querySelectorAll("#levelChips .chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.level) === settings.level));
  document.querySelectorAll("#formatChips .chip").forEach((c) => {
    const on = c.dataset.first ? settings.format.type === "first" : settings.format.type === "bo" && settings.format.n === Number(c.dataset.bo);
    c.classList.toggle("active", on);
  });
  $("firstBox").classList.toggle("hidden", settings.format.type !== "first");
  if (document.activeElement !== $("firstTo")) $("firstTo").value = settings.firstTo;
  setPill($("handSwitch"), settings.handStyle === "gesture" ? 0 : 1);
  $("handNote").textContent = settings.handStyle === "gesture"
    ? "Pas d’objet : les mains font le signe (poing, main ouverte, V) et se battent entre elles."
    : "La main tient le vrai objet : la pierre dans la paume, la feuille pincée, les ciseaux dans les doigts.";
  document.querySelectorAll("#blitzChips .chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.blitz) === settings.blitz));
  document.querySelectorAll("#speedChips .chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.speed) === settings.speed));
  $("speedName").textContent = settings.speed >= 40 ? "instantané" : `×${String(settings.speed).replace(".", ",")}`;
  if (Stage.ok) {
    Stage.setHandStyle(settings.handStyle);
    Stage.setSpeed(effectiveSpeed());
  }
  renderBlind();
  renderKeys();
}

function parseProb(text) {
  const s = text.trim().replace(/,/g, ".").replace(/\s+/g, "");
  let m;
  if ((m = s.match(/^(\d*\.?\d+)%?$/))) return Math.min(100, Number(m[1]));
  if ((m = s.match(/^(\d*\.?\d+)\/(\d*\.?\d+)$/))) {
    const b = Number(m[2]);
    return b > 0 ? Math.min(100, (Number(m[1]) / b) * 100) : NaN;
  }
  if ((m = s.match(/^(\d*\.?\d+):(\d*\.?\d+)$/))) {
    const a = Number(m[1]), b = Number(m[2]);
    return a + b > 0 ? (a / (a + b)) * 100 : NaN;
  }
  return NaN;
}

const roundPct = (v) => Math.round(v * 100) / 100;

function buildBlindRows() {
  const list = $("blindProbs");
  const row = (key, emoji, label) => `<div class="prob-row" data-key="${key}">
    <span class="prob-index">${emoji}</span>
    <span class="prob-name">${label}</span>
    <div class="prob-pct"><input type="text" inputmode="decimal" aria-label="${label}, en pourcentage"><span class="eq"></span></div>
    <input class="range prob-range" type="range" min="0" max="100" step="1" aria-label="${label}">
  </div>`;
  list.innerHTML = row("truth", "😇", "Il dit la vérité") + row("lie", "🤥", "Il ment");
  list.querySelectorAll(".prob-row").forEach((r) => {
    const isTruth = r.dataset.key === "truth";
    const input = r.querySelector(".prob-pct input");
    const range = r.querySelector(".prob-range");
    const wrap = r.querySelector(".prob-pct");
    input.addEventListener("input", () => {
      const v = parseProb(input.value);
      if (Number.isNaN(v)) {
        wrap.classList.add("invalid");
        return;
      }
      wrap.classList.remove("invalid");
      const raw = /[/:]/.test(input.value);
      wrap.classList.toggle("raw", raw);
      wrap.querySelector(".eq").textContent = raw ? `= ${roundPct(v)} %` : "";
      settings.truth = isTruth ? v : 100 - v;
      renderBlind(r);
      blindChanged();
    });
    input.addEventListener("blur", () => {
      wrap.classList.remove("raw", "invalid");
      wrap.querySelector(".eq").textContent = "";
      renderBlind();
    });
    range.addEventListener("input", () => {
      const v = Number(range.value);
      settings.truth = isTruth ? v : 100 - v;
      renderBlind();
      blindChanged();
    });
  });
}

function renderBlind(keepTyping = null) {
  document.querySelectorAll("#blindProbs .prob-row").forEach((r) => {
    const v = r.dataset.key === "truth" ? settings.truth : 100 - settings.truth;
    if (r !== keepTyping) {
      const input = r.querySelector(".prob-pct input");
      if (document.activeElement !== input) input.value = roundPct(v);
    }
    const range = r.querySelector(".prob-range");
    range.value = v;
    range.style.setProperty("--fill", `${v}%`);
  });
  document.querySelectorAll("#blindPresets .chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.truth) === settings.truth));
}

function blindChanged() {
  scheduleSave();
  // L'annonce déjà faite garde sa probabilité : la nouvelle compte à la manche suivante
}

function renderKeys() {
  const rows = set.ids.map((id) => `<div class="key-row"><span>${esc(nameOfWeapon(id))}</span><button class="key-btn" type="button" data-weapon="${esc(id)}">${esc(keyLabel(settings.keys[id]))}</button></div>`);
  rows.push(`<div class="key-row"><span>Recommencer</span><button class="key-btn" type="button" data-restart="1">${esc(keyLabel(settings.restartKey))}</button></div>`);
  $("keyList").innerHTML = rows.join("");
}

let listening = null;
function startListening(button) {
  if (listening) listening.button.classList.remove("listening");
  button.classList.add("listening");
  button.textContent = "…";
  listening = { button, weapon: button.dataset.weapon || null, restart: !!button.dataset.restart };
}

function finishListening(e) {
  const { weapon, restart } = listening;
  listening.button.classList.remove("listening");
  listening = null;
  if (e.key === "Escape") { renderKeys(); return; }
  const code = normalizeCode(e.code);
  if (code === "Space" || code === "Tab" || code === "Enter") {
    toast("Cette touche est déjà prise par le site");
    renderKeys();
    return;
  }
  if (e.key && e.key.length === 1 && !/^Digit/.test(code)) settings.keyLabels[code] = e.key.toUpperCase();
  const current = restart ? settings.restartKey : settings.keys[weapon];
  // Si la touche est déjà utilisée, les deux s'échangent
  Object.keys(settings.keys).forEach((id) => { if (settings.keys[id] === code) settings.keys[id] = current; });
  if (settings.restartKey === code) settings.restartKey = current;
  if (restart) settings.restartKey = code;
  else settings.keys[weapon] = code;
  renderKeys();
  renderWeapons();
  renderHint();
  scheduleSave();
  Sound.click();
}

// --- Personnalisation -----------------------------------------------------------

function isHex(s) { return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s); }

function savePrefs(change) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    Object.assign(prefs, change);
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) { /* stockage indisponible */ }
}

function rememberColor(hex, presets) {
  if (presets.includes(hex)) return;
  recentColors = [hex, ...recentColors.filter((c) => c !== hex)].slice(0, 7);
  savePrefs({ recentColors });
}

// Choix de couleur : 7 prêtes, recherche, 7 récentes
function colorField(root, { presets, value, onChange }) {
  const swatches = (list, mini) => list.map((c) => `<button type="button" class="swatch${mini ? " mini" : ""}${c === value ? " active" : ""}" style="--c:${c}" data-c="${c}" aria-label="Couleur ${c}"></button>`).join("");
  root.innerHTML = `
    <div class="swatches">${swatches(presets)}</div>
    <div class="color-search">
      <span class="color-preview" style="background:${value}"></span>
      <input class="color-input" type="text" placeholder="#ff8800, orange, rouge…" aria-label="Code ou nom de couleur">
      <label class="color-pick" title="Ouvrir la palette">🎨<input type="color" value="${value}" aria-label="Palette de couleurs"></label>
    </div>
    <p class="error hidden"></p>
    ${recentColors.length ? `<p class="muted small recent-label">Récentes</p><div class="swatches">${swatches(recentColors, true)}</div>` : ""}`;
  const pick = (hex, remember = true) => {
    if (remember) rememberColor(hex, presets);
    onChange(hex);
  };
  root.querySelectorAll(".swatch").forEach((b) => b.addEventListener("click", () => { Sound.click(); pick(b.dataset.c, false); }));
  const text = root.querySelector(".color-input");
  const error = root.querySelector(".error");
  text.addEventListener("change", () => {
    const hex = parseColor(text.value);
    if (!hex) {
      error.textContent = "Je ne connais pas cette couleur.";
      error.classList.remove("hidden");
      return;
    }
    error.classList.add("hidden");
    pick(hex);
  });
  root.querySelector('input[type="color"]').addEventListener("change", (e) => pick(e.target.value));
}

function cosChanged(side, kinds) {
  Stage.setCosmetics(side, cosmetics[side]);
  kinds.forEach((id) => { delete thumbs[side][id]; });
  renderCos();
  renderWeapons();
  if (lastRecord) renderBrain(lastRecord);
  scheduleSave();
}

function renderCos() {
  const c = cosmetics[cosSide];
  const names = sideNames();
  $("cosTab0").textContent = names[0];
  $("cosTab1").textContent = names[1];
  document.querySelectorAll("#cosTabs .tab").forEach((t) => t.classList.toggle("active", Number(t.dataset.side) === cosSide));
  $("cosCopy").textContent = `📋 Copier sur ${names[1 - cosSide]}`;
  if (document.activeElement !== $("cosName")) $("cosName").value = names[cosSide];
  $("previewHand").src = Stage.ok ? Stage.handThumbnail(cosSide) : "logo.svg";
  $("previewRock").src = Stage.ok ? thumbOf("rock", cosSide) : "logo.svg";
  $("previewScissors").src = Stage.ok ? thumbOf("scissors", cosSide) : "logo.svg";

  colorField($("skinField"), { presets: SKIN_PRESETS, value: c.skin, onChange: (hex) => { c.skin = hex; cosChanged(cosSide, []); } });
  colorField($("scissorsField"), { presets: COLOR_PRESETS, value: c.scissors.color, onChange: (hex) => { c.scissors.color = hex; cosChanged(cosSide, ["scissors"]); } });

  $("rockShades").innerHTML = ROCK_SHADES.map(([hex, label]) => `<button type="button" class="swatch${hex === c.rock.color ? " active" : ""}" style="--c:${hex}" data-c="${hex}" title="${label}" aria-label="${label}"></button>`).join("");
  $("rockPatterns").innerHTML = Object.entries(Textures.ROCK_PATTERNS).map(([key, label]) => `<button type="button" class="chip${key === c.rock.pattern ? " active" : ""}" data-p="${key}">${label}</button>`).join("");
  $("rustSwitch").checked = !!c.scissors.rust;

  $("padColors").innerHTML = INK_COLORS.map((hex) => `<button type="button" class="swatch mini${pad.tool !== "eraser" && hex === pad.color ? " active" : ""}" style="--c:${hex}" data-c="${hex}" aria-label="Encre ${hex}"></button>`).join("");
  document.querySelectorAll("#padTools .chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.tool === "eraser" ? pad.tool === "eraser" : pad.tool !== "eraser" && Number(chip.dataset.size) === pad.size);
  });
  if (document.activeElement !== $("padText")) $("padText").value = c.paper.text || "";
}

function sideNames() {
  if (settings.opponent === "human") return [settings.names[0] === "Toi" ? "Joueur 1" : settings.names[0], settings.names[1] === "L’ordi" ? "Joueur 2" : settings.names[1]];
  return settings.names;
}

// Le pad de la feuille
const pad = { color: INK_COLORS[0], size: 10, tool: "pen", drawing: false, undo: [], last: null };

function drawPadBack() {
  const back = $("padBack");
  Textures.drawPaperBase(back.getContext("2d"), back.width, back.height);
  const layer = $("padTextLayer");
  const g = layer.getContext("2d");
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, layer.width, layer.height);
  const paper = cosmetics[cosSide].paper;
  if (paper.textInk) {
    const side = cosSide;
    Textures.preload([paper.textInk]).then(([img]) => {
      if (side !== cosSide) return;
      g.clearRect(0, 0, layer.width, layer.height);
      g.drawImage(img, 0, 0, layer.width, layer.height);
    });
  } else {
    Textures.drawPaperText(g, layer.width, layer.height, paper);
  }
}

function loadPadInk() {
  const c = $("padInk");
  const g = c.getContext("2d");
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, c.width, c.height);
  pad.undo = [];
  const ink = cosmetics[cosSide].paper.ink;
  if (ink) {
    const side = cosSide;
    Textures.preload([ink]).then(([img]) => { if (side === cosSide) g.drawImage(img, 0, 0, c.width, c.height); });
  }
}

function padPoint(e) {
  const c = $("padInk");
  const r = c.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
}

function padStroke(from, to) {
  const erasing = pad.tool === "eraser";
  // La gomme efface le dessin et le texte, jamais le papier
  const layers = erasing ? [$("padInk"), $("padTextLayer")] : [$("padInk")];
  layers.forEach((layer) => {
    const g = layer.getContext("2d");
    g.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    g.strokeStyle = pad.color;
    g.lineWidth = erasing ? pad.size * 2.4 : pad.size;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(to.x + 0.01, to.y);
    g.stroke();
    g.globalCompositeOperation = "source-over";
  });
  if (erasing) pad.erasedText = true;
}

function padSnapshot() {
  const ink = $("padInk"), layer = $("padTextLayer");
  const paper = cosmetics[cosSide].paper;
  return {
    ink: ink.getContext("2d").getImageData(0, 0, ink.width, ink.height),
    layer: layer.getContext("2d").getImageData(0, 0, layer.width, layer.height),
    text: paper.text,
    textInk: paper.textInk,
  };
}

function padPushUndo() {
  pad.undo.push(padSnapshot());
  if (pad.undo.length > 15) pad.undo.shift();
}

function padSave() {
  const c = $("padInk");
  const paper = cosmetics[cosSide].paper;
  const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let used = false;
  for (let i = 3; i < data.length; i += 16) if (data[i]) { used = true; break; }
  paper.ink = used ? c.toDataURL("image/png") : null;
  // Une fois gommé, le texte est gardé tel quel, comme une image
  if (pad.erasedText && (paper.text || "").trim()) paper.textInk = $("padTextLayer").toDataURL("image/png");
  pad.erasedText = false;
  const side = cosSide;
  Textures.preload([paper.ink, paper.textInk]).then(() => cosChanged(side, ["paper"]));
}

function bindPad() {
  const ink = $("padInk");
  ink.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ink.setPointerCapture(e.pointerId);
    padPushUndo();
    pad.drawing = true;
    pad.last = padPoint(e);
    padStroke(pad.last, pad.last);
  });
  ink.addEventListener("pointermove", (e) => {
    if (!pad.drawing) return;
    const p = padPoint(e);
    padStroke(pad.last, p);
    pad.last = p;
  });
  const end = () => {
    if (!pad.drawing) return;
    pad.drawing = false;
    padSave();
  };
  ink.addEventListener("pointerup", end);
  ink.addEventListener("pointercancel", end);
  $("padColors").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    pad.color = b.dataset.c;
    if (pad.tool === "eraser") pad.tool = "pen";
    // Le texte prend la couleur choisie, tant qu'il n'a pas été gommé
    const paper = cosmetics[cosSide].paper;
    if (!paper.textInk && (paper.text || "").trim()) {
      paper.textColor = pad.color;
      drawPadBack();
      cosChanged(cosSide, ["paper"]);
    }
    Sound.click();
    renderCos();
  });
  $("padTools").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    if (b.dataset.tool === "eraser") pad.tool = "eraser";
    else {
      pad.tool = "pen";
      pad.size = Number(b.dataset.size);
    }
    Sound.click();
    renderCos();
  });
  $("padUndo").addEventListener("click", () => {
    const shot = pad.undo.pop();
    if (!shot) return;
    ink.getContext("2d").putImageData(shot.ink, 0, 0);
    $("padTextLayer").getContext("2d").putImageData(shot.layer, 0, 0);
    const paper = cosmetics[cosSide].paper;
    paper.text = shot.text;
    paper.textInk = shot.textInk;
    $("padText").value = paper.text || "";
    Sound.click();
    padSave();
  });
  $("padClear").addEventListener("click", () => {
    padPushUndo();
    [ink, $("padTextLayer")].forEach((layer) => {
      const g = layer.getContext("2d");
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, layer.width, layer.height);
    });
    const paper = cosmetics[cosSide].paper;
    paper.text = "";
    paper.textInk = null;
    $("padText").value = "";
    Sound.click();
    padSave();
  });
  let textTimer;
  $("padText").addEventListener("input", (e) => {
    cosmetics[cosSide].paper.text = e.target.value;
    cosmetics[cosSide].paper.textInk = null;
    cosmetics[cosSide].paper.textColor = pad.color;
    drawPadBack();
    clearTimeout(textTimer);
    textTimer = setTimeout(() => cosChanged(cosSide, ["paper"]), 250);
  });
}

// --- Les armes ------------------------------------------------------------------

function describeRelations(fs, id) {
  const wins = fs.ids.filter((o) => o !== id && fs.rel(id, o) > 0).map((o) => fs.weapons[o].name);
  const loses = fs.ids.filter((o) => o !== id && fs.rel(id, o) < 0).map((o) => fs.weapons[o].name);
  const parts = [];
  if (wins.length) parts.push(`bat ${wins.join(", ")}`);
  if (loses.length) parts.push(`perd contre ${loses.join(", ")}`);
  return parts.join(" · ") || "ne bat personne, ne perd contre personne";
}

function renderArms() {
  const fs = fullSet();
  const rows = [];
  const row = (id, control) => {
    const w = fs.weapons[id];
    const on = !!set.weapons[id];
    return `<div class="arm-row"><span>${iconHtml(id, 0)}</span><div class="arm-info"><strong>${esc(w.name)}</strong><small>${esc(on ? describeRelations(set, id) : describeRelations(fs, id))}</small></div>${control}</div>`;
  };
  const toggle = (attr, id, on) => `<label class="switch" title="Activer ou retirer"><input type="checkbox" ${attr}="${esc(id)}"${on ? " checked" : ""} aria-label="Activer ${esc(fs.weapons[id].name)}"><span class="switch-track"><span class="switch-thumb"></span></span></label>`;
  Rules.CLASSIC.forEach((id) => rows.push(row(id, "")));
  ["fire", "water"].forEach((id) => rows.push(row(id, toggle("data-extra", id, settings.extras[id]))));
  customs.forEach((c) => rows.push(row(c.id, `<button class="btn btn-small arm-edit" data-edit="${esc(c.id)}" title="Modifier">✏️</button>${toggle("data-custom", c.id, c.enabled !== false)}`)));
  $("armsList").innerHTML = rows.join("");
  renderMatrix();
}

function renderMatrix() {
  const ids = set.ids;
  const head = ids.map((id) => `<th>${iconHtml(id, 1)}</th>`).join("");
  const body = ids.map((a) => {
    const cells = ids.map((b) => {
      if (a === b) return `<td><span class="m-cell self">=</span></td>`;
      const v = set.rel(a, b);
      const cls = v > 0 ? "win" : v < 0 ? "lose" : "";
      const mark = v > 0 ? "✓" : v < 0 ? "✕" : "–";
      const title = v > 0 ? `${nameOfWeapon(a)} bat ${nameOfWeapon(b)}` : v < 0 ? `${nameOfWeapon(a)} perd contre ${nameOfWeapon(b)}` : `${nameOfWeapon(a)} et ${nameOfWeapon(b)} : rien ne se passe`;
      const locked = Rules.CLASSIC.includes(a) && Rules.CLASSIC.includes(b);
      return locked
        ? `<td><span class="m-cell ${cls} locked" title="${esc(title)}">${mark}</span></td>`
        : `<td><button type="button" class="m-cell ${cls}" data-a="${esc(a)}" data-b="${esc(b)}" title="${esc(title)}" aria-label="${esc(title)}">${mark}</button></td>`;
    }).join("");
    return `<tr><th>${iconHtml(a, 0)}</th>${cells}</tr>`;
  }).join("");
  $("matrix").innerHTML = `<table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>`;
  const warnings = [];
  ids.forEach((id) => {
    const wins = ids.some((o) => set.rel(id, o) > 0);
    const loses = ids.some((o) => set.rel(id, o) < 0);
    if (!loses && wins) warnings.push(`${nameOfWeapon(id)} ne perd jamais`);
    if (!wins && loses) warnings.push(`${nameOfWeapon(id)} ne gagne jamais`);
  });
  const warn = $("matrixWarn");
  warn.textContent = warnings.length ? `⚠️ Pas très équilibré : ${warnings.join(", ")}.` : "";
  warn.classList.toggle("hidden", !warnings.length);
}

function weaponsChanged(message) {
  rebuildSet();
  renderArms();
  renderSettings();
  newMatch();
  renderStats();
  if (message) toast(message);
  scheduleSave();
}

function setRelation(a, b, value) {
  overrides[Rules.pairKey(a, b)] = a < b ? value : -value;
}

// La fenêtre de création
let editing = null;

function openWeaponDialog(id = null) {
  const existing = id ? customs.find((c) => c.id === id) : null;
  if (!existing && customs.length >= MAX_CUSTOM) {
    toast(`${MAX_CUSTOM} armes personnalisées au maximum`);
    return;
  }
  const fs = fullSet();
  const others = fs.ids.filter((o) => o !== id);
  editing = {
    id,
    image: existing ? existing.image : null,
    attack: existing && Rules.ATTACKS[existing.attack] ? existing.attack : "eject",
    hand: existing && existing.hand ? { ...existing.hand } : { ...HAND_PRESETS[0].states },
    rel: Object.fromEntries(others.map((o) => [o, existing ? fs.rel(id, o) : 0])),
  };
  $("weaponTitle").textContent = existing ? `Modifier ${existing.name}` : "Créer une arme";
  $("weaponName").value = existing ? existing.name : "";
  $("weaponError").classList.add("hidden");
  $("weaponDelete").classList.toggle("hidden", !existing);
  renderWeaponImage();
  renderWeaponRelations();
  renderWeaponAttacks();
  renderWeaponHand();
  $("weaponDialog").showModal();
}

const ATTACK_NOTES = {
  charge: "Elle recule, fonce, et l’autre vole en éclats.",
  eject: "Un énorme coup envoie l’autre hors de l’écran.",
  explode: "Elle gonfle, tremble, et tout saute.",
  crush: "Elle monte, retombe de tout son poids et aplatit l’autre.",
  slice: "Un passage éclair, puis l’autre se sépare en deux.",
  suck: "Un tourbillon avale l’autre.",
  zap: "Des éclairs de plus en plus forts frappent l’autre.",
};

const HAND_PRESETS = [
  { label: "👉 Pointe", states: { thumb: 2, index: 0, middle: 2, ring: 2, pinky: 2 } },
  { label: "✊ Poing", states: { thumb: 2, index: 2, middle: 2, ring: 2, pinky: 2 } },
  { label: "✋ Ouverte", states: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 } },
  { label: "✌️ V", states: { thumb: 2, index: 0, middle: 0, ring: 2, pinky: 2 } },
  { label: "🤟 Love", states: { thumb: 0, index: 0, middle: 2, ring: 2, pinky: 0 } },
  { label: "🤘 Cornes", states: { thumb: 2, index: 0, middle: 2, ring: 2, pinky: 0 } },
  { label: "👍 Pouce", states: { thumb: 0, index: 2, middle: 2, ring: 2, pinky: 2 } },
  { label: "🤙 Appel", states: { thumb: 0, index: 2, middle: 2, ring: 2, pinky: 0 } },
];
const HAND_FINGERS = [["thumb", "Pouce"], ["index", "Index"], ["middle", "Majeur"], ["ring", "Annulaire"], ["pinky", "Auriculaire"]];

function renderWeaponAttacks() {
  $("weaponAttacks").innerHTML = Object.entries(Rules.ATTACKS).map(([key, a]) => `<button type="button" class="chip${key === editing.attack ? " active" : ""}" data-attack="${key}">${a.label}</button>`).join("");
  $("weaponAttackNote").textContent = ATTACK_NOTES[editing.attack];
}

function renderWeaponHand() {
  const same = (a, b) => HAND_FINGERS.every(([f]) => a[f] === b[f]);
  $("handPresets").innerHTML = HAND_PRESETS.map((p, i) => `<button type="button" class="chip${same(p.states, editing.hand) ? " active" : ""}" data-preset="${i}">${p.label}</button>`).join("");
  $("handFingers").innerHTML = HAND_FINGERS.map(([key, label]) => {
    const chip = (v, text) => `<button type="button" class="chip${editing.hand[key] === v ? " active" : ""}" data-finger="${key}" data-v="${v}">${text}</button>`;
    return `<div class="finger-row"><span>${label}</span><span class="presets">${chip(0, "Tendu")}${chip(1, "Mi-plié")}${chip(2, "Plié")}</span></div>`;
  }).join("");
  const url = Stage.ok ? Stage.handThumbnail(0, editing.hand) : null;
  $("handPreview").classList.toggle("hidden", !url);
  if (url) $("handPreview").src = url;
}

function renderWeaponImage() {
  const img = $("weaponPreview");
  img.classList.toggle("hidden", !editing.image);
  $("weaponPlaceholder").classList.toggle("hidden", !!editing.image);
  if (editing.image) img.src = editing.image;
}

function renderWeaponRelations() {
  const fs = fullSet();
  $("weaponRelations").innerHTML = Object.keys(editing.rel).map((o) => {
    const v = editing.rel[o];
    const chip = (val, label, cls) => `<button type="button" class="chip ${cls}${v === val ? " active" : ""}" data-o="${esc(o)}" data-v="${val}">${label}</button>`;
    return `<div class="rel-row"><span class="rel-name">${iconHtml(o, 0)}<span>${esc(fs.weapons[o].name)}</span></span><span class="rel-choice">${chip(1, "Elle gagne", "win")}${chip(0, "Rien", "")}${chip(-1, "Elle perd", "lose")}</span></div>`;
  }).join("");
}

function importWeaponImage(file) {
  const error = $("weaponError");
  error.classList.add("hidden");
  if (!file.type.startsWith("image/")) {
    error.textContent = "Ce fichier n’est pas une image.";
    error.classList.remove("hidden");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    // Réduite et recadrée en carré, pour rester légère dans la sauvegarde
    const S = 192;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const r = Math.max(S / img.width, S / img.height);
    const w = img.width * r, h = img.height * r;
    g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    editing.image = c.toDataURL("image/webp", 0.86);
    URL.revokeObjectURL(url);
    renderWeaponImage();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    error.textContent = "Impossible de lire cette image.";
    error.classList.remove("hidden");
  };
  img.src = url;
}

function saveWeapon() {
  const name = $("weaponName").value.trim();
  const error = $("weaponError");
  if (!name) {
    error.textContent = "Donne-lui un nom.";
    error.classList.remove("hidden");
    return;
  }
  const taken = fullSet().ids.some((id) => id !== editing.id && fullSet().weapons[id].name.toLowerCase() === name.toLowerCase());
  if (taken) {
    error.textContent = "Une autre arme porte déjà ce nom.";
    error.classList.remove("hidden");
    return;
  }
  let weapon;
  if (editing.id) {
    weapon = customs.find((c) => c.id === editing.id);
    Object.assign(weapon, { name, attack: editing.attack, hand: editing.hand, image: editing.image });
  } else {
    weapon = { id: `c${Date.now().toString(36)}`, name, attack: editing.attack, hand: editing.hand, image: editing.image, enabled: true, emoji: "⭐", tint: "#9b6dff" };
    customs.push(weapon);
  }
  Object.entries(editing.rel).forEach(([o, v]) => setRelation(weapon.id, o, v));
  $("weaponDialog").close();
  weaponsChanged(`${name} rejoint le combat ⚔️`);
}

function deleteWeapon(id) {
  customs = customs.filter((c) => c.id !== id);
  Object.keys(overrides).forEach((k) => {
    if (k.split("|").includes(id)) delete overrides[k];
  });
  delete settings.keys[id];
  weaponsChanged("Arme supprimée 🗑");
}

// --- Le tournoi -----------------------------------------------------------------

function defaultTourSetup() {
  const names = Tournament.shuffled(Tournament.BOT_NAMES);
  return {
    count: 8,
    shuffle: true,
    watch: false,
    players: Array.from({ length: 16 }, (_, i) => (
      i === 0 ? { name: settings.names[0] || "Toi", kind: "human", level: 10 } : { name: names[i], kind: "bot", level: 1 + Math.floor(((i - 1) / 14) * 19) }
    )),
  };
}

function renderTourSetup() {
  const s = tourSetup;
  $("tourCount").value = s.count;
  $("tourCount").style.setProperty("--fill", `${((s.count - 2) / 14) * 100}%`);
  $("tourCountValue").textContent = s.count;
  document.querySelectorAll("#tourPresets .chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.n) === s.count));
  $("tourShuffle").checked = s.shuffle;
  $("tourWatch").checked = s.watch;
  const levels = BotAI.LEVELS.slice(1).map((l, i) => `<option value="${i + 1}">Niv. ${i + 1} · ${esc(l.name)}</option>`).join("");
  $("tourPlayers").innerHTML = s.players.slice(0, s.count).map((p, i) => `<div class="tour-player" data-i="${i}" style="animation-delay:${i * 18}ms">
    <span class="prob-index">${i + 1}</span>
    <input class="tour-name" type="text" maxlength="18" value="${esc(p.name)}" aria-label="Nom du joueur ${i + 1}">
    <span class="tour-kind">
      <button type="button" data-kind="human" class="${p.kind === "human" ? "active" : ""}" title="Humain" aria-label="Humain">👤</button>
      <button type="button" data-kind="bot" class="${p.kind === "bot" ? "active" : ""}" title="Bot" aria-label="Bot">🤖</button>
    </span>
    <select class="tour-level" ${p.kind === "human" ? "disabled" : ""} aria-label="Niveau du bot">${levels}</select>
  </div>`).join("");
  document.querySelectorAll("#tourPlayers .tour-player").forEach((row) => {
    row.querySelector(".tour-level").value = s.players[Number(row.dataset.i)].level;
  });
}

function startTournament() {
  const s = tourSetup;
  const players = s.players.slice(0, s.count).map((p, i) => ({ ...p, name: p.name.trim() || `Joueur ${i + 1}` }));
  tour = Tournament.create(players, s.shuffle);
  tourView = "bracket";
  tourMatch = null;
  match = null;
  Sound.shuffle(16);
  Sound.click();
  renderAll();
  renderTour({ deal: true });
  scheduleSave();
  // Le tirage se voit d'abord, puis les bots commencent s'il n'y a qu'eux au prochain match
  const token = ++tourToken;
  tourAutoRun(token, 1100);
}

let tourToken = 0;

function renderTour(opts = {}) {
  if (!tour) return;
  const step = Tournament.next(tour);
  const el = $("tourBracket");
  Tournament.render(el, tour, { current: step ? { r: step.r, m: step.m } : null, ...opts });
  const banner = $("tourBanner");
  if (banner) {
    if (tour.champion !== null) banner.innerHTML = `🏆 <strong>${esc(tour.players[tour.champion].name)}</strong> remporte le tournoi !`;
    else if (step) banner.innerHTML = `${esc(Tournament.roundName(tour, step.r))} · <strong>${esc(tour.players[step.match.a].name)}</strong> contre <strong>${esc(tour.players[step.match.b].name)}</strong>`;
  }
}

function currentTourPlayers() {
  const step = tourMatch;
  const m = tour.rounds[step.r][step.m];
  const a = tour.players[m.a], b = tour.players[m.b];
  return step.swap ? [b, a] : [a, b];
}

function tourNeedsPlayer(step) {
  const a = tour.players[step.match.a], b = tour.players[step.match.b];
  return a.kind === "human" || b.kind === "human" || tourSetup.watch;
}

// Simule un match entre deux bots, sans animation
function simulateMatch(pa, pb) {
  const players = [pa, pb];
  const sim = Rules.createMatch({ players, format: settings.format, mode: settings.mode, firstHunter: Math.random() < 0.5 ? 0 : 1 });
  const idx = (id) => set.ids.indexOf(id);
  const names = set.ids.map(nameOfWeapon);
  const seed = Math.floor(Math.random() * 1000);
  let guard = 0;
  while (!sim.over) {
    if (++guard > 400) {
      // Sécurité pour les règles sans gagnant possible : un tirage au sort départage
      const w = Math.random() < 0.5 ? 0 : 1;
      sim.score[w] = sim.target;
      sim.over = true;
      sim.winner = w;
      break;
    }
    const moves = [0, 1].map((s) => {
      const hist = sim.rounds.map((r) => ({ me: idx(r.picks[s]), opp: idx(r.picks[1 - s]), out: r.winner === s ? 1 : r.winner === -1 ? 0 : -1 }));
      const d = BotAI.decide({ history: hist, n: set.ids.length, rel: (i, j) => set.relIndex(i, j), mode: sim.mode, level: players[s].level, isHunter: sim.hunter === s, seed: seed + s, names });
      return set.ids[d.move];
    });
    const result = Rules.evaluate(set, sim.mode, moves[0], moves[1], sim.hunter);
    Rules.addRound(sim, { picks: moves, winner: result.winner });
  }
  return sim;
}

async function advanceInBoard(r, m) {
  const duration = 760 / Math.min(3, effectiveSpeed());
  Sound.advance();
  const winner = tour.players[tour.rounds[r][m].w];
  const isFinal = r === tour.rounds.length - 1;
  const message = isFinal ? `🏆 <strong>${esc(winner.name)}</strong> remporte la finale !` : `<strong>${esc(winner.name)}</strong> passe au tour suivant`;
  await Tournament.animateAdvance($("tourBracket"), tour, r, m, reduceMotion() ? 1 : duration, message);
}

async function tourAutoRun(token, firstPause = 0) {
  tourBusy = true;
  renderMain();
  renderVisibility();
  if (firstPause) await delay(reduceMotion() ? 0 : firstPause);
  while (token === tourToken) {
    const step = Tournament.next(tour);
    if (!step || tourNeedsPlayer(step)) break;
    const a = tour.players[step.match.a], b = tour.players[step.match.b];
    const sim = simulateMatch(a, b);
    const winner = sim.winner === 0 ? step.match.a : step.match.b;
    await delay(reduceMotion() ? 0 : 380 / Math.min(3, effectiveSpeed()));
    if (token !== tourToken) return;
    Tournament.report(tour, step.r, step.m, winner, sim.score[0], sim.score[1]);
    await advanceInBoard(step.r, step.m);
    if (token !== tourToken) return;
    renderTour();
    scheduleSave();
  }
  if (token !== tourToken) return;
  tourBusy = false;
  if (tour.champion !== null) celebrateChampion();
  renderAll();
}

function tourContinue() {
  const step = Tournament.next(tour);
  if (!step) {
    if (tour.champion !== null) celebrateChampion();
    return;
  }
  const a = tour.players[step.match.a], b = tour.players[step.match.b];
  // À un humain contre un bot, l'humain est toujours à gauche
  tourMatch = { r: step.r, m: step.m, swap: a.kind === "bot" && b.kind === "human" };
  Sound.click();
  startMatch(currentTourPlayers());
  $("playCard").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
}

async function closeTourMatch() {
  const step = tourMatch;
  const s = match.score;
  const m = tour.rounds[step.r][step.m];
  const winner = step.swap ? (match.winner === 0 ? m.b : m.a) : (match.winner === 0 ? m.a : m.b);
  const sa = step.swap ? s[1] : s[0], sb = step.swap ? s[0] : s[1];
  cancelRun();
  tourMatch = null;
  match = null;
  phase = "idle";
  Tournament.report(tour, step.r, step.m, winner, sa, sb);
  tourBusy = true;
  renderAll();
  const token = ++tourToken;
  await advanceInBoard(step.r, step.m);
  if (token !== tourToken) return;
  renderTour();
  scheduleSave();
  tourAutoRun(token);
}

function celebrateChampion() {
  renderTour({});
  const champ = tour.players[tour.champion];
  Sound.champion();
  Haptics.buzz([60, 40, 60, 40, 200]);
  confetti(260);
  setTimeout(() => confetti(160), 900);
  const col = $("tourChampion");
  if (col) burst(col.parentElement, 34, true);
  toast(`${champ.name} remporte le tournoi ! 🏆`);
  scheduleSave();
}

function resetTournament() {
  tourToken++;
  cancelRun();
  tour = null;
  tourMatch = null;
  tourBusy = false;
  tourView = "setup";
  match = null;
  phase = "idle";
  Sound.click();
  renderTourSetup();
  renderAll();
  scheduleSave();
}

// --- Sauvegarde ----------------------------------------------------------------

function serialize() {
  return {
    version: SAVE_VERSION,
    settings, cosmetics, customs, overrides, stats, memory, memorySig,
    history: roundLog.slice(-200),
    tourSetup,
    tour: tour ? { players: tour.players, rounds: tour.rounds, champion: tour.champion } : null,
    tourView,
  };
}

let saveTimer;
let saveWarned = false;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeSave, 300);
}
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
    saveWarned = false;
  } catch (e) {
    if (!saveWarned) toast("Mémoire du navigateur pleine : télécharge un fichier de sauvegarde 💾");
    saveWarned = true;
  }
}

function cleanSettings(raw) {
  const d = DEFAULT_SETTINGS();
  const s = { ...d, ...(raw || {}) };
  if (!Rules.MODES[s.mode]) s.mode = d.mode;
  if (!["bot", "human", "tournament"].includes(s.opponent)) s.opponent = d.opponent;
  s.level = Math.max(1, Math.min(20, Math.round(Number(s.level)) || d.level));
  if (!s.format || !["bo", "first"].includes(s.format.type)) s.format = d.format;
  s.format = { type: s.format.type, n: Math.max(1, Math.min(999, Math.round(Number(s.format.n)) || 3)) };
  if (s.format.type === "bo" && ![3, 5, 10].includes(s.format.n)) s.format.n = 3;
  s.firstTo = Math.max(1, Math.min(999, Math.round(Number(s.firstTo)) || 5));
  if (![0.5, 1, 1.5, 2, 3, 40].includes(s.speed)) s.speed = 1;
  if (![2, 5, 10].includes(s.blitz)) s.blitz = 2;
  if (!["gesture", "object"].includes(s.handStyle)) s.handStyle = "gesture";
  s.truth = Math.max(0, Math.min(100, Number(s.truth)));
  if (Number.isNaN(s.truth)) s.truth = 50;
  s.extras = { fire: !!(s.extras && s.extras.fire), water: !!(s.extras && s.extras.water) };
  s.keys = { ...DEFAULT_KEYS(), ...(s.keys || {}) };
  s.keyLabels = s.keyLabels || {};
  s.restartKey = s.restartKey || "KeyR";
  s.names = Array.isArray(s.names) && s.names.length === 2 ? s.names.map((n, i) => String(n || d.names[i]).slice(0, 18)) : d.names;
  return s;
}

function cleanCosmetics(raw) {
  const d = DEFAULT_COSMETICS();
  if (!Array.isArray(raw)) return d;
  return d.map((def, i) => {
    const c = raw[i] || {};
    return {
      skin: isHex(c.skin) ? c.skin : def.skin,
      rock: {
        color: c.rock && isHex(c.rock.color) ? c.rock.color : def.rock.color,
        pattern: c.rock && Textures.ROCK_PATTERNS[c.rock.pattern] ? c.rock.pattern : def.rock.pattern,
      },
      scissors: { color: c.scissors && isHex(c.scissors.color) ? c.scissors.color : def.scissors.color, rust: !!(c.scissors && c.scissors.rust) },
      paper: {
        text: c.paper && typeof c.paper.text === "string" ? c.paper.text.slice(0, 60) : def.paper.text,
        textColor: c.paper && isHex(c.paper.textColor) ? c.paper.textColor : def.paper.textColor,
        ink: c.paper && typeof c.paper.ink === "string" && c.paper.ink.startsWith("data:image/") ? c.paper.ink : null,
        textInk: c.paper && typeof c.paper.textInk === "string" && c.paper.textInk.startsWith("data:image/") ? c.paper.textInk : null,
      },
    };
  });
}

function cleanHand(raw) {
  const out = {};
  const fallback = { thumb: 2, index: 0, middle: 2, ring: 2, pinky: 2 };
  Object.keys(fallback).forEach((f) => { out[f] = raw && [0, 1, 2].includes(raw[f]) ? raw[f] : fallback[f]; });
  return out;
}

function cleanCustoms(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_CUSTOM).filter((c) => c && typeof c.id === "string" && typeof c.name === "string").map((c) => ({
    id: c.id,
    name: c.name.slice(0, 18),
    attack: Rules.ATTACKS[c.attack] ? c.attack : "charge",
    hand: cleanHand(c.hand),
    image: typeof c.image === "string" && c.image.startsWith("data:image/") ? c.image : null,
    enabled: c.enabled !== false,
    emoji: "⭐",
    tint: isHex(c.tint) ? c.tint : "#9b6dff",
  }));
}

function restoreData(data) {
  settings = cleanSettings(data.settings);
  cosmetics = cleanCosmetics(data.cosmetics);
  customs = cleanCustoms(data.customs);
  overrides = data.overrides && typeof data.overrides === "object" ? data.overrides : {};
  stats = { ...emptyStats(), ...(data.stats || {}) };
  if (!Array.isArray(stats.levels) || stats.levels.length !== 21) stats.levels = emptyStats().levels;
  memory = data.memory && typeof data.memory === "object" ? data.memory : {};
  memorySig = data.memorySig || "";
  roundLog = Array.isArray(data.history) ? data.history : [];
  tourSetup = data.tourSetup && Array.isArray(data.tourSetup.players) && data.tourSetup.players.length === 16 ? data.tourSetup : null;
  tour = data.tour && Array.isArray(data.tour.rounds) ? data.tour : null;
  tourView = tour ? "bracket" : "setup";
}

// Les poignées et les images ne vont pas dans le lien : il deviendrait trop long
function shareable() {
  return {
    settings: { ...settings },
    overrides,
    cosmetics: cosmetics.map((c) => ({ ...c, paper: { ...c.paper, ink: null, textInk: null } })),
  };
}

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function encodeConfig(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (!("CompressionStream" in window)) return "p" + toBase64Url(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return "z" + toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function decodeConfig(text) {
  const bytes = fromBase64Url(text.slice(1));
  if (text[0] === "p") return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return JSON.parse(await new Response(stream).text());
}

async function openShare() {
  Sound.click();
  $("importError").classList.add("hidden");
  $("shareDialog").showModal();
  const link = $("shareLink");
  link.value = "…";
  try {
    const code = await encodeConfig(shareable());
    link.value = `${location.origin}${location.pathname}#c=${code}`;
  } catch (e) {
    link.value = "Impossible de créer le lien sur ce navigateur";
  }
}

function exportFile() {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pierre-feuille-ciseaux-sauvegarde.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Sauvegarde téléchargée 💾");
}

async function importFile(file) {
  const error = $("importError");
  error.classList.add("hidden");
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== "object" || !data.settings) throw new Error("format");
    restoreData(data);
    await preloadPaper();
    afterLoad();
    $("shareDialog").close();
    toast("Sauvegarde chargée 📂");
  } catch (e) {
    error.textContent = "Ce fichier n’est pas une sauvegarde de Pierre Feuille Ciseaux.";
    error.classList.remove("hidden");
  }
}

const preloadPaper = () => Textures.preload(cosmetics.flatMap((c) => [c.paper.ink, c.paper.textInk]));

function afterLoad() {
  if (!tourSetup) tourSetup = defaultTourSetup();
  [0, 1].forEach((s) => {
    Stage.setCosmetics(s, cosmetics[s]);
    thumbs[s] = {};
  });
  rebuildSet();
  renderSettings();
  renderArms();
  renderCos();
  drawPadBack();
  loadPadInk();
  renderTourSetup();
  renderHistory();
  renderStats();
  tourMatch = null;
  match = null;
  phase = "idle";
  if (isTournament()) {
    cancelRun();
    renderAll();
    if (tour) {
      renderTour();
      if (tour.champion === null) tourAutoRun(++tourToken, 400);
    }
  } else {
    newMatch();
  }
  renderBrain(null);
}

// --- Clavier --------------------------------------------------------------------

function onKey(e) {
  if (listening) {
    e.preventDefault();
    e.stopPropagation();
    finishListening(e);
    return;
  }
  if (e.defaultPrevented || document.querySelector("dialog[open]")) return;
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.altKey || e.metaKey || e.ctrlKey || e.repeat) return;
  const code = normalizeCode(e.code);
  if (code === "Space") {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "A" || e.target.tagName === "SUMMARY") return;
    e.preventDefault();
    if (phase === "curtain" || phase === "ready" || phase === "over" || inTourBoard()) {
      if (!$("mainBtn").disabled) mainAction();
    } else if (phase === "anim" && Stage.ok) {
      Stage.skip();
    }
    return;
  }
  if (code === settings.restartKey) {
    if (inTourBoard()) return;
    e.preventDefault();
    Sound.click();
    if (isTournament() && phase === "over") return;
    newMatch();
    return;
  }
  const weapon = set.ids.find((id) => settings.keys[id] === code);
  if (weapon && phase === "choose") {
    e.preventDefault();
    choose(weapon);
  }
}

// --- Branchements ---------------------------------------------------------------

function changeSetting(apply) {
  apply();
  Sound.click();
  renderSettings();
  renderAll();
  newMatch();
  renderStats();
  scheduleSave();
}

function bindUI() {
  $("modeTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t || settings.mode === t.dataset.mode) return;
    changeSetting(() => {
      settings.mode = t.dataset.mode;
      if (settings.mode === "blind" && settings.opponent === "human") {
        settings.opponent = "bot";
        toast("Le mode aveugle se joue contre l’ordi 🤖");
      }
      if (settings.mode === "duo" && isTournament()) {
        tourToken++;
        tourBusy = false;
        tourMatch = null;
        settings.opponent = "bot";
        toast("En duo, on gagne ensemble : pas de tournoi 🤝");
      }
    });
    renderCos();
  });
  $("oppSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || settings.opponent === b.dataset.opp) return;
    tourToken++;
    tourBusy = false;
    tourMatch = null;
    cancelRun();
    settings.opponent = b.dataset.opp;
    if (settings.mode === "blind" && settings.opponent === "human") {
      settings.mode = "normal";
      toast("Le mode aveugle se joue contre l’ordi : retour au mode normal");
    }
    if (settings.mode === "duo" && isTournament()) {
      settings.mode = "normal";
      toast("En duo, on gagne ensemble : le tournoi se joue en mode normal");
    }
    Sound.click();
    match = null;
    phase = "idle";
    renderSettings();
    renderCos();
    renderBrain(null);
    if (isTournament()) {
      renderAll();
      renderTourSetup();
      if (tour) {
        renderTour();
        if (tour.champion === null) tourAutoRun(++tourToken);
      }
    } else {
      newMatch();
    }
    scheduleSave();
  });

  const chips = $("levelChips");
  for (let l = 1; l <= 20; l++) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip";
    c.dataset.level = l;
    c.textContent = l;
    c.title = BotAI.LEVELS[l].name;
    chips.appendChild(c);
  }
  chips.addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    const level = Number(c.dataset.level);
    if (level !== settings.level) changeSetting(() => { settings.level = level; });
  });
  $("levelRows").addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const level = Number(row.dataset.level);
    if (level !== settings.level && settings.opponent === "bot") changeSetting(() => { settings.level = level; });
  });

  $("formatChips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    const next = c.dataset.first ? { type: "first", n: settings.firstTo } : { type: "bo", n: Number(c.dataset.bo) };
    if (next.type === settings.format.type && next.n === settings.format.n) return;
    changeSetting(() => { settings.format = next; });
  });
  const setFirst = (value) => {
    const v = Math.max(1, Math.min(999, Math.round(value) || 1));
    changeSetting(() => {
      settings.firstTo = v;
      settings.format = { type: "first", n: v };
    });
  };
  $("firstTo").addEventListener("change", (e) => setFirst(Number(e.target.value)));
  $("firstRandom").addEventListener("click", () => setFirst(Math.round(Math.exp(Math.random() * Math.log(50)))));

  $("blindPresets").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    settings.truth = Number(c.dataset.truth);
    Sound.click();
    renderBlind();
    blindChanged();
  });

  $("blitzChips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    const seconds = Number(c.dataset.blitz);
    if (seconds !== settings.blitz) changeSetting(() => { settings.blitz = seconds; });
  });

  $("handSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || settings.handStyle === b.dataset.hand) return;
    settings.handStyle = b.dataset.hand;
    Sound.click();
    renderSettings();
    scheduleSave();
  });
  $("speedChips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    settings.speed = Number(c.dataset.speed);
    Sound.click();
    renderSettings();
    scheduleSave();
  });
  $("keyList").addEventListener("click", (e) => {
    const b = e.target.closest(".key-btn");
    if (b) startListening(b);
  });
  $("keysReset").addEventListener("click", () => {
    settings.keys = DEFAULT_KEYS();
    settings.restartKey = "KeyR";
    ensureKeys();
    Sound.click();
    renderKeys();
    renderWeapons();
    renderHint();
    scheduleSave();
  });

  $("weaponGrid").addEventListener("click", (e) => {
    const b = e.target.closest(".weapon-btn");
    if (b && phase === "choose") choose(b.dataset.id);
  });
  $("mainBtn").addEventListener("click", mainAction);
  $("curtain").addEventListener("click", () => { if (phase === "curtain") readyToChoose(); });
  $("arena").addEventListener("click", () => { if (phase === "anim" && Stage.ok) Stage.skip(); });
  $("brainBtn").addEventListener("click", () => {
    Sound.click();
    $("brainCard").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
  });
  $("bracketBtn").addEventListener("click", () => {
    // Le tableau se regarde dans une fenêtre, sans quitter le match
    Sound.click();
    const d = document.createElement("dialog");
    d.className = "dialog bracket-dialog";
    d.style.width = "min(1180px, calc(100vw - 32px))";
    d.innerHTML = `<form method="dialog" class="dialog-close"><button aria-label="Fermer">✕</button></form><h2>Le tableau</h2><div class="tour-bracket" style="margin-top:14px"></div>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.showModal();
    Tournament.render(d.querySelector(".tour-bracket"), tour, { current: tourMatch ? { r: tourMatch.r, m: tourMatch.m } : null });
  });
  $("tourResetBtn").addEventListener("click", resetTournament);

  // Préparation du tournoi
  const setCount = (n) => {
    tourSetup.count = n;
    renderTourSetup();
    scheduleSave();
  };
  $("tourCount").addEventListener("input", (e) => setCount(Number(e.target.value)));
  $("tourPresets").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (c) { Sound.click(); setCount(Number(c.dataset.n)); }
  });
  $("tourShuffle").addEventListener("change", (e) => { tourSetup.shuffle = e.target.checked; scheduleSave(); });
  $("tourWatch").addEventListener("change", (e) => { tourSetup.watch = e.target.checked; scheduleSave(); });
  $("tourRandom").addEventListener("click", () => {
    const names = Tournament.shuffled(Tournament.BOT_NAMES);
    tourSetup.players.forEach((p, i) => {
      if (p.kind === "bot") {
        p.name = names[i % names.length];
        p.level = 1 + Math.floor(Math.random() * 20);
      }
    });
    Sound.shuffle(8);
    renderTourSetup();
    scheduleSave();
  });
  $("tourPlayers").addEventListener("input", (e) => {
    const row = e.target.closest(".tour-player");
    if (!row) return;
    const p = tourSetup.players[Number(row.dataset.i)];
    if (e.target.classList.contains("tour-name")) p.name = e.target.value;
    if (e.target.classList.contains("tour-level")) p.level = Number(e.target.value);
    scheduleSave();
  });
  $("tourPlayers").addEventListener("click", (e) => {
    const b = e.target.closest(".tour-kind button");
    if (!b) return;
    const p = tourSetup.players[Number(b.closest(".tour-player").dataset.i)];
    if (p.kind === b.dataset.kind) return;
    p.kind = b.dataset.kind;
    Sound.click();
    renderTourSetup();
    scheduleSave();
  });
  addEventListener("resize", () => {
    if (tour && !$("tourBracket").classList.contains("hidden")) Tournament.drawLines($("tourBracket"), tour);
  });

  // Personnalisation
  $("cosTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    cosSide = Number(t.dataset.side);
    Sound.click();
    renderCos();
    drawPadBack();
    loadPadInk();
  });
  $("cosCopy").addEventListener("click", () => {
    const other = 1 - cosSide;
    cosmetics[other] = JSON.parse(JSON.stringify(cosmetics[cosSide]));
    thumbs[other] = {};
    Sound.click();
    cosChanged(other, []);
    toast("Copié 📋");
  });
  $("cosName").addEventListener("input", (e) => {
    const name = e.target.value.trim();
    if (!name) return;
    settings.names[cosSide] = name;
    $(`cosTab${cosSide}`).textContent = name;
    if (match && !isTournament()) {
      match.players[cosSide].name = name;
      renderScore();
    }
    scheduleSave();
  });
  $("rockShades").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    cosmetics[cosSide].rock.color = b.dataset.c;
    Sound.click();
    cosChanged(cosSide, ["rock"]);
  });
  $("rockPatterns").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    cosmetics[cosSide].rock.pattern = b.dataset.p;
    Sound.click();
    cosChanged(cosSide, ["rock"]);
  });
  $("rustSwitch").addEventListener("change", (e) => {
    cosmetics[cosSide].scissors.rust = e.target.checked;
    Sound.click();
    if (e.target.checked) Sound.creak();
    cosChanged(cosSide, ["scissors"]);
  });
  bindPad();

  // Armes
  $("armsList").addEventListener("change", (e) => {
    const extra = e.target.dataset.extra;
    const custom = e.target.dataset.custom;
    if (extra) {
      settings.extras[extra] = e.target.checked;
      Sound.click();
      const w = Rules.BUILTIN[extra];
      weaponsChanged(e.target.checked ? `${w.the} entre dans le jeu ${w.emoji}` : `${w.the} quitte le jeu`);
    } else if (custom) {
      customs.find((c) => c.id === custom).enabled = e.target.checked;
      Sound.click();
      weaponsChanged();
    }
  });
  $("armsList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit]");
    if (b) { Sound.click(); openWeaponDialog(b.dataset.edit); }
  });
  $("addWeapon").addEventListener("click", () => { Sound.click(); openWeaponDialog(); });
  $("matrix").addEventListener("click", (e) => {
    const b = e.target.closest("button.m-cell");
    if (!b) return;
    const { a, b: other } = b.dataset;
    const v = set.rel(a, other);
    setRelation(a, other, v === 1 ? -1 : v === -1 ? 0 : 1);
    Sound.click();
    weaponsChanged();
  });
  $("matrixReset").addEventListener("click", () => {
    Object.keys(overrides).forEach((k) => {
      if (k.split("|").every((id) => Rules.BUILTIN[id])) delete overrides[k];
    });
    Sound.click();
    weaponsChanged("Règles de base rétablies");
  });
  $("weaponFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importWeaponImage(e.target.files[0]);
    e.target.value = "";
  });
  $("weaponRelations").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    editing.rel[c.dataset.o] = Number(c.dataset.v);
    Sound.click();
    renderWeaponRelations();
  });
  $("weaponAttacks").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    editing.attack = c.dataset.attack;
    Sound.click();
    renderWeaponAttacks();
  });
  $("handPresets").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    editing.hand = { ...HAND_PRESETS[Number(c.dataset.preset)].states };
    Sound.click();
    renderWeaponHand();
  });
  $("handFingers").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    editing.hand[c.dataset.finger] = Number(c.dataset.v);
    Sound.click();
    renderWeaponHand();
  });
  $("weaponSave").addEventListener("click", saveWeapon);
  $("weaponDelete").addEventListener("click", () => {
    const w = customs.find((c) => c.id === editing.id);
    $("deleteText").textContent = `Est-ce que vous voulez vraiment supprimer ${w.name} ? Son image et ses règles seront effacées. Cette action est définitive.`;
    $("deleteDialog").showModal();
  });
  $("deleteDialog").querySelector('[value="ok"]').addEventListener("click", () => {
    const id = editing.id;
    $("weaponDialog").close();
    deleteWeapon(id);
  });

  // Historique
  $("historyClear").addEventListener("click", () => {
    roundLog = [];
    Sound.click();
    renderHistory();
    scheduleSave();
  });

  // Header
  $("soundBtn").addEventListener("click", () => {
    Sound.enabled = !Sound.enabled;
    renderHeaderToggles();
    savePrefs({ sound: Sound.enabled });
    Sound.click();
  });
  $("vibBtn").addEventListener("click", () => {
    Haptics.enabled = !Haptics.enabled;
    renderHeaderToggles();
    savePrefs({ vibrate: Haptics.enabled });
    Haptics.buzz(20);
  });
  $("themeBtn").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    savePrefs({ theme });
  });
  $("shareBtn").addEventListener("click", openShare);
  $("copyLinkBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("shareLink").value);
    } catch (e) {
      $("shareLink").select();
      document.execCommand("copy");
    }
    toast("Lien copié ! 🔗");
  });
  $("exportBtn").addEventListener("click", exportFile);
  $("importInput").addEventListener("change", (e) => {
    if (e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = "";
  });
  $("clearBtn").addEventListener("click", () => $("confirmDialog").showModal());
  $("confirmDialog").querySelector('[value="ok"]').addEventListener("click", () => {
    stats = emptyStats();
    roundLog = [];
    memory = {};
    renderStats();
    renderHistory();
    renderBrain(null);
    scheduleSave();
    toast("Tout est remis à zéro 🧹");
  });
  document.querySelector(".logo").addEventListener("click", (e) => {
    e.preventDefault();
    scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  });

  document.addEventListener("keydown", onKey);
  addEventListener("pagehide", () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (e) { /* stockage indisponible */ }
  });
}

function renderHeaderToggles() {
  const sound = $("soundBtn"), vib = $("vibBtn");
  sound.classList.toggle("off", !Sound.enabled);
  sound.setAttribute("aria-pressed", Sound.enabled);
  sound.title = Sound.enabled ? "Sons activés" : "Sons coupés";
  vib.classList.toggle("off", !Haptics.enabled);
  vib.setAttribute("aria-pressed", Haptics.enabled);
  const phone = "vibrate" in navigator ? "" : " (sur téléphone uniquement)";
  vib.title = (Haptics.enabled ? "Vibrations activées" : "Vibrations coupées") + phone;
}

async function start() {
  $("year").textContent = new Date().getFullYear();

  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    if (prefs.sound === false) Sound.enabled = false;
    if (prefs.vibrate === false) Haptics.enabled = false;
    if (Array.isArray(prefs.recentColors)) recentColors = prefs.recentColors.filter(isHex).slice(0, 7);
  } catch (e) { /* préférences absentes */ }

  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (data && data.version === SAVE_VERSION) restoreData(data);
  } catch (e) { /* sauvegarde illisible : on repart à zéro */ }

  // Lien de partage : #c=…
  const hash = location.hash.match(/^#c=(.+)$/);
  if (hash) {
    try {
      const shared = await decodeConfig(hash[1]);
      settings = cleanSettings(shared.settings);
      overrides = shared.overrides && typeof shared.overrides === "object" ? shared.overrides : {};
      cosmetics = cleanCosmetics(shared.cosmetics);
      toast("Réglages du lien chargés 🔗");
    } catch (e) {
      toast("Ce lien de partage est abîmé");
    }
    window.history.replaceState(null, "", location.pathname);
  }

  await preloadPaper();
  [0, 1].forEach((s) => Stage.setCosmetics(s, cosmetics[s]));
  Stage.init($("stage3d"), $("arena"));
  Stage.hooks.beat = (i) => {
    const el = $("chant");
    el.innerHTML = `<span class="${i === 3 ? "last" : ""}">${CHANT[i]}</span>`;
  };
  Stage.hooks.fight = () => { $("chant").textContent = ""; };
  Stage.hooks.impact = () => {
    const zone = $("arena");
    zone.classList.remove("landed");
    void zone.offsetWidth;
    zone.classList.add("landed");
  };
  buildBlindRows();
  bindUI();
  renderHeaderToggles();
  afterLoad();
}

start();
