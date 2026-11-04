// ===== Le tournoi : tableau à élimination directe, jusqu'à 16 joueurs =====

const Tournament = (() => {
  const BOT_NAMES = [
    "Bob le Caillou", "Mme Origami", "Cisaille", "Granit", "Papyrus", "Tranchant", "Galet", "Silex",
    "Confetti", "Basalte", "Parchemin", "Quartz", "Lame Vive", "Rocaille", "Post-it", "Sécateur",
    "Ardoise", "Cocotte", "Coupe-Coupe", "Pavé", "Brouillon", "Rasoir", "Gravier", "Calepin",
  ];

  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Ordre classique d'un tableau : les premières têtes de série ne se croisent qu'à la fin, et les exemptés sont bien répartis
  function seedOrder(size) {
    let order = [1];
    while (order.length < size) {
      const n = order.length * 2 + 1;
      const next = [];
      order.forEach((s) => next.push(s, n - s));
      order = next;
    }
    return order;
  }

  function create(players, shuffle = true) {
    const roster = (shuffle ? shuffled(players) : players.slice()).map((p, i) => ({ ...p, seed: i }));
    let size = 2;
    while (size < roster.length) size *= 2;
    const order = seedOrder(size).map((s) => (s <= roster.length ? s - 1 : null));
    const rounds = [];
    const first = [];
    for (let i = 0; i < size; i += 2) first.push({ a: order[i], b: order[i + 1], w: null, sa: 0, sb: 0, bye: order[i] === null || order[i + 1] === null });
    rounds.push(first);
    for (let n = size / 4; n >= 1; n /= 2) {
      const row = [];
      for (let i = 0; i < n; i++) row.push({ a: null, b: null, w: null, sa: 0, sb: 0, bye: false });
      rounds.push(row);
    }
    const t = { players: roster, rounds, champion: null };
    // Les exemptés passent directement au tour suivant
    first.forEach((m, i) => {
      if (m.bye) {
        const w = m.a !== null ? m.a : m.b;
        place(t, 0, i, w);
      }
    });
    return t;
  }

  function place(t, r, m, winner) {
    const match = t.rounds[r][m];
    match.w = winner;
    if (r + 1 < t.rounds.length) {
      const next = t.rounds[r + 1][Math.floor(m / 2)];
      if (m % 2 === 0) next.a = winner;
      else next.b = winner;
    } else {
      t.champion = winner;
    }
  }

  function next(t) {
    for (let r = 0; r < t.rounds.length; r++) {
      for (let m = 0; m < t.rounds[r].length; m++) {
        const match = t.rounds[r][m];
        if (match.w === null && match.a !== null && match.b !== null) return { r, m, match };
      }
    }
    return null;
  }

  function report(t, r, m, winner, sa, sb) {
    const match = t.rounds[r][m];
    match.sa = sa;
    match.sb = sb;
    place(t, r, m, winner);
  }

  function roundName(t, r) {
    const count = t.rounds[r].length;
    if (count === 1) return "Finale";
    if (count === 2) return "Demi-finales";
    if (count === 4) return "Quarts";
    if (count === 8) return "Huitièmes";
    return `Tour ${r + 1}`;
  }

  // --- Le dessin du tableau ------------------------------------------------------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function slotHtml(t, match, key, hidden) {
    const index = match[key];
    if (hidden) return `<div class="b-slot empty" data-key="${key}"><span class="b-name">…</span></div>`;
    if (index === null) {
      if (match.bye) return `<div class="b-slot bye"><span class="b-name">Exempté</span></div>`;
      return `<div class="b-slot empty" data-key="${key}"><span class="b-name">…</span></div>`;
    }
    const p = t.players[index];
    const done = match.w !== null;
    const won = done && match.w === index && !match.bye;
    const lost = done && match.w !== index;
    const score = done && !match.bye ? `<span class="b-score">${key === "a" ? match.sa : match.sb}</span>` : "";
    return `<div class="b-slot${won ? " won" : ""}${lost ? " lost" : ""}${p.kind === "human" ? " human" : ""}" data-key="${key}" data-player="${index}">
      <span class="b-avatar">${p.kind === "human" ? "👤" : "🤖"}</span><span class="b-name" title="${esc(p.name)}">${esc(p.name)}</span>${score}
    </div>`;
  }

  /* opts.current : { r, m } du match à venir
     opts.hide : { r, m, key } case à laisser vide pendant que le gagnant vole vers elle
     opts.deal : anime la distribution des cartes
     opts.hideChampion : le champion n'arrive qu'à la fin de l'animation */
  function render(el, t, opts = {}) {
    const { current, hide, deal, hideChampion } = opts;
    let counter = 0;
    const columns = t.rounds.map((round, r) => {
      const matches = round.map((match, m) => {
        const isCurrent = current && current.r === r && current.m === m;
        const hideA = hide && hide.r === r && hide.m === m && hide.key === "a";
        const hideB = hide && hide.r === r && hide.m === m && hide.key === "b";
        const i = counter++;
        return `<div class="b-match${isCurrent ? " current" : ""}" data-r="${r}" data-m="${m}" style="${deal ? `--i:${i}` : "animation:none"}">
          ${slotHtml(t, match, "a", hideA)}${slotHtml(t, match, "b", hideB)}
        </div>`;
      }).join("");
      return `<div class="b-round"><div class="b-title">${roundName(t, r)}</div><div class="b-matches">${matches}</div></div>`;
    }).join("");
    const champ = t.champion !== null && !hideChampion ? t.players[t.champion] : null;
    el.innerHTML = `<div class="tour-banner" id="tourBanner"></div>
      <div class="bracket-scroll"><div class="bracket">
        <svg class="bracket-lines" aria-hidden="true"></svg>
        ${columns}
        <div class="b-round b-champion-col"><div class="b-title">Champion</div>
          <div class="b-matches"><div class="b-champion${champ ? " won" : ""}" id="tourChampion"><span class="b-cup">🏆</span><strong>${champ ? esc(champ.name) : "?"}</strong></div></div>
        </div>
      </div></div>`;
    drawLines(el, t, opts);
  }

  function drawLines(el, t, opts = {}) {
    const svg = el.querySelector(".bracket-lines");
    const bracket = el.querySelector(".bracket");
    if (!svg || !bracket) return;
    const box = bracket.getBoundingClientRect();
    const rectOf = (node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left - box.left, right: r.right - box.left, y: r.top - box.top + r.height / 2 };
    };
    const champ = el.querySelector("#tourChampion");
    let paths = "";
    t.rounds.forEach((round, r) => {
      round.forEach((match, m) => {
        const from = el.querySelector(`.b-match[data-r="${r}"][data-m="${m}"]`);
        const to = r + 1 < t.rounds.length ? el.querySelector(`.b-match[data-r="${r + 1}"][data-m="${Math.floor(m / 2)}"]`) : champ;
        if (!from || !to) return;
        const a = rectOf(from), b = rectOf(to);
        const mid = (a.right + b.left) / 2;
        const isNew = opts.drawing && opts.drawing.r === r && opts.drawing.m === m;
        const won = match.w !== null && !match.bye;
        const cls = isNew ? "won drawing" : won && !(opts.hideLine && opts.hideLine.r === r && opts.hideLine.m === m) ? "won" : "";
        paths += `<path class="${cls}" pathLength="1" d="M${a.right} ${a.y}H${mid}V${b.y}H${b.left}"/>`;
      });
    });
    svg.innerHTML = paths;
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.style.width = `${box.width}px`;
    svg.style.height = `${box.height}px`;
  }

  // Le gagnant s'envole vers le tour suivant, en suivant la ligne qui se dessine
  function animateAdvance(el, t, r, m, duration = 700, message = "") {
    const match = t.rounds[r][m];
    const isFinal = r + 1 >= t.rounds.length;
    const nextR = r + 1, nextM = Math.floor(m / 2), key = m % 2 === 0 ? "a" : "b";
    render(el, t, {
      hide: isFinal ? null : { r: nextR, m: nextM, key },
      hideLine: { r, m },
      hideChampion: isFinal,
    });
    const banner = el.querySelector(".tour-banner");
    if (banner) banner.innerHTML = message;
    const scroll = el.querySelector(".bracket-scroll");
    const origin = el.querySelector(`.b-match[data-r="${r}"][data-m="${m}"] .b-slot[data-player="${match.w}"]`);
    const dest = isFinal ? el.querySelector("#tourChampion") : el.querySelector(`.b-match[data-r="${nextR}"][data-m="${nextM}"] .b-slot[data-key="${key}"]`);
    if (!origin || !dest) return Promise.resolve();
    // Garde en vue la partie du tableau qui bouge
    if (scroll) {
      const target = dest.getBoundingClientRect();
      const frame = scroll.getBoundingClientRect();
      if (target.right > frame.right || target.left < frame.left) {
        scroll.scrollLeft += target.left - frame.left - frame.width / 2 + target.width / 2;
      }
    }
    return new Promise((resolve) => {
      const a = origin.getBoundingClientRect();
      const b = dest.getBoundingClientRect();
      const fly = document.createElement("div");
      fly.className = "b-fly";
      fly.textContent = t.players[match.w].name;
      fly.style.left = `${a.left}px`;
      fly.style.top = `${a.top}px`;
      fly.style.width = `${a.width}px`;
      fly.style.height = `${a.height}px`;
      document.body.appendChild(fly);
      drawLines(el, t, { drawing: { r, m } });
      const midX = (a.left + b.left) / 2 - a.left;
      const midY = (a.top + b.top) / 2 - a.top;
      const motion = fly.animate([
        { transform: "translate(0, 0) scale(1)" },
        { transform: `translate(${midX}px, ${midY - 18}px) scale(1.15)`, offset: 0.55 },
        { transform: `translate(${b.left - a.left}px, ${b.top - a.top + (b.height - a.height) / 2}px) scale(1)` },
      ], { duration, easing: "cubic-bezier(.45,.05,.3,1)" });
      motion.onfinish = () => {
        fly.remove();
        resolve();
      };
    });
  }

  return { BOT_NAMES, shuffled, create, next, report, roundName, render, drawLines, animateAdvance };
})();
