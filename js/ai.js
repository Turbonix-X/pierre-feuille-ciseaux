// ===== Le cerveau de l'ordi : 20 niveaux =====
// L'ordi décide AVANT que tu joues et ne voit jamais ton coup : il ne se sert que des manches passées.

const BotAI = (() => {
  /* Une manche passée, du point de vue du bot :
     { me: indice joué par le bot, opp: indice joué par l'adversaire (null s'il a laissé filer le temps),
       out: 1 si le bot l'a gagnée, -1 s'il l'a perdue, 0 sinon, ann: indice annoncé en mode aveugle } */

  const normalize = (v) => {
    const s = v.reduce((a, b) => a + b, 0);
    return s > 0 ? v.map((x) => x / s) : v.map(() => 1 / v.length);
  };
  const uniform = (n) => Array(n).fill(1 / n);
  const argmax = (v) => v.reduce((best, x, i) => (x > v[best] ? i : best), 0);
  const point = (n, i, weight = 0.8) => {
    const v = Array(n).fill((1 - weight) / Math.max(1, n - 1));
    v[i] = weight;
    return v;
  };
  const counts = (n, prior = 0.34) => Array(n).fill(prior);

  // --- Ce que l'ordi utilise pour deviner ton prochain coup --------------------

  const PREDICTORS = {
    repeat: {
      label: "Tu rejoues ton dernier coup",
      why: (x) => `Tu viens de jouer ${x.name(x.last)}. J’ai parié que tu allais recommencer.`,
      run: (H, n) => (H.length ? point(n, H[H.length - 1].opp, 0.75) : null),
    },
    cycle: {
      label: "Tu tournes dans le même sens",
      why: () => "Tes derniers coups suivent un ordre. J’ai parié que tu allais continuer à tourner.",
      run: (H, n) => {
        if (H.length < 2) return null;
        const a = H[H.length - 2].opp, b = H[H.length - 1].opp;
        return point(n, (b + ((b - a + n) % n)) % n, 0.72);
      },
    },
    habit: {
      label: "Les réflexes humains",
      why: () => "Beaucoup de gens rejouent après une victoire et changent après une défaite. Je t’ai supposé pareil.",
      run: (H, n, ctx) => {
        if (!H.length) return null;
        const last = H[H.length - 1];
        if (last.out < 0) return point(n, last.opp, 0.62);
        return point(n, ctx.oppBest(last.me), 0.62);
      },
    },
    frequency: {
      label: "Ton coup préféré",
      why: (x) => `Depuis le début, tu joues surtout ${x.name(x.pick)}.`,
      run: (H, n) => {
        if (H.length < 2) return null;
        const c = counts(n);
        H.forEach((r) => { c[r.opp]++; });
        return normalize(c);
      },
    },
    recent: {
      label: "Tes derniers coups",
      why: (x) => `Sur tes derniers coups, ${x.name(x.pick)} revient le plus souvent.`,
      run: (H, n) => {
        if (H.length < 2) return null;
        const c = counts(n);
        H.slice(-8).forEach((r, k) => { c[r.opp] += 0.6 + k * 0.15; });
        return normalize(c);
      },
    },
    markov1: {
      label: "Ce que tu joues après chaque coup",
      why: (x) => `Après ${x.name(x.last)}, tu enchaînes souvent sur ${x.name(x.pick)}.`,
      run: (H, n) => {
        if (H.length < 3) return null;
        const last = H[H.length - 1].opp;
        const c = counts(n);
        for (let i = 1; i < H.length; i++) if (H[i - 1].opp === last) c[H[i].opp]++;
        return normalize(c);
      },
    },
    markov2: {
      label: "Tes enchaînements de deux coups",
      why: (x) => `Quand tu enchaînes tes deux derniers coups comme ça, tu joues souvent ${x.name(x.pick)} ensuite.`,
      run: (H, n) => {
        if (H.length < 4) return null;
        const a = H[H.length - 2].opp, b = H[H.length - 1].opp;
        const c = counts(n, 0.25);
        for (let i = 2; i < H.length; i++) if (H[i - 2].opp === a && H[i - 1].opp === b) c[H[i].opp]++;
        return normalize(c);
      },
    },
    reaction: {
      label: "Ta réaction à mon coup",
      why: (x) => `Quand on vient de jouer ${x.name(x.last)} et ${x.name(x.lastMe)}, tu réponds souvent ${x.name(x.pick)}.`,
      run: (H, n) => {
        if (H.length < 4) return null;
        const last = H[H.length - 1];
        const c = counts(n, 0.25);
        for (let i = 1; i < H.length; i++) if (H[i - 1].opp === last.opp && H[i - 1].me === last.me) c[H[i].opp]++;
        return normalize(c);
      },
    },
    outcome: {
      label: "Ta façon de changer selon le résultat",
      why: () => "J’ai regardé comment tu changes de coup après une victoire, un nul ou une défaite.",
      run: (H, n) => {
        if (H.length < 4) return null;
        const last = H[H.length - 1];
        const shift = counts(n, 0.25);
        for (let i = 1; i < H.length; i++) {
          if (H[i - 1].out === last.out) shift[(H[i].opp - H[i - 1].opp + n) % n]++;
        }
        const v = Array(n).fill(0);
        shift.forEach((s, d) => { v[(last.opp + d) % n] = s; });
        return normalize(v);
      },
    },
    pattern: {
      label: "Une suite que tu as déjà jouée",
      why: (x) => `Tes derniers coups ressemblent à une suite déjà vue, et elle continuait par ${x.name(x.pick)}.`,
      run: (H, n) => {
        if (H.length < 5) return null;
        const c = counts(n, 0.1);
        const end = H.length;
        for (let i = 1; i < end; i++) {
          let len = 0;
          while (len < 8 && i - 1 - len >= 0 && H[i - 1 - len].opp === H[end - 1 - len].opp && end - 1 - len > i - 1 - len) len++;
          if (len >= 2 && i < end) c[H[i].opp] += len * len;
        }
        return normalize(c);
      },
    },
    modelsMe: {
      label: "Tu essaies de me contrer",
      why: (x) => `Je joue beaucoup ${x.name(x.myFav)} : j’ai pensé que tu allais jouer ${x.name(x.pick)} à cause de ça.`,
      run: (H, n, ctx) => {
        if (H.length < 3) return null;
        const c = counts(n);
        H.slice(-10).forEach((r) => { c[r.me]++; });
        return point(n, ctx.oppBest(argmax(c)), 0.7);
      },
    },
  };

  // --- Les 20 niveaux ----------------------------------------------------------

  const ENSEMBLE_A = ["repeat", "habit", "frequency", "recent", "markov1"];
  const ENSEMBLE_B = [...ENSEMBLE_A, "cycle", "markov2", "reaction", "outcome", "pattern"];
  const ENSEMBLE_C = [...ENSEMBLE_B, "modelsMe"];

  const LEVELS = [
    null,
    { name: "Bébé", note: "joue complètement au hasard", kind: "random" },
    { name: "Dé pipé", note: "joue au hasard, avec un coup préféré", kind: "favorite" },
    { name: "Distrait", note: "joue au hasard, sans répéter 3 fois le même coup", kind: "noRepeat" },
    { name: "Copieur", note: "copie souvent ton dernier coup", kind: "copy", noise: 0.3 },
    { name: "Réactif", note: "suppose que tu rejoues ton dernier coup", use: ["repeat"], noise: 0.42, beta: 4 },
    { name: "Psychologue", note: "connaît les réflexes humains", use: ["habit"], noise: 0.36, beta: 5 },
    { name: "Comptable", note: "compte tes coups depuis le début", use: ["frequency"], noise: 0.3, beta: 5 },
    { name: "Observateur", note: "regarde tes 8 derniers coups", use: ["recent"], noise: 0.27, beta: 6 },
    { name: "Détective", note: "apprend quel coup suit quel coup", use: ["markov1"], noise: 0.24, beta: 7 },
    { name: "Stratège", note: "choisit à chaque manche sa meilleure stratégie parmi 5", use: ENSEMBLE_A, meta: "best", noise: 0.2, beta: 8 },
    { name: "Analyste", note: "étudie tes enchaînements de deux coups", use: ["markov2", "markov1"], meta: "best", noise: 0.17, beta: 9 },
    { name: "Tacticien", note: "regarde comment tu réagis au résultat et à ses coups", use: ["reaction", "outcome", "markov1"], meta: "best", noise: 0.15, beta: 10 },
    { name: "Chasseur de suites", note: "retrouve les suites que tu as déjà jouées", use: ["pattern", "markov2", "cycle"], meta: "best", noise: 0.12, beta: 11 },
    { name: "Profileur", note: "choisit parmi 10 stratégies", use: ENSEMBLE_B, meta: "best", noise: 0.1, beta: 12 },
    { name: "Manipulateur", note: "pense aussi que tu essaies de le contrer", use: ENSEMBLE_C, meta: "best", noise: 0.08, beta: 13 },
    { name: "Mentaliste", note: "mélange toutes ses stratégies selon leurs résultats", use: ENSEMBLE_C, meta: "mix", noise: 0.05, beta: 15 },
    { name: "Bluffeur", note: "se demande si tu as deviné ce qu’il pense", use: ENSEMBLE_C, meta: "best", guess: 1, noise: 0.04, beta: 18 },
    { name: "Oracle", note: "pense à ce que tu penses qu’il pense", use: ENSEMBLE_C, meta: "best", guess: 2, noise: 0.02, beta: 22 },
    { name: "Forteresse", note: "se réfugie dans le hasard quand tu le lis trop bien", use: ENSEMBLE_C, meta: "best", guess: 2, guard: true, noise: 0.01, beta: 26 },
    { name: "Turbonix", note: "tout ça à la fois, sans aucune erreur volontaire", use: ENSEMBLE_C, meta: "best", guess: 2, guard: true, noise: 0, beta: 32, sharp: true },
  ];

  // --- Outils ------------------------------------------------------------------

  function makeContext({ n, rel, mode, isHunter }) {
    // Ce que vaut mon coup m face au coup o de l'adversaire
    const util = (m, o) => {
      if (mode === "inverse") return -rel(m, o);
      if (mode === "duo") return m === o ? 1 : 0;
      if (mode === "mirror") return isHunter ? (m === o ? 1 : 0) : (m === o ? -1 : 0);
      return rel(m, o);
    };
    // Ce que vaut le coup o de l'adversaire face à mon coup m
    const oppUtil = (o, m) => {
      if (mode === "inverse") return -rel(o, m);
      if (mode === "duo") return o === m ? 1 : 0;
      if (mode === "mirror") return isHunter ? (o === m ? -1 : 0) : (o === m ? 1 : 0);
      return rel(o, m);
    };
    const bestAgainst = (dist) => {
      const u = Array(n).fill(0);
      for (let m = 0; m < n; m++) for (let o = 0; o < n; o++) u[m] += dist[o] * util(m, o);
      return u;
    };
    const oppBest = (m) => {
      let best = 0, score = -Infinity;
      for (let o = 0; o < n; o++) {
        const s = oppUtil(o, m) + Math.random() * 1e-6;
        if (s > score) { score = s; best = o; }
      }
      return best;
    };
    return { n, util, oppUtil, bestAgainst, oppBest };
  }

  // Mon coup le plus logique si je crois à cette prédiction
  const naiveMove = (dist, ctx) => argmax(ctx.bestAgainst(dist));

  // Variante : « il a deviné ce que je pense » (guess fois de suite)
  function secondGuess(dist, ctx, times) {
    let d = dist;
    for (let k = 0; k < times; k++) d = point(ctx.n, ctx.oppBest(naiveMove(d, ctx)), 0.75);
    return d;
  }

  function candidates(H, cfg, ctx) {
    const out = [];
    cfg.use.forEach((key) => {
      const dist = PREDICTORS[key].run(H, ctx.n, ctx);
      if (!dist) return;
      out.push({ key, guess: 0, dist });
      for (let g = 1; g <= (cfg.guess || 0); g++) out.push({ key, guess: g, dist: secondGuess(dist, ctx, g) });
    });
    return out;
  }

  // Note chaque stratégie sur les dernières manches : celles qui auraient bien deviné montent
  function scoreCandidates(H, cfg, ctx) {
    const scores = {};
    const from = Math.max(1, H.length - 36);
    const decay = 0.93;
    for (let t = from; t < H.length; t++) {
      const past = H.slice(Math.max(0, t - 120), t);
      const age = H.length - 1 - t;
      const weight = Math.pow(decay, age);
      candidates(past, cfg, ctx).forEach((c) => {
        const id = `${c.key}#${c.guess}`;
        scores[id] = (scores[id] || 0) + weight * (c.dist[H[t].opp] - 1 / ctx.n);
      });
    }
    return scores;
  }

  function softmaxPick(u, beta) {
    const top = Math.max(...u);
    const weights = u.map((x) => Math.exp((x - top) * beta));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return u.length - 1;
  }

  const randomIndex = (n) => Math.floor(Math.random() * n);

  // --- La décision -------------------------------------------------------------

  /* options : { history, n, rel(i,j), mode, level, isHunter, seed, names }
     Renvoie { move, dist, predicted, confidence, strategy, label, why, mistake } */
  function decide(options) {
    const { n, level, seed = 0, names = [] } = options;
    const history = options.history || [];
    const cfg = LEVELS[Math.max(1, Math.min(20, level))];
    const ctx = makeContext(options);
    const H = history.filter((r) => r.opp !== null && r.opp !== undefined && r.me !== null && r.me !== undefined).slice(-150);
    const base = { dist: null, predicted: null, confidence: 0, mistake: false, level };

    if (cfg.kind === "random") return { ...base, move: randomIndex(n), strategy: "random", label: "Pur hasard", why: "Je n’ai rien calculé : j’ai pioché un coup au hasard." };
    if (cfg.kind === "favorite") {
      const fav = seed % n;
      const move = Math.random() < 0.5 ? fav : randomIndex(n);
      return { ...base, move, strategy: "favorite", label: "Hasard et coup préféré", why: `Je n’ai pas réfléchi à toi. J’aime juste bien ${names[fav] || "ce coup"}, alors je le joue une fois sur deux.` };
    }
    if (cfg.kind === "noRepeat") {
      const mine = history.slice(-2).map((r) => r.me);
      let move = randomIndex(n);
      if (mine.length === 2 && mine[0] === mine[1]) while (move === mine[0]) move = randomIndex(n);
      return { ...base, move, strategy: "noRepeat", label: "Hasard sans répétition", why: "Je n’ai pas pensé à toi : hasard, sauf que j’évite de jouer 3 fois de suite le même coup." };
    }
    if (cfg.kind === "copy") {
      const last = H.length ? H[H.length - 1].opp : null;
      if (last === null || Math.random() < cfg.noise) return { ...base, move: randomIndex(n), strategy: "copy", label: "Copie", why: "Je n’avais rien à copier cette fois : j’ai joué au hasard." };
      return { ...base, move: last, strategy: "copy", label: "Copie", why: `Je n’ai pas cherché à te battre : j’ai copié ton dernier coup, ${names[last]}.` };
    }

    // Les niveaux qui réfléchissent
    const list = candidates(H, cfg, ctx);
    let chosen = null;
    let dist = uniform(n);
    if (list.length) {
      if (cfg.meta) {
        const scores = H.length >= 2 ? scoreCandidates(H, cfg, ctx) : {};
        const ranked = list.map((c) => ({ ...c, score: scores[`${c.key}#${c.guess}`] || 0 })).sort((a, b) => b.score - a.score);
        if (cfg.meta === "mix") {
          const mixed = Array(n).fill(0);
          ranked.forEach((c) => {
            const w = Math.exp(6 * c.score);
            c.dist.forEach((p, i) => { mixed[i] += w * p; });
          });
          dist = normalize(mixed);
          chosen = ranked[0];
        } else {
          chosen = ranked[0];
          dist = chosen.dist;
        }
      } else {
        chosen = list[0];
        dist = chosen.dist;
      }
    }

    const predicted = chosen ? argmax(dist) : null;
    const confidence = chosen ? Math.max(...dist) : 1 / n;
    const u = ctx.bestAgainst(dist);
    let move = softmaxPick(u, cfg.beta);
    const last = H[H.length - 1];
    const lastMyMoves = {};
    H.slice(-10).forEach((r) => { lastMyMoves[r.me] = (lastMyMoves[r.me] || 0) + 1; });
    const myFav = Object.keys(lastMyMoves).sort((a, b) => lastMyMoves[b] - lastMyMoves[a])[0];
    const words = {
      name: (i) => (i === null || i === undefined ? "ce coup" : names[Number(i)] || "ce coup"),
      last: last ? last.opp : null,
      lastMe: last ? last.me : null,
      pick: predicted,
      myFav,
    };

    let strategy = chosen ? chosen.key : "start";
    let label = chosen ? PREDICTORS[chosen.key].label : "Début de partie";
    let why = chosen ? PREDICTORS[chosen.key].why(words) : "On commence : je ne sais encore rien de toi, alors j’ai joué au hasard.";
    if (chosen && cfg.meta === "mix") {
      label = "Mélange de stratégies";
      why = `J’ai fait voter toutes mes stratégies, en écoutant surtout celles qui ont eu raison récemment. La plus écoutée : « ${PREDICTORS[chosen.key].label} ».`;
    }
    if (chosen && chosen.guess) {
      label = `${label} + ${chosen.guess === 1 ? "double" : "triple"} bluff`;
      why = chosen.guess === 1
        ? `${why} Mais je t’ai cru assez malin pour le voir venir, alors j’ai changé mon pronostic.`
        : `${why} Mais tu penses que je le sais, et je sais que tu le penses : j’ai encore changé mon pronostic.`;
    }

    if (options.mode === "duo" && chosen) {
      label = PREDICTORS[chosen.key].label;
      why = `${PREDICTORS[chosen.key].why(words)} Comme on doit jouer la même chose, j’ai visé ce coup-là.`;
    }

    let mistake = false;
    if (cfg.guard && options.mode !== "duo") {
      const decisive = H.slice(-14).filter((r) => r.out !== 0);
      if (decisive.length >= 8) {
        const lost = decisive.filter((r) => r.out < 0).length / decisive.length;
        if (lost > 0.6 && Math.random() < (lost - 0.5) * 2) {
          move = randomIndex(n);
          strategy = "guard";
          label = "Refuge dans le hasard";
          why = "Tu me lis trop bien en ce moment. Pour ne plus te laisser de prise, j’ai joué au hasard.";
        }
      }
    }
    if (strategy !== "guard" && Math.random() < (cfg.noise || 0)) {
      move = randomIndex(n);
      mistake = true;
      why += ` Puis je me suis volontairement laissé distraire, comme un niveau ${level} : j’ai joué au hasard.`;
    }
    return { move, dist: chosen ? dist : null, predicted, confidence, strategy, label, why, mistake, level };
  }

  /* Mode aveugle : le bot annonce un coup, et ment ou non selon la probabilité choisie.
     Les petits niveaux mentent au hasard. À partir du niveau 6, un mensonge est un piège :
     il annonce le coup qui te pousse à jouer ce qu'il sait battre. */
  function announce({ decision, n, rel, level, lieChance, names = [], mode = "blind" }) {
    const lies = Math.random() < lieChance && n > 1;
    if (!lies) return { announced: decision.move, lied: false, plan: "Je t’ai dit la vérité." };
    const ctx = makeContext({ n, rel, mode, isHunter: false });
    const others = [];
    for (let i = 0; i < n; i++) if (i !== decision.move) others.push(i);
    if (level < 6) {
      const announced = others[randomIndex(others.length)];
      return { announced, lied: true, plan: "J’ai menti, sans plan particulier." };
    }
    // Si j'annonce A, tu vas sans doute jouer ce qui bat A. Je choisis le A qui te fait perdre contre mon vrai coup.
    let announced = others[0], best = -Infinity, baited = 0;
    others.forEach((a) => {
      const reply = ctx.oppBest(a);
      const score = ctx.util(decision.move, reply) + Math.random() * 1e-3;
      if (score > best) { best = score; announced = a; baited = reply; }
    });
    return {
      announced,
      lied: true,
      plan: `J’ai annoncé ${names[announced]} pour que tu joues ${names[baited]}, et j’avais prévu ${names[decision.move]}.`,
    };
  }

  return { LEVELS, decide, announce };
})();

if (typeof module !== "undefined") module.exports = BotAI;
