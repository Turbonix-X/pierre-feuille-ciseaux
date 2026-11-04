// ===== Les textures des armes, dessinées en direct (aucune image) =====

const Textures = (() => {
  // --- Bruit --------------------------------------------------------------------
  const hash3 = (x, y, z) => {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const fade = (t) => t * t * (3 - 2 * t);
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const lerp = (a, b, t) => a + (b - a) * t;
    return lerp(
      lerp(lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
      w
    );
  }
  function fbm(x, y, z, octaves = 4) {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise3(x * f, y * f, z * f);
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / (1 - Math.pow(0.5, octaves));
  }
  // Distances aux deux points les plus proches : sert à dessiner des fissures
  function worley(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let f1 = 9, f2 = 9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const cx = xi + i, cy = yi + j, cz = zi + k;
      const dx = cx + hash3(cx, cy, cz) - x;
      const dy = cy + hash3(cy, cz, cx + 7) - y;
      const dz = cz + hash3(cz, cx + 3, cy) - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [Math.sqrt(f1), Math.sqrt(f2)];
  }

  const hexToRgb = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };

  const canvas = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };

  const texture = (c, { srgb = true, repeat = false } = {}) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };

  // --- Pierre -------------------------------------------------------------------

  const ROCK_PATTERNS = {
    plain: "Uni",
    speckled: "Moucheté",
    veined: "Veiné",
    strata: "En strates",
    cracked: "Craquelé",
    granite: "Granit",
  };

  const rockCache = new Map();

  // Le motif est calculé sur la sphère en 3D : pas de raccord visible, pas de pincement aux pôles
  function rockTexture(colorHex, pattern) {
    const key = `${colorHex}|${pattern}`;
    if (rockCache.has(key)) return rockCache.get(key);
    const W = 384, H = 192;
    const color = canvas(W, H), bump = canvas(W, H);
    const cc = color.getContext("2d"), bc = bump.getContext("2d");
    const ci = cc.createImageData(W, H), bi = bc.createImageData(W, H);
    const base = hexToRgb(colorHex);
    const lum = (base[0] + base[1] + base[2]) / 765;
    // Sur une pierre très sombre, les détails sont plus clairs ; sur une pierre claire, plus sombres
    const accent = lum < 0.42 ? base.map((c) => Math.min(255, c + 70 + c * 0.6)) : base.map((c) => c * 0.42);
    for (let py = 0; py < H; py++) {
      const lat = (py / (H - 1)) * Math.PI;
      const sy = Math.cos(lat), r = Math.sin(lat);
      for (let px = 0; px < W; px++) {
        const lon = (px / W) * Math.PI * 2;
        const x = r * Math.cos(lon), y = sy, z = r * Math.sin(lon);
        const tone = fbm(x * 3 + 5, y * 3 + 2, z * 3 + 1, 4);
        const grain = noise3(x * 22, y * 22, z * 22);
        let mixAccent = 0;
        let height = tone * 0.6 + grain * 0.25;
        if (pattern === "speckled") {
          const dots = noise3(x * 28 + 9, y * 28, z * 28);
          mixAccent = dots > 0.72 ? 0.95 : dots < 0.2 ? 0.45 : 0;
          height += dots > 0.72 ? 0.15 : 0;
        } else if (pattern === "veined") {
          const warp = fbm(x * 2.2, y * 2.2, z * 2.2, 3) * 4.5;
          const vein = Math.abs(Math.sin((x * 2.2 + y * 3.1 + z * 1.4) * 3.2 + warp));
          mixAccent = Math.pow(1 - vein, 7) * 1.25;
          height -= mixAccent * 0.12;
        } else if (pattern === "strata") {
          const band = Math.sin(y * 15 + fbm(x * 2, y * 2, z * 2, 3) * 4.2);
          mixAccent = (band * 0.5 + 0.5) * 0.7;
          height += band * 0.13;
        } else if (pattern === "cracked") {
          const [f1, f2] = worley(x * 3.6 + 11, y * 3.6 + 3, z * 3.6 + 7);
          const edge = f2 - f1;
          const crack = edge < 0.055 ? 1 : edge < 0.12 ? 0.3 * (0.12 - edge) * 15 : 0;
          mixAccent = 0;
          height -= crack * 0.55;
          const dark = 1 - crack * 0.82;
          const i = (py * W + px) * 4;
          const shade = 0.82 + tone * 0.36;
          ci.data[i] = base[0] * shade * dark;
          ci.data[i + 1] = base[1] * shade * dark;
          ci.data[i + 2] = base[2] * shade * dark;
          ci.data[i + 3] = 255;
          const b = Math.max(0, Math.min(255, height * 255));
          bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = b;
          bi.data[i + 3] = 255;
          continue;
        } else if (pattern === "granite") {
          const a = noise3(x * 34, y * 34, z * 34), b = noise3(x * 30 + 40, y * 30, z * 30 - 20);
          mixAccent = a > 0.66 ? 1 : b > 0.68 ? 0.55 : 0;
          if (b < 0.25) mixAccent = -0.5;
        }
        const shade = 0.82 + tone * 0.36;
        const i = (py * W + px) * 4;
        for (let k = 0; k < 3; k++) {
          const value = mixAccent >= 0 ? base[k] + (accent[k] - base[k]) * Math.min(1, mixAccent) : base[k] * (1 + mixAccent);
          ci.data[i + k] = Math.max(0, Math.min(255, value * shade));
        }
        ci.data[i + 3] = 255;
        const b = Math.max(0, Math.min(255, height * 255));
        bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = b;
        bi.data[i + 3] = 255;
      }
    }
    cc.putImageData(ci, 0, 0);
    bc.putImageData(bi, 0, 0);
    const out = { map: texture(color), bump: texture(bump, { srgb: false }) };
    rockCache.set(key, out);
    if (rockCache.size > 30) rockCache.delete(rockCache.keys().next().value);
    return out;
  }

  // Rayon d'une pierre selon la direction : une forme un peu irrégulière, toujours la même
  const rockRadius = (x, y, z, seed = 0) => {
    const big = fbm(x * 1.15 + seed, y * 1.15 - seed, z * 1.15 + 3, 3) - 0.5;
    const mid = fbm(x * 3.1 - seed, y * 3.1, z * 3.1 + seed, 2) - 0.5;
    return 1 + big * 0.62 + mid * 0.13;
  };

  // --- Rouille ------------------------------------------------------------------

  let rustTex = null;
  function rustTexture() {
    if (rustTex) return rustTex;
    const S = 256;
    const color = canvas(S, S), bump = canvas(S, S);
    const cc = color.getContext("2d"), bc = bump.getContext("2d");
    const ci = cc.createImageData(S, S), bi = bc.createImageData(S, S);
    const steel = [150, 152, 158], light = [176, 96, 44], dark = [84, 42, 18], mid = [132, 66, 26];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
      // Sur un tore, pour que le motif se répète sans raccord
      const nx = Math.cos(u) * 1.6, ny = Math.sin(u) * 1.6, nz = Math.cos(v) * 1.6, nw = Math.sin(v) * 1.6;
      const patch = fbm(nx + nz + 4, ny + nw, nz - nw + 2, 4);
      const fine = noise3(nx * 7 + nw * 3, ny * 7 + nz * 3, nz * 7);
      const amount = Math.max(0, Math.min(1, (patch - 0.3) * 4.2));
      const rustColor = fine > 0.62 ? light : fine < 0.36 ? dark : mid;
      const i = (y * S + x) * 4;
      for (let k = 0; k < 3; k++) ci.data[i + k] = steel[k] + (rustColor[k] - steel[k]) * amount;
      ci.data[i + 3] = 255;
      const h = 90 + amount * 110 + fine * 55;
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = h;
      bi.data[i + 3] = 255;
    }
    cc.putImageData(ci, 0, 0);
    bc.putImageData(bi, 0, 0);
    rustTex = { map: texture(color, { repeat: true }), bump: texture(bump, { srgb: false, repeat: true }) };
    rustTex.map.repeat.set(0.75, 0.75);
    rustTex.bump.repeat.set(0.75, 0.75);
    return rustTex;
  }

  // --- Feuille ------------------------------------------------------------------

  const inkImages = new Map();
  function loadInk(dataUrl, then) {
    if (inkImages.has(dataUrl)) {
      const img = inkImages.get(dataUrl);
      if (img.complete) then(img);
      else img.addEventListener("load", () => then(img), { once: true });
      return;
    }
    const img = new Image();
    img.addEventListener("load", () => then(img), { once: true });
    img.src = dataUrl;
    inkImages.set(dataUrl, img);
    if (inkImages.size > 8) inkImages.delete(inkImages.keys().next().value);
  }

  // Dessine le fond de la feuille (papier, lignes, texte). Sert aussi au pad de personnalisation.
  function drawPaper(c2d, W, H, paper) {
    c2d.fillStyle = "#fbf8ee";
    c2d.fillRect(0, 0, W, H);
    const step = H / 15;
    c2d.strokeStyle = "rgba(86, 130, 210, 0.3)";
    c2d.lineWidth = Math.max(1, W / 340);
    for (let y = step * 1.5; y < H; y += step) {
      c2d.beginPath();
      c2d.moveTo(0, y);
      c2d.lineTo(W, y);
      c2d.stroke();
    }
    c2d.strokeStyle = "rgba(214, 51, 108, 0.42)";
    c2d.beginPath();
    c2d.moveTo(W * 0.12, 0);
    c2d.lineTo(W * 0.12, H);
    c2d.stroke();
    const text = (paper && paper.text ? paper.text : "").trim();
    if (!text) return;
    c2d.fillStyle = (paper && paper.textColor) || "#2b2640";
    c2d.textAlign = "center";
    c2d.textBaseline = "middle";
    const maxWidth = W * 0.78;
    const font = (s) => `700 ${s}px "Segoe Print", "Bradley Hand", "Comic Sans MS", "Outfit", cursive`;
    // Cherche la plus grande taille qui rentre, avec retours à la ligne
    let size = H * 0.14;
    let lines = [];
    for (; size > H * 0.035; size *= 0.92) {
      c2d.font = font(size);
      lines = wrap(c2d, text, maxWidth);
      const tooWide = lines.some((l) => c2d.measureText(l).width > maxWidth);
      if (!tooWide && lines.length * size * 1.25 < H * 0.74) break;
    }
    c2d.font = font(size);
    const total = lines.length * size * 1.25;
    lines.forEach((line, k) => c2d.fillText(line, W * 0.54, H / 2 - total / 2 + size * 0.62 + k * size * 1.25));
  }

  function wrap(c2d, text, maxWidth) {
    const out = [];
    text.split(/\n/).forEach((para) => {
      let line = "";
      para.split(/\s+/).forEach((word) => {
        const next = line ? `${line} ${word}` : word;
        if (line && c2d.measureText(next).width > maxWidth) {
          out.push(line);
          line = word;
        } else {
          line = next;
        }
      });
      out.push(line);
    });
    return out;
  }

  function paperTexture(paper) {
    const W = 512, H = 672;
    const c = canvas(W, H);
    const c2d = c.getContext("2d");
    drawPaper(c2d, W, H, paper);
    const t = texture(c);
    if (paper && paper.ink) {
      loadInk(paper.ink, (img) => {
        c2d.drawImage(img, 0, 0, W, H);
        t.needsUpdate = true;
      });
    }
    return t;
  }

  // --- Image importée pour une arme personnalisée ---------------------------------

  const customCache = new Map();
  function customTexture(weapon) {
    const key = `${weapon.id}|${weapon.image ? weapon.image.length : 0}|${weapon.name}|${weapon.tint || ""}`;
    if (customCache.has(key)) return customCache.get(key);
    const S = 256;
    const c = canvas(S, S);
    const c2d = c.getContext("2d");
    c2d.fillStyle = weapon.tint || "#2d1b57";
    c2d.fillRect(0, 0, S, S);
    c2d.fillStyle = "#ffffff";
    c2d.font = "900 130px Outfit, sans-serif";
    c2d.textAlign = "center";
    c2d.textBaseline = "middle";
    c2d.fillText((weapon.name || "?").trim().slice(0, 1).toUpperCase(), S / 2, S / 2 + 6);
    const t = texture(c);
    if (weapon.image) {
      const img = new Image();
      img.addEventListener("load", () => {
        const r = Math.max(S / img.width, S / img.height);
        const w = img.width * r, h = img.height * r;
        c2d.fillStyle = "#ffffff";
        c2d.fillRect(0, 0, S, S);
        c2d.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        t.needsUpdate = true;
      }, { once: true });
      img.src = weapon.image;
    }
    customCache.set(key, t);
    return t;
  }

  // --- Divers -------------------------------------------------------------------

  // Point doux pour les particules
  let softTex = null;
  function softDot() {
    if (softTex) return softTex;
    const S = 64;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.75)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    softTex = new THREE.CanvasTexture(c);
    return softTex;
  }

  // Nuage pour la fumée
  let puffTex = null;
  function puff() {
    if (puffTex) return puffTex;
    const S = 96;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const id = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const n = fbm(x * 0.09, y * 0.09, 3.3, 3);
      const a = Math.max(0, 1 - d) * (0.55 + n * 0.9);
      const i = (y * S + x) * 4;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = 255;
      id.data[i + 3] = Math.min(255, a * 255);
    }
    g.putImageData(id, 0, 0);
    puffTex = new THREE.CanvasTexture(c);
    return puffTex;
  }

  // Bruit en niveaux de gris pour faire brûler la feuille
  let burnTex = null;
  function burnNoise() {
    if (burnTex) return burnTex;
    const S = 192;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const id = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // Le feu part du bas de la feuille et monte
      const n = fbm(u * 5, v * 5, 1.7, 4) * 0.5 + v * 0.55;
      const i = (y * S + x) * 4;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = Math.max(0, Math.min(255, n * 255));
      id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    burnTex = new THREE.CanvasTexture(c);
    burnTex.flipY = false;
    return burnTex;
  }

  // Le tapis : feutrine sombre, anneaux jaune et mauve, X en filigrane
  function felt() {
    const S = 1024;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
    grad.addColorStop(0, "rgba(55, 42, 92, 0.96)");
    grad.addColorStop(0.62, "rgba(30, 23, 54, 0.9)");
    grad.addColorStop(1, "rgba(14, 10, 26, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    const ring = (r, color, w) => {
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
      g.stroke();
    };
    ring(S * 0.30, "rgba(255, 214, 10, 0.5)", 5);
    ring(S * 0.325, "rgba(155, 109, 255, 0.55)", 3);
    g.save();
    g.translate(S / 2, S / 2);
    g.globalAlpha = 0.045;
    g.fillStyle = "#ffffff";
    const u = S * 0.13;
    [1, -1].forEach((sx) => {
      g.beginPath();
      g.moveTo(sx * -u, -u);
      g.lineTo(sx * (-u + u * 0.5), -u);
      g.lineTo(sx * u, u);
      g.lineTo(sx * (u - u * 0.5), u);
      g.closePath();
      g.fill();
    });
    g.restore();
    return texture(c);
  }

  return { noise3, fbm, ROCK_PATTERNS, rockTexture, rockRadius, rustTexture, drawPaper, paperTexture, customTexture, softDot, puff, burnNoise, felt };
})();
