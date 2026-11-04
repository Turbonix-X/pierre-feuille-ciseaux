// ===== Les règles : armes, relations, modes, déroulement d'une partie =====

const Rules = (() => {
  // Les armes de base. "the" sert en début de phrase, "obj" au milieu.
  const BUILTIN = {
    rock: { id: "rock", name: "Pierre", emoji: "🪨", the: "La pierre", obj: "la pierre", tint: "#8a8e96" },
    paper: { id: "paper", name: "Feuille", emoji: "📄", the: "La feuille", obj: "la feuille", tint: "#f5f1e3" },
    scissors: { id: "scissors", name: "Ciseaux", emoji: "✂️", the: "Les ciseaux", obj: "les ciseaux", tint: "#c9ccd4" },
    fire: { id: "fire", name: "Feu", emoji: "🔥", the: "Le feu", obj: "le feu", tint: "#ff7a18" },
    water: { id: "water", name: "Eau", emoji: "💧", the: "L’eau", obj: "l’eau", tint: "#38bdf8" },
  };
  const CLASSIC = ["rock", "paper", "scissors"];

  // Clé commune à une paire d'armes, valeur du point de vue de la première (ordre alphabétique)
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const DEFAULT_RELATIONS = (() => {
    const out = {};
    const set = (winner, loser) => { out[pairKey(winner, loser)] = winner < loser ? 1 : -1; };
    set("rock", "scissors");
    set("scissors", "paper");
    set("paper", "rock");
    set("fire", "paper");
    set("water", "fire");
    set("water", "scissors");
    set("paper", "water");
    set("rock", "water");
    out[pairKey("fire", "scissors")] = 0;
    out[pairKey("fire", "rock")] = 0;
    return out;
  })();

  const SENTENCES = {
    "rock>scissors": "La pierre casse les ciseaux",
    "scissors>paper": "Les ciseaux coupent la feuille",
    "paper>rock": "La feuille enveloppe la pierre",
    "fire>paper": "Le feu brûle la feuille",
    "water>fire": "L’eau éteint le feu",
    "water>scissors": "L’eau fait rouiller les ciseaux",
    "paper>water": "La feuille absorbe l’eau",
    "rock>water": "La pierre fend l’eau",
  };

  // Le jeu en cours : la liste des armes actives et qui bat qui
  function makeSet(customs = [], enabled = {}, overrides = {}) {
    const weapons = {};
    CLASSIC.forEach((id) => { weapons[id] = BUILTIN[id]; });
    if (enabled.fire) weapons.fire = BUILTIN.fire;
    if (enabled.water) weapons.water = BUILTIN.water;
    customs.filter((c) => c.enabled !== false).forEach((c) => {
      weapons[c.id] = { ...c, the: c.name, obj: c.name, custom: true };
    });
    const relations = { ...DEFAULT_RELATIONS, ...overrides };
    const ids = Object.keys(weapons);
    return {
      ids,
      weapons,
      rel(a, b) {
        if (a === b) return 0;
        const v = relations[pairKey(a, b)] || 0;
        return a < b ? v : -v;
      },
      relIndex(i, j) { return this.rel(ids[i], ids[j]); },
    };
  }

  function sentence(set, winner, loser) {
    const key = `${winner}>${loser}`;
    if (SENTENCES[key] && DEFAULT_RELATIONS[pairKey(winner, loser)] === (winner < loser ? 1 : -1)) return SENTENCES[key];
    const w = set.weapons[winner];
    const l = set.weapons[loser];
    if (w.custom && w.verb) return `${w.the} ${w.verb} ${l.obj}`;
    return `${w.the} ${/^(Les) /.test(w.the) ? "battent" : "bat"} ${l.obj}`;
  }

  function neutralSentence(set, a, b) {
    if (a === b) return "Même coup des deux côtés";
    const key = pairKey(a, b);
    if (key === pairKey("fire", "scissors")) return "Le feu ne fait rien aux ciseaux";
    if (key === pairKey("fire", "rock")) return "Le feu ne fait rien à la pierre";
    return `${set.weapons[a].the} et ${set.weapons[b].obj} : rien ne se passe`;
  }

  const MODES = {
    normal: { name: "Normal", emoji: "🎯", anchor: "normal" },
    inverse: { name: "Inversé", emoji: "🙃", anchor: "inverse" },
    mirror: { name: "Miroir", emoji: "🪞", anchor: "miroir" },
    blind: { name: "Aveugle", emoji: "🙈", anchor: "aveugle" },
    blitz: { name: "Éclair", emoji: "⚡", anchor: "eclair" },
  };

  /* Résultat d'une manche.
     a, b : armes jouées (null si le joueur a laissé filer le temps).
     Renvoie winner (0, 1 ou -1 pour personne), raw (qui gagne le combat, avant inversion) et le texte. */
  function evaluate(set, mode, a, b, hunter = 0) {
    if (a === null && b === null) return { winner: -1, raw: 0, late: [true, true], text: "Personne n’a joué à temps" };
    if (a === null) return { winner: 1, raw: -1, late: [true, false], text: "Trop tard : la manche est perdue" };
    if (b === null) return { winner: 0, raw: 1, late: [false, true], text: "Trop tard : la manche est perdue" };
    const late = [false, false];
    if (mode === "mirror") {
      if (a === b) return { winner: hunter, raw: 0, late, same: true, text: `${set.weapons[a].the} des deux côtés : le chasseur a visé juste` };
      return { winner: -1, raw: 0, late, same: false, text: "Coups différents : le fugitif s’échappe" };
    }
    const raw = set.rel(a, b);
    if (raw === 0) return { winner: -1, raw, late, text: neutralSentence(set, a, b) };
    const text = raw > 0 ? sentence(set, a, b) : sentence(set, b, a);
    const fightWinner = raw > 0 ? 0 : 1;
    return { winner: mode === "inverse" ? 1 - fightWinner : fightWinner, raw, late, text };
  }

  // Nombre de points pour gagner : meilleur des 3 → 2, des 5 → 3, des 10 → 6 (à 5-5, le point suivant décide)
  const targetOf = (format) => (format.type === "bo" ? Math.floor(format.n / 2) + 1 : format.n);
  const formatLabel = (format) => (format.type === "bo" ? `Meilleur des ${format.n}` : `Premier à ${format.n} point${format.n > 1 ? "s" : ""}`);

  function createMatch({ players, format, mode, firstHunter = 0 }) {
    return { players, format, mode, target: targetOf(format), score: [0, 0], draws: 0, rounds: [], hunter: firstHunter, over: false, winner: -1 };
  }

  function addRound(match, round) {
    match.rounds.push(round);
    if (round.winner === 0 || round.winner === 1) match.score[round.winner]++;
    else match.draws++;
    if (match.mode === "mirror") match.hunter = 1 - match.hunter;
    if (match.score[0] >= match.target || match.score[1] >= match.target) {
      match.over = true;
      match.winner = match.score[0] >= match.target ? 0 : 1;
    }
  }

  return { BUILTIN, CLASSIC, MODES, DEFAULT_RELATIONS, pairKey, makeSet, sentence, neutralSentence, evaluate, targetOf, formatLabel, createMatch, addRound };
})();
