// ===== Page des règles : thème, schémas, liste des niveaux =====

document.getElementById("year").textContent = new Date().getFullYear();

document.getElementById("themeBtn").addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    const prefs = JSON.parse(localStorage.getItem("tx-prefs")) || {};
    prefs.theme = theme;
    localStorage.setItem("tx-prefs", JSON.stringify(prefs));
  } catch (e) { /* stockage indisponible */ }
});

// Un schéma en cercle : chaque flèche va de l'arme qui gagne vers celle qui perd
function cycleDiagram(ids) {
  const set = Rules.makeSet([], { fire: true, water: true });
  const R = 112, S = 330, C = S / 2;
  const spot = (i) => {
    const a = -Math.PI / 2 + (i / ids.length) * Math.PI * 2;
    return [C + Math.cos(a) * R, C + Math.sin(a) * R];
  };
  let lines = "";
  ids.forEach((a, i) => {
    ids.forEach((b, j) => {
      if (set.rel(a, b) <= 0) return;
      const [x1, y1] = spot(i), [x2, y2] = spot(j);
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
      const ux = dx / d, uy = dy / d;
      lines += `<line x1="${x1 + ux * 34}" y1="${y1 + uy * 34}" x2="${x2 - ux * 38}" y2="${y2 - uy * 38}" marker-end="url(#arrow)"/>`;
    });
  });
  const nodes = ids.map((id, i) => {
    const [x, y] = spot(i);
    const w = Rules.BUILTIN[id];
    return `<g><circle cx="${x}" cy="${y}" r="30"/><text x="${x}" y="${y - 2}" class="node-emoji">${w.emoji}</text><text x="${x}" y="${y + 16}" class="node-name">${w.name}</text></g>`;
  }).join("");
  return `<svg class="cycle" viewBox="0 0 ${S} ${S}" role="img" aria-label="Qui bat qui">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9b6dff"/></marker></defs>
    <g class="cycle-lines">${lines}</g><g class="cycle-nodes">${nodes}</g></svg>`;
}

document.querySelectorAll("[data-cycle]").forEach((el) => {
  el.innerHTML = cycleDiagram(el.dataset.cycle.split(","));
});

const list = document.getElementById("levelList");
for (let l = 1; l <= 20; l++) {
  const li = document.createElement("li");
  li.innerHTML = `<span class="lv-num">${l}</span><span><strong>${BotAI.LEVELS[l].name}</strong> : ${BotAI.LEVELS[l].note}</span>`;
  list.appendChild(li);
}
