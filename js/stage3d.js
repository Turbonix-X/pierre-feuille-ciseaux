// ===== La scène 3D : les deux mains, les armes, les combats (Three.js r128) =====

const Stage = (() => {
  let ok = false;
  let renderer, scene, camera, zone, envMap, thumbTarget, thumbScene, thumbCamera;
  let hands = [];
  let objects = [];
  let fxLights = [];
  let tweens = [];
  let sprites = [];
  let shardList = [];
  let shake = 0;
  let speed = 1;
  let boost = 1;
  let time = 0;
  let last = 0;
  let handStyle = "gesture";
  let handSpread = 3.9;
  let cosmetics = [null, null];
  let weaponSet = null;
  let visible = true;
  let thinking = false;
  const hooks = { beat() {}, impact() {}, fight() {} };

  const PI = Math.PI;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  const Ease = {
    linear: (k) => k,
    out: (k) => 1 - Math.pow(1 - k, 3),
    in: (k) => k * k * k,
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    back: (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
    bounce: (k) => {
      const n = 7.5625, d = 2.75;
      if (k < 1 / d) return n * k * k;
      if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
      if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
      return n * (k -= 2.625 / d) * k + 0.984375;
    },
  };

  // --- Le temps : tout passe par ces animations, pour que la vitesse et « passer » marchent partout ---

  // Si la partie est annulée, les animations sont oubliées : la suite ne s'exécute jamais.
  const tween = (d, fn, ease = Ease.out) => new Promise((res) => {
    if (d <= 0) { if (fn) fn(1); res(); return; }
    tweens.push({ t: 0, d, fn, ease, res });
  });
  const wait = (d) => tween(d, null, Ease.linear);
  const moveTo = (g, to, d, ease = Ease.inOut, arc = 0) => {
    const from = g.position.clone();
    return tween(d, (k) => {
      g.position.lerpVectors(from, to, k);
      if (arc) g.position.y += arc * Math.sin(k * PI);
    }, ease);
  };
  const scaleTo = (g, s, d, ease = Ease.out) => {
    const from = g.scale.x;
    return tween(d, (k) => g.scale.setScalar(from + (s - from) * k), ease);
  };
  const rotateTo = (g, x, y, z, d, ease = Ease.inOut) => {
    const a = g.rotation.clone();
    return tween(d, (k) => g.rotation.set(a.x + (x - a.x) * k, a.y + (y - a.y) * k, a.z + (z - a.z) * k), ease);
  };

  // --- Géométries de base -------------------------------------------------------

  function capsule(len, r0, r1, seg = 16) {
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const a = -PI / 2 + (i / 7) * (PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r0), Math.sin(a) * r0));
    }
    for (let i = 0; i <= 7; i++) {
      const a = (i / 7) * (PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r1), len + Math.sin(a) * r1));
    }
    const g = new THREE.LatheGeometry(pts, seg);
    g.rotateZ(-PI / 2);
    return g;
  }

  // --- Les mains ----------------------------------------------------------------

  // Pour chaque doigt (index, majeur, annulaire, auriculaire) : base, milieu, bout, écart. Pouce : avant, écart, milieu, bout.
  const finger = (a, b, c, spread = 0) => [a, b, c, spread];
  const curled = (s = 0) => finger(1.42, 1.72, 1.05, s);
  const POSES = {
    fist: [curled(0.03), curled(0.01), curled(-0.01), curled(-0.04), [1.0, -0.12, 0.34, 0.5]],
    open: [finger(0.05, 0.08, 0.06, 0.2), finger(0.03, 0.06, 0.05, 0.05), finger(0.05, 0.07, 0.05, -0.1), finger(0.08, 0.1, 0.07, -0.27), [0.22, 0.98, 0.12, 0.1]],
    scissors: [finger(0.02, 0.04, 0.03, 0.27), finger(0.02, 0.04, 0.03, -0.13), curled(-0.06), curled(-0.1), [1.05, -0.3, 0.3, 0.5]],
    hold: [finger(0.72, 0.85, 0.5, 0.09), finger(0.7, 0.9, 0.5, 0.02), finger(0.74, 0.92, 0.55, -0.05), finger(0.8, 0.95, 0.55, -0.13), [0.8, 0.62, 0.3, 0.3]],
    pinch: [finger(0.62, 0.72, 0.55, 0.1), finger(0.86, 1.05, 0.7, 0), finger(1.05, 1.25, 0.8, -0.05), finger(1.18, 1.32, 0.9, -0.1), [0.95, 0.46, 0.25, 0.2]],
    fire: [finger(0.42, 0.75, 0.42, 0.24), finger(0.38, 0.72, 0.42, 0.07), finger(0.42, 0.76, 0.42, -0.11), finger(0.46, 0.8, 0.46, -0.28), [0.5, 0.85, 0.3, 0.3]],
    water: [finger(0.34, 0.42, 0.26, 0.06), finger(0.3, 0.4, 0.26, 0.01), finger(0.32, 0.42, 0.26, -0.04), finger(0.36, 0.46, 0.3, -0.09), [0.68, 0.55, 0.25, 0.25]],
    point: [finger(0.02, 0.03, 0.03, 0.04), curled(0), curled(-0.02), curled(-0.05), [0.95, -0.05, 0.3, 0.45]],
    limp: [finger(0.5, 0.42, 0.3, 0.1), finger(0.52, 0.45, 0.3, 0.02), finger(0.56, 0.48, 0.33, -0.05), finger(0.6, 0.5, 0.35, -0.13), [0.45, 0.55, 0.3, 0.3]],
  };
  const flatPose = (p) => [].concat(...p);
  const GESTURE = { rock: "fist", paper: "open", scissors: "scissors", fire: "fire", water: "water" };

  function buildHand(side, skinHex) {
    const skin = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.6, metalness: 0, envMapIntensity: 0.38 });
    const nailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05 });
    const brand = side === 0 ? 0xffd60a : 0x9b6dff;
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x26222f, roughness: 0.82 });
    const cuffMat = new THREE.MeshStandardMaterial({ color: brand, roughness: 0.45, emissive: brand, emissiveIntensity: 0.14 });

    const mirror = new THREE.Group();
    if (side === 1) mirror.scale.x = -1;
    const root = new THREE.Group();
    const wrist = new THREE.Group();
    wrist.rotation.order = "YXZ";
    mirror.add(root);
    root.add(wrist);

    const add = (geo, mat, parent = wrist) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // La paume : une plaque arrondie, plus large aux jointures qu'au poignet
    const shape = new THREE.Shape();
    shape.moveTo(0.0, -0.27);
    shape.bezierCurveTo(0.26, -0.3, 0.6, -0.37, 0.92, -0.37);
    shape.quadraticCurveTo(1.02, -0.37, 1.02, -0.26);
    shape.lineTo(1.02, 0.28);
    shape.quadraticCurveTo(1.02, 0.38, 0.92, 0.38);
    shape.bezierCurveTo(0.62, 0.38, 0.3, 0.32, 0.0, 0.27);
    shape.closePath();
    const palmGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 6, curveSegments: 16 });
    palmGeo.translate(0, 0, -0.08);
    add(palmGeo, skin);

    // Les petits muscles de la paume
    const pad = new THREE.SphereGeometry(1, 24, 18);
    [[0.42, 0.2, 0.13, 0.4, 0.25, 0.14], [0.4, -0.2, 0.12, 0.42, 0.22, 0.12], [0.9, 0.0, 0.12, 0.16, 0.43, 0.08], [0.12, 0, 0.03, 0.26, 0.28, 0.17]].forEach(([x, y, z, sx, sy, sz]) => {
      const m = add(pad, skin);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
    });

    // Avant-bras et manche
    const fore = new THREE.CylinderGeometry(0.27, 0.42, 15, 28);
    fore.rotateZ(PI / 2);
    fore.translate(-7.46, 0, 0);
    const foreMesh = add(fore, skin);
    foreMesh.scale.z = 0.76;
    const sleeve = new THREE.CylinderGeometry(0.42, 0.56, 14, 28);
    sleeve.rotateZ(PI / 2);
    sleeve.translate(-8.1, 0, 0);
    const sleeveMesh = add(sleeve, sleeveMat);
    sleeveMesh.scale.z = 0.8;
    const cuff = new THREE.TorusGeometry(0.42, 0.075, 12, 36);
    cuff.rotateY(PI / 2);
    const cuffMesh = add(cuff, cuffMat);
    cuffMesh.position.x = -1.13;
    cuffMesh.scale.z = 0.8;

    // Les doigts
    const FINGERS = [
      { y: 0.35, r: 0.112, l: [0.47, 0.29, 0.22] },
      { y: 0.12, r: 0.118, l: [0.52, 0.33, 0.24] },
      { y: -0.12, r: 0.11, l: [0.48, 0.31, 0.22] },
      { y: -0.35, r: 0.094, l: [0.37, 0.22, 0.18] },
    ];
    const nailGeo = new THREE.SphereGeometry(1, 14, 10);
    function makeFinger({ y, r, l }, baseX = 1.0, baseZ = 0.02) {
      const base = new THREE.Group();
      base.rotation.order = "ZYX";
      base.position.set(baseX, y, baseZ);
      wrist.add(base);
      add(capsule(l[0], r * 1.06, r * 0.98), skin, base);
      const pip = new THREE.Group();
      pip.position.x = l[0];
      base.add(pip);
      add(capsule(l[1], r * 0.98, r * 0.9), skin, pip);
      const dip = new THREE.Group();
      dip.position.x = l[1];
      pip.add(dip);
      add(capsule(l[2], r * 0.9, r * 0.78), skin, dip);
      const nail = add(nailGeo, nailMat, dip);
      nail.position.set(l[2] * 0.68, 0, -r * 0.62);
      nail.scale.set(l[2] * 0.42, r * 0.66, r * 0.24);
      return { base, pip, dip };
    }
    const fingers = FINGERS.map((f) => makeFinger(f));

    // Le pouce
    const thumbBase = new THREE.Group();
    thumbBase.rotation.order = "ZYX";
    thumbBase.position.set(0.26, 0.34, 0.1);
    wrist.add(thumbBase);
    add(capsule(0.4, 0.15, 0.125), skin, thumbBase);
    const thumbMid = new THREE.Group();
    thumbMid.position.x = 0.4;
    thumbBase.add(thumbMid);
    add(capsule(0.3, 0.122, 0.112), skin, thumbMid);
    const thumbTip = new THREE.Group();
    thumbTip.position.x = 0.3;
    thumbMid.add(thumbTip);
    add(capsule(0.24, 0.112, 0.095), skin, thumbTip);
    const thumbNail = add(nailGeo, nailMat, thumbTip);
    thumbNail.position.set(0.17, 0, -0.08);
    thumbNail.scale.set(0.105, 0.078, 0.03);

    const pose = flatPose(POSES.fist);
    return {
      side, mirror, root, wrist, fingers, thumb: { base: thumbBase, mid: thumbMid, tip: thumbTip },
      skin, nailMat, sleeveMat, cuffMat,
      pose: pose.slice(), target: pose.slice(), rate: 12,
      dx: 0, dy: 0, dz: 0, rx: 0.1, ry: 0.32, rz: 0.1, nudge: 0,
    };
  }

  function setSkin(h, hex) {
    h.skin.color.set(hex);
    h.nailMat.color.copy(h.skin.color).lerp(new THREE.Color(0xffffff), 0.62);
  }

  function applyPose(h) {
    const p = h.pose;
    h.fingers.forEach((f, i) => {
      const o = i * 4;
      f.base.rotation.set(0, -p[o], p[o + 3]);
      f.pip.rotation.y = -p[o + 1];
      f.dip.rotation.y = -p[o + 2];
    });
    h.thumb.base.rotation.set(0, -p[16], p[17]);
    h.thumb.mid.rotation.y = -p[18];
    h.thumb.tip.rotation.y = -p[19];
  }

  const setPose = (h, name, rate = 14) => {
    h.target = flatPose(POSES[name]);
    h.rate = rate;
  };

  function updateHand(h, dt, t) {
    const a = 1 - Math.exp(-h.rate * dt);
    for (let i = 0; i < h.pose.length; i++) h.pose[i] += (h.target[i] - h.pose[i]) * a;
    applyPose(h);
    const breathe = Math.sin(t * (thinking ? 5 : 1.6) + h.side * 1.1) * (thinking ? 0.05 : 0.035);
    h.root.position.set(-handSpread + h.dx, 0.12 + h.dy + breathe, h.dz);
    h.wrist.rotation.set(h.rx, h.ry, h.rz + breathe * 0.5);
  }

  const handPoint = (h, x, y, z) => {
    h.root.updateWorldMatrix(true, true);
    return h.wrist.localToWorld(V(x, y, z));
  };

  // --- Les armes ----------------------------------------------------------------

  const cos = (side) => cosmetics[side] || defaultCosmetics();
  function defaultCosmetics() {
    return {
      skin: "#e5a97c",
      rock: { color: "#454a52", pattern: "plain" },
      scissors: { color: "#e8336f", rust: false },
      paper: { text: "", textColor: "#2b2640", ink: null },
    };
  }

  function emptyWeapon(id, side) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    return { id, side, group, body, tint: "#ffffff", update() {}, dispose() {}, radius: 0.7 };
  }

  const rockGeoCache = {};
  function rockGeometry(seed) {
    if (rockGeoCache[seed]) return rockGeoCache[seed];
    const g = new THREE.SphereGeometry(1, 64, 44);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const r = (d) => d.clone().multiplyScalar(Textures.rockRadius(d.x, d.y, d.z, seed));
    for (let i = 0; i < pos.count; i++) {
      const d = V(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const p = r(d);
      pos.setXYZ(i, p.x, p.y, p.z);
      // La normale est calculée depuis la forme : aucune couture visible
      const up = Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
      const t1 = up.clone().cross(d).normalize();
      const t2 = d.clone().cross(t1).normalize();
      const a = r(d.clone().addScaledVector(t1, 0.012).normalize()).sub(p);
      const b = r(d.clone().addScaledVector(t2, 0.012).normalize()).sub(p);
      const n = a.cross(b).normalize();
      if (n.dot(d) < 0) n.negate();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    g.scale(1, 0.84, 0.94);
    rockGeoCache[seed] = g;
    return g;
  }

  function makeRock(side) {
    const w = emptyWeapon("rock", side);
    const c = cos(side).rock;
    const tex = Textures.rockTexture(c.color, c.pattern);
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 0.035, roughness: 0.86, metalness: 0.03 });
    const mesh = new THREE.Mesh(rockGeometry(side === 0 ? 3.1 : 7.7), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.setScalar(0.72);
    w.body.add(mesh);
    w.mesh = mesh;
    w.mat = mat;
    w.tint = c.color;
    w.dispose = () => mat.dispose();
    return w;
  }

  function makeScissors(side) {
    const w = emptyWeapon("scissors", side);
    const c = cos(side).scissors;
    let steel;
    if (c.rust) {
      const tex = Textures.rustTexture();
      steel = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 0.02, metalness: 0.42, roughness: 0.72 });
    } else {
      steel = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.7 });
    }
    const handle = new THREE.MeshStandardMaterial({ color: c.color, roughness: c.rust ? 0.62 : 0.32, metalness: 0.08 });
    const screwMat = new THREE.MeshStandardMaterial({ color: c.rust ? 0x7c4a21 : 0xffd60a, metalness: 1, roughness: 0.3 });

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.06, -0.07);
    bladeShape.lineTo(1.5, -0.02);
    bladeShape.quadraticCurveTo(1.56, 0.0, 1.5, 0.018);
    bladeShape.quadraticCurveTo(0.9, 0.12, 0.3, 0.11);
    bladeShape.lineTo(-0.06, 0.08);
    bladeShape.closePath();
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });

    const armShape = new THREE.Shape();
    armShape.moveTo(0.02, -0.075);
    armShape.lineTo(-0.72, -0.2);
    armShape.lineTo(-0.72, -0.1);
    armShape.lineTo(0.02, 0.07);
    armShape.closePath();
    const armGeo = new THREE.ExtrudeGeometry(armShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.022, bevelSegments: 3 });

    function half(flip) {
      const g = new THREE.Group();
      const inner = new THREE.Group();
      if (flip) inner.scale.y = -1;
      g.add(inner);
      const blade = new THREE.Mesh(bladeGeo, steel);
      const arm = new THREE.Mesh(armGeo, handle);
      arm.position.z = -0.012;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.062, 14, 40), handle);
      ring.position.set(-0.93, -0.27, 0.012);
      ring.scale.set(1.25, 1, 1);
      [blade, arm, ring].forEach((m) => { m.castShadow = true; inner.add(m); });
      g.position.z = flip ? -0.03 : 0.03;
      return g;
    }
    const a = half(false), b = half(true);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 20), screwMat);
    screw.rotation.x = PI / 2;
    w.body.add(a, b, screw);
    w.body.scale.setScalar(0.88);
    w.open = 0;
    w.setOpen = (v) => {
      w.open = v;
      a.rotation.z = v / 2;
      b.rotation.z = -v / 2;
    };
    w.halves = [a, b];
    w.steel = steel;
    w.handle = handle;
    w.tint = "#c9ccd4";
    w.setOpen(0.1);
    if (side === 1) w.body.rotation.y = PI;
    w.dispose = () => {
      steel.dispose(); handle.dispose(); screwMat.dispose(); bladeGeo.dispose(); armGeo.dispose();
    };
    return w;
  }

  function addDissolve(mat, uniform) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDis = uniform;
      sh.uniforms.uNoise = { value: Textures.burnNoise() };
      sh.fragmentShader = "uniform float uDis;\nuniform sampler2D uNoise;\n" + sh.fragmentShader
        .replace("#include <map_fragment>", `#include <map_fragment>
          float dn = texture2D(uNoise, vec2(vUv.x, 1.0 - vUv.y)).r;
          if (uDis > 0.001 && dn < uDis) discard;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.04, 0.03), step(0.001, uDis) * smoothstep(uDis + 0.1, uDis + 0.02, dn));`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(3.4, 1.3, 0.25) * step(0.001, uDis) * smoothstep(uDis + 0.03, uDis, dn);`);
    };
  }

  function makePaper(side) {
    const w = emptyWeapon("paper", side);
    const W = 1.36, H = 1.78;
    const tex = Textures.paperTexture(cos(side).paper);
    w.burn = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.84, metalness: 0, side: THREE.DoubleSide });
    addDissolve(mat, w.burn);
    w.mat = mat;
    w.params = { wave: 1, curl: 0, wrap: 0, wrapR: 0.8, cut: 0, gap: 0.62, soak: 0 };
    const parts = [0, 1].map((k) => {
      const seg = new THREE.PlaneGeometry(W / 2, H, 12, 30);
      const pos = seg.attributes.position;
      const uv = seg.attributes.uv;
      const base = [];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + (k === 0 ? -W / 4 : W / 4);
        const y = pos.getY(i);
        base.push({ x, y, u: x / W + 0.5, v: y / H + 0.5 });
        uv.setXY(i, x / W + 0.5, y / H + 0.5);
      }
      const mesh = new THREE.Mesh(seg, mat);
      mesh.castShadow = true;
      w.body.add(mesh);
      return { mesh, base, sign: k === 0 ? -1 : 1 };
    });
    w.parts = parts;
    w.update = (dt, t) => {
      const p = w.params;
      parts.forEach((part) => {
        const pos = part.mesh.geometry.attributes.position;
        part.base.forEach((b, i) => {
          let x = b.x, y = b.y, z = 0;
          z += p.wave * (Math.sin(b.y * 2.3 + t * 2.6) * 0.045 + Math.sin(b.x * 2.6 + t * 1.9) * 0.035 + b.x * b.x * 0.05);
          if (p.curl > 0.001) {
            // Roulée autour d'un axe vertical : se déroule quand curl passe de 1 à 0
            const radius = 0.09 + (1 - p.curl) * (1 - p.curl) * 2.6;
            const a = (b.x + W / 2) / radius;
            x = -W / 2 + radius * Math.sin(a);
            z = radius * (1 - Math.cos(a));
          }
          if (p.cut > 0) {
            const g = Math.max(0, p.cut - b.v);
            x += part.sign * g * p.gap;
            z += g * g * 0.5 * part.sign;
            y -= g * 0.06;
          }
          if (p.wrap > 0.001) {
            const lon = (b.u - 0.5) * PI * 1.98, lat = (b.v - 0.5) * PI * 0.97, R = p.wrapR;
            const tx = R * Math.cos(lat) * Math.sin(lon), ty = R * Math.sin(lat), tz = R * Math.cos(lat) * Math.cos(lon);
            const crumple = Textures.noise3(b.u * 7, b.v * 7, 2.2) * 0.14 * p.wrap;
            x += (tx * (1 + crumple) - x) * p.wrap;
            y += (ty * (1 + crumple) - y) * p.wrap;
            z += (tz * (1 + crumple) - z) * p.wrap;
          }
          pos.setXYZ(i, x, y, z);
        });
        pos.needsUpdate = true;
        part.mesh.geometry.computeVertexNormals();
      });
    };
    w.update(0, 0);
    w.tint = "#f5f1e3";
    w.dispose = () => {
      tex.dispose();
      mat.dispose();
      parts.forEach((part) => part.mesh.geometry.dispose());
    };
    return w;
  }

  function makeFire(side) {
    const w = emptyWeapon("fire", side);
    w.power = 1;
    w.tint = "#ff7a18";
    const N = 54;
    const flames = [];
    const reset = (s, warm) => {
      const a = rand(PI * 2), r = rand(0.05, 0.36) * (0.6 + w.power * 0.4);
      s.p = V(Math.cos(a) * r, -0.62 + rand(0.06), Math.sin(a) * r * 0.6);
      s.v = V(-Math.cos(a) * r * 0.55, rand(1.05, 1.95), -Math.sin(a) * r * 0.25);
      s.life = rand(0.42, 0.85);
      s.age = warm ? rand(s.life) : 0;
      s.size = rand(0.34, 0.68);
    };
    for (let i = 0; i < N; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Textures.softDot(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      const s = { sprite };
      reset(s, true);
      flames.push(s);
      w.body.add(sprite);
    }
    const hot = new THREE.Color(0xffc84a), mid = new THREE.Color(0xf26a12), cool = new THREE.Color(0x9c1c08);
    w.update = (dt) => {
      flames.forEach((s) => {
        s.age += dt;
        if (s.age >= s.life) reset(s, false);
        const k = s.age / s.life;
        s.p.addScaledVector(s.v, dt * (0.55 + w.power * 0.55));
        const narrow = 1 - dt * 2.4;
        s.p.x *= narrow;
        s.p.z *= narrow;
        s.sprite.position.copy(s.p);
        s.sprite.scale.setScalar(s.size * (1 - k * 0.82) * (0.35 + w.power * 0.8));
        const c = s.sprite.material.color;
        if (k < 0.35) c.copy(hot).lerp(mid, k / 0.35);
        else c.copy(mid).lerp(cool, (k - 0.35) / 0.65);
        s.sprite.material.opacity = Math.min(1, k * 7) * (1 - k) * 0.74 * clamp01(w.power * 1.6);
      });
    };
    for (let i = 0; i < 40; i++) w.update(0.02);
    w.dispose = () => flames.forEach((s) => s.sprite.material.dispose());
    return w;
  }

  function makeWater(side) {
    const w = emptyWeapon("water", side);
    w.tint = "#38bdf8";
    w.power = 1;
    const geo = new THREE.IcosahedronGeometry(1, 5);
    const base = geo.attributes.position.array.slice();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0f7fe0, metalness: 0.05, roughness: 0.06, transparent: true, opacity: 0.86, emissive: 0x0a4a8c, emissiveIntensity: 0.4, envMapIntensity: 0.55 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.scale.setScalar(0.74);
    w.body.add(mesh);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    glint.position.set(-0.26, 0.3, 0.55);
    glint.scale.set(1, 0.6, 0.4);
    w.body.add(glint);
    w.mesh = mesh;
    w.mat = mat;
    w.update = (dt, t) => {
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const wob = 1 + Math.sin(x * 3.1 + t * 3.3) * 0.045 + Math.sin(y * 3.7 + t * 2.7) * 0.05 + Math.sin(z * 2.9 + t * 3.9) * 0.04;
        pos.setXYZ(i, x * wob, y * wob * (1 + Math.sin(t * 2) * 0.03), z * wob);
        // Sur une sphère, la normale suit le rayon : la surface reste lisse, sans facettes
        nor.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
    };
    w.update(0, 0);
    w.dispose = () => { geo.dispose(); mat.dispose(); };
    return w;
  }

  function makeCustom(id, side) {
    const w = emptyWeapon(id, side);
    const data = weaponSet ? weaponSet.weapons[id] : null;
    w.tint = (data && data.tint) || "#9b6dff";
    const face = new THREE.MeshStandardMaterial({ map: Textures.customTexture(data || { id, name: "?" }), roughness: 0.5, metalness: 0.03 });
    const rimMat = new THREE.MeshStandardMaterial({ color: side === 0 ? 0xffd60a : 0x9b6dff, metalness: 0.9, roughness: 0.3 });
    const front = new THREE.Mesh(new THREE.CircleGeometry(0.76, 56), face);
    front.position.z = 0.08;
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.76, 56), face);
    back.position.z = -0.08;
    back.rotation.y = PI;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.085, 16, 64), rimMat);
    const side3d = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.77, 0.16, 56, 1, true), rimMat);
    side3d.rotation.x = PI / 2;
    [front, back, rim, side3d].forEach((m) => { m.castShadow = true; w.body.add(m); });
    w.update = (dt, t) => { w.body.rotation.y = Math.sin(t * 1.6) * 0.28; };
    w.dispose = () => { face.dispose(); rimMat.dispose(); };
    return w;
  }

  function makeWeapon(id, side) {
    if (id === "rock") return makeRock(side);
    if (id === "paper") return makePaper(side);
    if (id === "scissors") return makeScissors(side);
    if (id === "fire") return makeFire(side);
    if (id === "water") return makeWater(side);
    return makeCustom(id, side);
  }

  function spawn(id, side) {
    const w = makeWeapon(id, side);
    scene.add(w.group);
    objects.push(w);
    return w;
  }

  // Libère la mémoire 3D d'une arme (la forme de la pierre est gardée pour la prochaine fois)
  function releaseWeapon(w) {
    w.dispose();
    if (w.id !== "rock") w.body.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  function removeWeapon(w) {
    scene.remove(w.group);
    releaseWeapon(w);
    objects = objects.filter((o) => o !== w);
    if (w.id === "fire") fxLights[w.side].intensity = 0;
  }

  // --- Particules ---------------------------------------------------------------

  function freeSprite() {
    return sprites.find((s) => s.life <= 0) || sprites[0];
  }

  function particle(pos, vel, { color = 0xffffff, size = 0.12, life = 0.6, gravity = 0, drag = 0, additive = true, grow = 0, opacity = 1, puff = false }) {
    const s = freeSprite();
    s.pos.copy(pos);
    s.vel.copy(vel);
    s.age = 0;
    s.life = life;
    s.gravity = gravity;
    s.drag = drag;
    s.size = size;
    s.grow = grow;
    s.opacity = opacity;
    const m = s.sprite.material;
    m.map = puff ? Textures.puff() : Textures.softDot();
    m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.set(color);
    m.needsUpdate = true;
    s.sprite.visible = true;
  }

  function burstParticles(pos, n, opt = {}) {
    const { speed: sp = 3, up = 0, spread = 1, colors = [0xffd60a, 0x9b6dff, 0xffffff], flat = 0.6 } = opt;
    for (let i = 0; i < n; i++) {
      const a = rand(PI * 2), e = rand(-1, 1);
      const r = Math.sqrt(Math.max(0, 1 - e * e));
      const s = sp * rand(0.3, 1);
      particle(pos, V(Math.cos(a) * r * s * spread, e * s + up, Math.sin(a) * r * s * flat), {
        color: colors[i % colors.length],
        size: opt.size || rand(0.08, 0.2),
        life: opt.life ? opt.life * rand(0.6, 1.2) : rand(0.35, 0.8),
        gravity: opt.gravity === undefined ? 4.5 : opt.gravity,
        drag: opt.drag || 0.6,
        additive: opt.additive !== false,
      });
    }
  }

  function smoke(pos, n = 8, color = 0x8a8894, size = 0.7) {
    for (let i = 0; i < n; i++) {
      particle(pos.clone().add(V(rand(-0.3, 0.3), rand(-0.1, 0.2), rand(-0.1, 0.2))), V(rand(-0.25, 0.25), rand(0.45, 1.05), rand(-0.1, 0.1)), {
        color, size: size * rand(0.5, 1), grow: 1.5, life: rand(0.8, 1.5), gravity: 0, additive: false, puff: true, opacity: 0.5,
      });
    }
  }

  // Morceaux en 3D (pierre brisée, papier déchiré, métal…)
  function shards(pos, n, { geo, mat, speed: sp = 3.5, scale = [0.5, 1], gravity = 9, life = 1.2, floor = -1.25, up = 1.2 }) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.position.copy(pos).add(V(rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.12, 0.12)));
      m.scale.setScalar(rand(scale[0], scale[1]));
      m.rotation.set(rand(6), rand(6), rand(6));
      scene.add(m);
      const a = rand(PI * 2);
      const s = sp * rand(0.3, 1);
      shardList.push({
        m,
        vel: V(Math.cos(a) * s, Math.abs(Math.sin(a)) * s * 0.7 + up, rand(-1.1, 1.1)),
        spin: V(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
        gravity, life, age: 0, floor, baseScale: m.scale.x,
      });
    }
  }

  function updateFx(dt) {
    sprites.forEach((s) => {
      if (s.life <= 0) return;
      s.age += dt;
      const k = s.age / s.life;
      if (k >= 1) {
        s.life = 0;
        s.sprite.visible = false;
        return;
      }
      s.vel.y -= s.gravity * dt;
      s.vel.multiplyScalar(Math.max(0, 1 - s.drag * dt));
      s.pos.addScaledVector(s.vel, dt);
      s.sprite.position.copy(s.pos);
      s.sprite.scale.setScalar(s.size * (1 + s.grow * k) * (s.grow ? 1 : 1 - k * 0.7));
      s.sprite.material.opacity = s.opacity * (s.grow ? Math.min(1, k * 5) * (1 - k) : 1 - k * k);
    });
    shardList = shardList.filter((d) => {
      d.age += dt;
      d.vel.y -= d.gravity * dt;
      d.m.position.addScaledVector(d.vel, dt);
      d.m.rotation.x += d.spin.x * dt;
      d.m.rotation.y += d.spin.y * dt;
      d.m.rotation.z += d.spin.z * dt;
      if (d.m.position.y < d.floor) {
        d.m.position.y = d.floor;
        d.vel.y *= -0.34;
        d.vel.x *= 0.6;
        d.vel.z *= 0.6;
        d.spin.multiplyScalar(0.45);
      }
      const k = d.age / d.life;
      if (k > 0.72) d.m.scale.setScalar(d.baseScale * Math.max(0.001, (1 - k) / 0.28));
      if (k >= 1) {
        scene.remove(d.m);
        return false;
      }
      return true;
    });
  }

  const impact = (strength = 1) => {
    shake = Math.max(shake, 0.11 * strength);
    hooks.impact(strength);
    Haptics.buzz(Math.round(16 + strength * 18));
  };

  // --- Morceaux réutilisés --------------------------------------------------------

  let stoneChip, paperBit, metalBit;
  const chipGeo = () => stoneChip || (stoneChip = new THREE.DodecahedronGeometry(0.15, 0));
  const bitGeo = () => paperBit || (paperBit = new THREE.PlaneGeometry(0.16, 0.13));
  const metalGeo = () => metalBit || (metalBit = new THREE.BoxGeometry(0.2, 0.03, 0.05));
  let paperMat;
  const paperBitMat = () => paperMat || (paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f1e3, side: THREE.DoubleSide, roughness: 0.9 }));

  // --- Les combats ----------------------------------------------------------------

  const CENTER = () => V(0, 0.82, 0.55);
  const fightPos = (side) => V(side === 0 ? -1.75 : 1.75, 0.82, 0.55);

  async function fightScissorsPaper(sc, pa) {
    const c = CENTER();
    pa.params.wave = 0.5;
    await Promise.all([
      moveTo(pa.group, c.clone().add(V(0, 0.12, 0)), 0.26),
      rotateTo(pa.group, 0, 0, 0, 0.26),
      moveTo(sc.group, c.clone().add(V(0, -1.9, 0.26)), 0.3),
      rotateTo(sc.group, 0, 0, PI / 2, 0.3),
    ]);
    if (sc.side === 1) sc.body.rotation.y = 0;
    await tween(0.1, (k) => sc.setOpen(0.1 + k * 0.72));
    const snips = 4;
    for (let i = 0; i < snips; i++) {
      Sound.snip();
      Sound.rip(0.15);
      const fromY = sc.group.position.y;
      const fromCut = pa.params.cut;
      await tween(0.11, (k) => {
        sc.setOpen(0.82 - k * 0.74);
        sc.group.position.y = fromY + k * 0.5;
        pa.params.cut = fromCut + k * 0.25;
      }, Ease.in);
      burstParticles(sc.group.position.clone().add(V(0, 1.1, 0.1)), 5, { colors: [0xf5f1e3, 0xffffff], additive: false, speed: 1.8, size: 0.1, life: 0.5, gravity: 5 });
      shards(sc.group.position.clone().add(V(0, 1.05, 0.05)), 3, { geo: bitGeo(), mat: paperBitMat(), speed: 1.6, gravity: 5, life: 0.9, up: 0.5 });
      if (i < snips - 1) await tween(0.07, (k) => sc.setOpen(0.08 + k * 0.74));
    }
    impact(0.55);
    // Les deux moitiés tombent chacune de leur côté
    pa.params.gap = 0.8;
    Sound.rustle(0.4);
    pa.params.wave = 1;
    const [p0, p1] = pa.parts;
    await Promise.all([
      tween(0.62, (k) => {
        pa.params.cut = 1 + k * 0.35;
        p0.mesh.position.set(-k * 0.95, -k * k * 2.3, -k * 0.3);
        p0.mesh.rotation.z = k * 0.75;
        p1.mesh.position.set(k * 0.95, -k * k * 2.3, -k * 0.3);
        p1.mesh.rotation.z = -k * 0.75;
      }, Ease.in),
      (async () => {
        await rotateTo(sc.group, 0, 0, 0, 0.3);
        if (sc.side === 1) sc.body.rotation.y = PI;
        await moveTo(sc.group, c, 0.2);
      })(),
    ]);
    removeWeapon(pa);
    Sound.snip();
    await tween(0.09, (k) => sc.setOpen(k * 0.6));
    await tween(0.09, (k) => sc.setOpen(0.6 - k * 0.5));
  }

  async function fightRockScissors(ro, sc) {
    const c = CENTER();
    const ground = V(0, -0.72, 0.55);
    await Promise.all([
      moveTo(sc.group, ground, 0.34, Ease.inOut),
      rotateTo(sc.group, 0, 0, 0, 0.34),
      moveTo(ro.group, V(0, 3.1, 0.55), 0.36, Ease.out),
      rotateTo(ro.group, 0.4, 0.6, 0.3, 0.36),
    ]);
    sc.setOpen(0.45);
    await wait(0.06);
    Sound.whoosh(0.18, 0.13);
    await Promise.all([
      moveTo(ro.group, V(0, -0.46, 0.55), 0.17, Ease.in),
      rotateTo(ro.group, 0.9, 1.1, 0.5, 0.17, Ease.in),
    ]);
    Sound.rockHit(1);
    Sound.metal(1);
    impact(1.4);
    const hitPos = V(0, -0.6, 0.6);
    burstParticles(hitPos, 26, { colors: [0xffd60a, 0xffe45c, 0xffffff, 0xff9d2e], speed: 7, up: 1, size: 0.1, life: 0.5, gravity: 9 });
    smoke(hitPos, 9, 0x8a8894, 0.8);
    shards(hitPos, 9, { geo: metalGeo(), mat: sc.steel, speed: 5.5, gravity: 11, life: 1.1, up: 1.8 });
    // Les ciseaux se cassent en deux et partent en vrille
    const [a, b] = sc.halves;
    const handlers = [a, b].map((h, i) => {
      const sign = i === 0 ? -1 : 1;
      return tween(0.68, (k) => {
        h.position.x = sign * k * 1.55;
        h.position.y = -k * 0.32 + Math.sin(k * PI) * 0.75;
        h.position.z = 0.3 * sign * k;
        h.rotation.z = sign * k * 4.1;
      }, Ease.out);
    });
    await Promise.all([
      ...handlers,
      (async () => {
        await moveTo(ro.group, V(0, 0.26, 0.55), 0.17, Ease.out);
        await moveTo(ro.group, V(0, -0.32, 0.55), 0.14, Ease.in);
        Sound.rockHit(0.42);
        impact(0.35);
        await moveTo(ro.group, c, 0.3, Ease.back);
      })(),
    ]);
    await tween(0.14, (k) => sc.group.scale.setScalar(1 - k));
    removeWeapon(sc);
  }

  async function fightPaperRock(pa, ro) {
    const c = CENTER();
    await Promise.all([
      moveTo(ro.group, c, 0.3),
      moveTo(pa.group, c.clone().add(V(0, 1.2, 0.5)), 0.3),
      rotateTo(pa.group, 0, 0, 0, 0.3),
    ]);
    Sound.whoosh(0.3, 0.09);
    Sound.rustle(0.55);
    pa.params.wrapR = 0.92;
    pa.params.wave = 0;
    await Promise.all([
      moveTo(pa.group, c, 0.4, Ease.inOut),
      tween(0.56, (k) => { pa.params.wrap = k; }, Ease.inOut),
    ]);
    Sound.clash();
    impact(0.6);
    ro.group.visible = false;
    // La boule de papier serre, serre, et la pierre disparaît dedans
    for (let i = 0; i < 3; i++) {
      Sound.rustle(0.14);
      await tween(0.13, (k) => pa.group.scale.setScalar(1 - Math.sin(k * PI) * (0.1 + i * 0.05)));
    }
    await tween(0.25, (k) => { pa.params.wrapR = 0.92 - k * 0.2; }, Ease.in);
    Sound.rockHit(0.5);
    removeWeapon(ro);
    // Elle s'ouvre : la pierre n'est plus que du sable
    const rockTint = new THREE.Color(ro.tint).getHex();
    burstParticles(c.clone().add(V(0, -0.2, 0)), 34, { colors: [rockTint, 0x8a8894, 0x5a5a62], additive: false, speed: 2.3, size: 0.09, gravity: 9, life: 0.9 });
    Sound.rustle(0.4);
    await tween(0.46, (k) => { pa.params.wrap = 1 - k; pa.params.wave = k; }, Ease.inOut);
  }

  async function fightFirePaper(fi, pa) {
    const c = CENTER();
    pa.params.wave = 0.7;
    await Promise.all([
      moveTo(pa.group, c.clone().add(V(0, 0.42, 0)), 0.28),
      rotateTo(pa.group, 0, 0, 0, 0.28),
      moveTo(fi.group, c.clone().add(V(0, -1.2, 0.08)), 0.34),
    ]);
    Sound.ignite();
    await tween(0.18, (k) => { fi.power = 1 + k * 0.5; });
    Sound.burn(1.3);
    const top = pa.group.position.clone();
    let acc = 0;
    await tween(1.25, (k) => {
      pa.burn.value = 0.001 + k * 1.05;
      pa.params.wave = 0.7 + k * 1.3;
      fi.group.position.y = c.y - 1.2 + k * 0.82;
      acc += 1;
      if (acc % 2 === 0) {
        const edge = top.clone().add(V(rand(-0.66, 0.66), -0.9 + k * 1.75, 0.04));
        particle(edge, V(rand(-0.3, 0.3), rand(1.2, 2.5), rand(-0.1, 0.1)), { color: [0xff9d2e, 0xffd60a, 0xff5a1e][acc % 3], size: rand(0.05, 0.11), life: rand(0.4, 0.9), gravity: -0.5 });
      }
      if (acc % 6 === 0) smoke(top.clone().add(V(rand(-0.5, 0.5), -0.6 + k * 1.5, -0.1)), 1, 0x4c4a52, 0.75);
    }, Ease.linear);
    removeWeapon(pa);
    smoke(top, 7, 0x3a3840, 0.9);
    await Promise.all([
      moveTo(fi.group, c, 0.25),
      tween(0.25, (k) => { fi.power = 1.5 - k * 0.5; }),
    ]);
    impact(0.3);
  }

  async function fightWaterFire(wa, fi) {
    const c = CENTER();
    await Promise.all([
      moveTo(fi.group, V(0, 0.12, 0.55), 0.3),
      moveTo(wa.group, V(0, 2.55, 0.55), 0.38, Ease.out),
    ]);
    Sound.splash(0.7);
    // La goutte éclate et pleut sur le feu
    const from = wa.group.position.clone();
    const drops = tween(0.95, () => {
      for (let i = 0; i < 4; i++) {
        particle(from.clone().add(V(rand(-0.65, 0.65), rand(-0.3, 0.1), rand(-0.2, 0.2))), V(rand(-0.25, 0.25), rand(-5, -3.2), 0), { color: 0x4ab8ff, size: rand(0.12, 0.22), life: 0.48, gravity: 6, additive: false });
      }
    }, Ease.linear);
    const shrink = scaleTo(wa.group, 0.72, 0.5);
    await wait(0.26);
    Sound.sizzle(1);
    let acc = 0;
    await tween(0.9, (k) => {
      fi.power = 1 - k;
      acc += 1;
      if (acc % 3 === 0) smoke(fi.group.position.clone().add(V(rand(-0.3, 0.3), 0.2, 0)), 1, 0xdfe3ea, 0.95);
    }, Ease.inOut);
    await Promise.all([drops, shrink]);
    removeWeapon(fi);
    smoke(V(0, 0.2, 0.55), 12, 0xeef0f4, 1.1);
    impact(0.3);
    await Promise.all([
      moveTo(wa.group, c, 0.36, Ease.inOut),
      scaleTo(wa.group, 1, 0.36, Ease.back),
    ]);
    Sound.bubble(3);
  }

  async function fightWaterScissors(wa, sc) {
    const c = CENTER();
    await Promise.all([
      moveTo(sc.group, c, 0.3),
      moveTo(wa.group, c.clone().add(V(0, 0.05, 0)), 0.42, Ease.inOut, 0.65),
    ]);
    Sound.splash(0.6);
    await scaleTo(wa.group, 1.85, 0.25, Ease.back);
    Sound.bubble(9);
    Sound.creak();
    // Les ciseaux rouillent à vue d'œil dans l'eau
    const rust = new THREE.Color(0x8c4f22);
    const wasSteel = sc.steel.color.clone();
    let acc = 0;
    await tween(0.92, (k) => {
      sc.steel.color.copy(wasSteel).lerp(rust, k);
      sc.steel.metalness = 1 - k * 0.72;
      sc.steel.roughness = 0.2 + k * 0.62;
      sc.setOpen(0.1 + Math.sin(k * 16) * 0.14 * (1 - k));
      acc += 1;
      if (acc % 3 === 0) particle(c.clone().add(V(rand(-0.5, 0.5), rand(-0.5, 0.3), 0.3)), V(0, rand(0.6, 1.3), 0), { color: 0xbfe6ff, size: rand(0.05, 0.1), life: 0.6, gravity: -1 });
    }, Ease.linear);
    Sound.creak();
    Sound.metal(0.4);
    // Ils tombent en morceaux
    const flake = new THREE.MeshStandardMaterial({ color: 0x8c4f22, roughness: 0.9 });
    const [a, b] = sc.halves;
    shards(c, 12, { geo: metalGeo(), mat: flake, speed: 2, gravity: 8, life: 1.1, up: 0.2 });
    await Promise.all([
      scaleTo(wa.group, 1, 0.4, Ease.back),
      tween(0.6, (k) => {
        a.position.set(-k * 0.45, -k * k * 2.1, 0);
        a.rotation.z = -k * 1.5;
        b.position.set(k * 0.45, -k * k * 2.1, 0);
        b.rotation.z = k * 1.5;
      }, Ease.in),
    ]);
    impact(0.5);
    Sound.metal(0.5);
    removeWeapon(sc);
  }

  async function fightPaperWater(pa, wa) {
    const c = CENTER();
    pa.params.wave = 0.6;
    await Promise.all([
      moveTo(wa.group, c.clone().add(V(0, -0.88, 0)), 0.3),
      moveTo(pa.group, c.clone().add(V(0, 0.64, -0.02)), 0.3),
      rotateTo(pa.group, -0.2, 0, 0, 0.3),
    ]);
    Sound.bubble(9);
    Sound.rustle(0.6);
    // L'eau remonte dans la feuille, qui devient mouillée
    const wet = new THREE.Color(0x9ec7e6);
    let acc = 0;
    await tween(1, (k) => {
      wa.group.scale.setScalar(1 - k * 0.97);
      wa.group.position.y = c.y - 0.88 + k * 0.72;
      pa.mat.color.setRGB(1, 1, 1).lerp(wet, k);
      pa.mat.roughness = 0.84 - k * 0.3;
      pa.params.wave = 0.6 + Math.sin(k * PI) * 1.4;
      acc += 1;
      if (acc % 2 === 0) {
        const at = wa.group.position.clone().add(V(rand(-0.3, 0.3), rand(0, 0.25), 0.1));
        particle(at, V(rand(-0.15, 0.15), rand(1.6, 3), 0), { color: 0x5cc6ff, size: rand(0.06, 0.12), life: 0.38, gravity: 0, additive: false });
      }
    }, Ease.inOut);
    removeWeapon(wa);
    impact(0.3);
    await Promise.all([
      moveTo(pa.group, c, 0.3, Ease.back),
      rotateTo(pa.group, 0, 0, 0, 0.3),
    ]);
  }

  async function fightRockWater(ro, wa) {
    const c = CENTER();
    await Promise.all([
      moveTo(wa.group, V(0, -0.45, 0.55), 0.32),
      moveTo(ro.group, V(0, 3, 0.55), 0.4, Ease.out),
      rotateTo(ro.group, 0.3, 0.5, 0.3, 0.4),
    ]);
    await wait(0.05);
    Sound.whoosh(0.16, 0.12);
    await moveTo(ro.group, V(0, -0.2, 0.55), 0.17, Ease.in);
    Sound.splash(1.3);
    Sound.rockHit(0.55);
    impact(1);
    const at = V(0, -0.5, 0.55);
    burstParticles(at, 46, { colors: [0x5cc6ff, 0x9bdcff, 0xffffff, 0x2aa8ee], speed: 6, up: 3.2, size: 0.14, gravity: 12, life: 0.85, additive: false, flat: 1 });
    await Promise.all([
      tween(0.28, (k) => {
        wa.group.scale.set(1 + k * 1.7, Math.max(0.02, 1 - k), 1 + k * 1.7);
        wa.mat.opacity = 0.82 * (1 - k);
      }),
      (async () => {
        await moveTo(ro.group, V(0, 0.6, 0.55), 0.2, Ease.out);
        await moveTo(ro.group, V(0, -0.2, 0.55), 0.16, Ease.in);
        Sound.rockHit(0.3);
        await moveTo(ro.group, c, 0.26, Ease.back);
      })(),
    ]);
    removeWeapon(wa);
  }

  function shatter(w) {
    const pos = w.group.position.clone();
    const color = new THREE.Color(w.tint);
    if (w.id === "fire") {
      smoke(pos, 12, 0x4c4a52, 1);
      burstParticles(pos, 28, { colors: [0xff9d2e, 0xffd60a, 0xc9280e], speed: 4, gravity: 3 });
    } else if (w.id === "water") {
      burstParticles(pos, 36, { colors: [0x5cc6ff, 0x9bdcff, 0xffffff], additive: false, speed: 5, size: 0.13, gravity: 10 });
      Sound.splash(0.8);
    } else if (w.id === "paper") {
      shards(pos, 22, { geo: bitGeo(), mat: paperBitMat(), speed: 3.4, gravity: 4.5, life: 1.3 });
    } else {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: w.id === "scissors" ? 0.7 : 0.05 });
      shards(pos, 18, { geo: w.id === "scissors" ? metalGeo() : chipGeo(), mat, speed: 5, gravity: 10, life: 1.25 });
    }
    burstParticles(pos, 22, { speed: 5.5, size: 0.11, gravity: 3 });
    removeWeapon(w);
  }

  // Pour tout le reste, et pour les armes importées : le gagnant fonce et le perdant vole en éclats
  async function fightGeneric(wi, lo) {
    const c = CENTER();
    const sign = wi.side === 0 ? -1 : 1;
    await Promise.all([
      moveTo(lo.group, c.clone().add(V(-sign * 0.75, 0, 0)), 0.3),
      moveTo(wi.group, c.clone().add(V(sign * 2.65, 0.3, 0)), 0.36, Ease.out),
      rotateTo(wi.group, 0, 0, sign * 0.26, 0.36),
    ]);
    Sound.whoosh(0.16, 0.14);
    await Promise.all([
      moveTo(wi.group, c.clone().add(V(-sign * 0.4, 0, 0)), 0.15, Ease.in),
      rotateTo(wi.group, 0, 0, 0, 0.15),
    ]);
    Sound.boom();
    impact(1.2);
    shatter(lo);
    await moveTo(wi.group, c, 0.36, Ease.back);
  }

  // Aucun gagnant : les deux armes se heurtent et rebondissent
  async function fightClash(a, b) {
    const c = CENTER();
    await Promise.all([
      moveTo(a.group, c.clone().add(V(-2.4, 0.18, 0)), 0.2, Ease.out),
      moveTo(b.group, c.clone().add(V(2.4, 0.18, 0)), 0.2, Ease.out),
    ]);
    Sound.whoosh(0.13, 0.1);
    await Promise.all([
      moveTo(a.group, c.clone().add(V(-0.62, 0, 0)), 0.14, Ease.in),
      moveTo(b.group, c.clone().add(V(0.62, 0, 0)), 0.14, Ease.in),
    ]);
    Sound.clash();
    if (a.id === "scissors" || b.id === "scissors") Sound.metal(0.6);
    if (a.id === "rock" || b.id === "rock") Sound.rockHit(0.35);
    if (a.id === "water" || b.id === "water") Sound.splash(0.35);
    impact(0.8);
    burstParticles(c, 24, { colors: [0xffffff, 0xffd60a, 0xc9b0ff], speed: 5.5, size: 0.11 });
    await Promise.all([
      moveTo(a.group, fightPos(0), 0.42, Ease.back, 0.2),
      moveTo(b.group, fightPos(1), 0.42, Ease.back, 0.2),
    ]);
  }

  // Miroir : même coup
  async function fightMirrorSame(a, b) {
    const c = CENTER();
    Sound.sparkle();
    await tween(0.85, (k) => {
      const ang = k * PI * 2.4;
      const r = 1.75 * (1 - k * 0.72);
      a.group.position.set(c.x - Math.cos(ang) * r, c.y + Math.sin(ang) * r * 0.32, c.z + Math.sin(ang) * r * 0.4);
      b.group.position.set(c.x + Math.cos(ang) * r, c.y - Math.sin(ang) * r * 0.32, c.z - Math.sin(ang) * r * 0.4);
      if (Math.random() < 0.5) particle(a.group.position, V(rand(-1, 1), rand(-1, 1), 0), { color: 0xffd60a, size: 0.09, life: 0.5, gravity: 0 });
      if (Math.random() < 0.5) particle(b.group.position, V(rand(-1, 1), rand(-1, 1), 0), { color: 0x9b6dff, size: 0.09, life: 0.5, gravity: 0 });
    }, Ease.inOut);
    Sound.sparkle();
    impact(0.6);
    burstParticles(c, 40, { speed: 5, gravity: 2, size: 0.12 });
  }

  // Miroir : coups différents, les deux armes se ratent
  async function fightMirrorMiss(a, b) {
    const pa = fightPos(0), pb = fightPos(1);
    Sound.whoosh(0.3, 0.1);
    await Promise.all([
      moveTo(a.group, pb, 0.4, Ease.inOut, 0.55),
      moveTo(b.group, pa, 0.4, Ease.inOut, -0.5),
    ]);
    Sound.whoosh(0.3, 0.1);
    await Promise.all([
      moveTo(a.group, pa, 0.4, Ease.inOut, -0.3),
      moveTo(b.group, pb, 0.4, Ease.inOut, 0.3),
    ]);
  }

  // Une seule arme : l'autre joueur n'a pas joué à temps
  async function fightLate(w, lateHand) {
    const c = handPoint(lateHand, 0.8, 0, 0.3);
    await moveTo(w.group, c, 0.3, Ease.in, 0.6);
    Sound.boom();
    impact(1);
    burstParticles(c, 26, { speed: 5, size: 0.11 });
    await Promise.all([
      moveTo(w.group, CENTER(), 0.42, Ease.back),
      tween(0.4, (k) => { lateHand.rz = 0.1 - k * 0.6; lateHand.dy = -k * 0.4; }),
    ]);
  }

  const FIGHTS = {
    "scissors>paper": fightScissorsPaper,
    "rock>scissors": fightRockScissors,
    "paper>rock": fightPaperRock,
    "fire>paper": fightFirePaper,
    "water>fire": fightWaterFire,
    "water>scissors": fightWaterScissors,
    "paper>water": fightPaperWater,
    "rock>water": fightRockWater,
  };

  // --- Le déroulement d'une manche ----------------------------------------------

  async function chant() {
    for (let i = 0; i < 3; i++) {
      hooks.beat(i);
      Sound.beat(i);
      await tween(0.19, (k) => hands.forEach((h) => {
        h.dy = k * 0.72;
        h.rz = 0.1 + k * 0.42;
      }), Ease.out);
      await tween(0.14, (k) => hands.forEach((h) => {
        h.dy = 0.72 - k * 0.72;
        h.rz = 0.52 - k * 0.48;
      }), Ease.in);
      shake = Math.max(shake, 0.03);
    }
    hooks.beat(3);
  }

  // Place où apparaît l'arme, selon la façon dont la main la tient
  const HOLD = {
    rock: { pose: "hold", at: [1.42, 0.05, 0.95] },
    paper: { pose: "pinch", at: [1.75, 0.92, 0.62] },
    scissors: { pose: "hold", at: [1.72, 0.06, 0.82] },
    fire: { pose: "fire", at: [1.5, 0.42, 0.9] },
    water: { pose: "water", at: [1.5, 0.5, 0.9] },
    custom: { pose: "hold", at: [1.55, 0.18, 0.95] },
  };

  async function revealObject(h, id) {
    const info = HOLD[id] || HOLD.custom;
    setPose(h, info.pose, 16);
    const palm = handPoint(h, 0.72, 0.05, 0.3);
    const w = spawn(id, h.side);
    w.group.position.copy(palm);
    w.group.scale.setScalar(0.05);
    const thrust = tween(0.3, (k) => { h.dx = k * 0.35; h.rz = 0.04 + k * 0.14; }, Ease.back);
    if (id === "paper") w.params.curl = 1;
    if (id === "scissors") w.setOpen(0);
    Sound.reveal();
    const socket = handPoint(h, info.at[0], info.at[1], info.at[2]);
    await Promise.all([
      moveTo(w.group, socket, 0.3, Ease.back),
      scaleTo(w.group, id === "paper" ? 0.8 : 0.82, 0.3, Ease.back),
      thrust,
    ]);
    if (id === "paper") {
      Sound.rustle(0.3);
      await tween(0.32, (k) => { w.params.curl = 1 - k; }, Ease.out);
    } else if (id === "scissors") {
      for (let i = 0; i < 2; i++) {
        Sound.snip();
        await tween(0.075, (k) => w.setOpen(k * 0.75));
        await tween(0.075, (k) => w.setOpen(0.75 - k * 0.65));
      }
    } else if (id === "rock") {
      Sound.rockHit(0.2);
      await rotateTo(w.group, 0.4, 0.6, 0.15, 0.24, Ease.back);
    } else if (id === "fire") {
      Sound.ignite();
      await tween(0.26, (k) => { w.power = 0.4 + k * 0.6; });
    } else if (id === "water") {
      Sound.bubble(4);
      await wait(0.24);
    } else {
      await wait(0.16);
    }
    return w;
  }

  async function revealGesture(h, id) {
    setPose(h, GESTURE[id] || "point", 22);
    await tween(0.12, (k) => { h.dx = k * 0.25; h.rz = 0.04; }, Ease.out);
    await wait(0.38);
    const tip = handPoint(h, 1.8, id === "scissors" ? 0.2 : 0.05, 0.3);
    const w = spawn(id, h.side);
    w.group.position.copy(tip);
    w.group.scale.setScalar(0.02);
    burstParticles(tip, 14, { speed: 2.5, size: 0.09, gravity: 0, colors: h.side === 0 ? [0xffd60a, 0xffffff] : [0x9b6dff, 0xffffff] });
    Sound.reveal();
    await scaleTo(w.group, 0.82, 0.22, Ease.back);
    return w;
  }

  // Pour une seule manche : a, b = armes jouées (ou null), result = sortie de Rules.evaluate
  async function playRound({ a, b, result, mode }) {
    clearRound();
    hands.forEach((h) => { setPose(h, "fist", 18); });
    await tween(0.14, (k) => hands.forEach((h) => {
      h.dx *= 1 - k;
      h.dy *= 1 - k;
      h.rz += (0.1 - h.rz) * k;
    }));
    await chant();
    const reveals = [a, b].map((id, side) => {
      const h = hands[side];
      if (id === null) {
        setPose(h, "limp", 10);
        return Promise.resolve(null);
      }
      return handStyle === "object" ? revealObject(h, id) : revealGesture(h, id);
    });
    const [wa, wb] = await Promise.all(reveals);
    if (wa === null && wb === null) {
      Sound.draw();
      await tween(0.5, (k) => hands.forEach((h) => { h.rz = 0.1 - k * 0.5; h.dy = -k * 0.3; }));
      return;
    }
    hooks.fight();
    Sound.whoosh(0.28, 0.08);
    const flights = [wa, wb].filter(Boolean).map((w) => Promise.all([
      moveTo(w.group, fightPos(w.side), 0.26, Ease.inOut),
      scaleTo(w.group, 1, 0.26, Ease.out),
      rotateTo(w.group, 0, 0, 0, 0.26),
    ]));
    await Promise.all(flights);
    await wait(0.1);

    let keep = [];
    if (wa === null || wb === null) {
      const w = wa || wb;
      await fightLate(w, hands[wa ? 1 : 0]);
      keep = [w];
    } else if (mode === "mirror") {
      if (result.same) await fightMirrorSame(wa, wb);
      else await fightMirrorMiss(wa, wb);
      keep = [wa, wb];
    } else if (result.raw === 0) {
      await fightClash(wa, wb);
      keep = [wa, wb];
    } else {
      const W = result.raw > 0 ? wa : wb;
      const L = result.raw > 0 ? wb : wa;
      // Un combat dessiné s'il existe, sinon (armes importées, règle changée) le choc générique
      await (FIGHTS[`${W.id}>${L.id}`] || fightGeneric)(W, L);
      keep = [W];
    }
    // Fin : la main gagnante se lève, l'autre tombe
    const winner = result.winner;
    const finish = hands.map((h) => {
      const isWinner = winner === h.side;
      const isLoser = winner !== -1 && !isWinner;
      if (isLoser) setPose(h, "limp", 8);
      const start = { dy: h.dy, rz: h.rz, dx: h.dx };
      const dy = isWinner ? 0.42 : isLoser ? -0.24 : 0;
      const rz = isWinner ? 0.34 : isLoser ? -0.14 : 0.1;
      return tween(0.42, (k) => {
        h.dy = start.dy + (dy - start.dy) * k;
        h.rz = start.rz + (rz - start.rz) * k;
        h.dx = start.dx * (1 - k);
      }, Ease.back);
    });
    await Promise.all(finish);
    keep.forEach((w) => { if (w.params) w.params.wave = 1; });
  }

  // Retire ce qui reste de la manche précédente
  function clearRound() {
    objects.slice().forEach((w) => {
      const g = w.group;
      const from = g.scale.x;
      tween(0.16, (k) => g.scale.setScalar(Math.max(0.001, from * (1 - k))), Ease.in).then(() => removeWeapon(w));
    });
  }

  function reset() {
    tweens = [];
    objects.slice().forEach(removeWeapon);
    boost = 1;
    hands.forEach((h) => {
      setPose(h, "fist", 12);
      h.dx = 0; h.dy = 0; h.dz = 0; h.rz = 0.1;
    });
  }

  // --- Le moteur ------------------------------------------------------------------

  function step(real) {
    const dt = real * speed * boost;
    time += dt;

    const running = tweens;
    tweens = [];
    const carry = [];
    running.forEach((tw) => {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      if (tw.fn) tw.fn(tw.ease(k));
      if (k >= 1) tw.res();
      else carry.push(tw);
    });
    tweens = carry.concat(tweens);

    hands.forEach((h) => updateHand(h, dt, time));
    objects.forEach((w) => {
      w.update(dt, time);
      if (w.id === "fire") {
        fxLights[w.side].position.copy(w.group.position).add(V(0, 0.2, 0.4));
        fxLights[w.side].intensity = (1.5 + Math.sin(time * 19) * 0.25 + Math.sin(time * 31) * 0.2) * Math.min(1.5, w.power);
      }
    });
    updateFx(dt);
    return dt;
  }

  function draw(dt) {
    camera.position.copy(camera.userData.home);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake * 2;
      camera.position.y += (Math.random() - 0.5) * shake * 2;
      shake *= Math.exp(-dt * 9);
    }
    renderer.render(scene, camera);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const real = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const dt = step(real);
    if (visible || tweens.length) draw(dt);
  }

  function resize() {
    if (!zone) return;
    const w = zone.clientWidth, h = zone.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = camera.aspect < 1.65;
    handSpread = narrow ? 3.45 : 3.95;
    const tanHalf = Math.tan((camera.fov * PI) / 360);
    const dist = Math.max(5.8 / (2 * tanHalf), (narrow ? 8.6 : 10) / (2 * tanHalf * camera.aspect));
    camera.userData.home.set(0, 1.25, dist);
    camera.position.copy(camera.userData.home);
    camera.lookAt(0, 0.45, 0);
    camera.updateProjectionMatrix();
  }

  function makeLights(target) {
    target.add(new THREE.HemisphereLight(0xf1ecff, 0x3a2f5e, 0.42));
    const key = new THREE.DirectionalLight(0xfff4e0, 0.95);
    key.position.set(2.4, 7, 6);
    target.add(key);
    const fill = new THREE.DirectionalLight(0xc9b0ff, 0.24);
    fill.position.set(-5, 2, 4);
    target.add(fill);
    const warm = new THREE.DirectionalLight(0xffd60a, 0.16);
    warm.position.set(5, 1, 3);
    target.add(warm);
    return key;
  }

  // Une petite salle lumineuse, dessinée à plat : c'est ce que le métal des ciseaux reflète
  function buildEnvironment() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, "#fff6e6");
    sky.addColorStop(0.42, "#a79dc9");
    sky.addColorStop(0.55, "#4a3f70");
    sky.addColorStop(1, "#14101f");
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 256);
    const glow = (x, y, r, color) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(256, 40, 90, "rgba(255,255,255,1)");
    glow(90, 110, 62, "rgba(155,109,255,1)");
    glow(420, 110, 62, "rgba(255,214,10,1)");
    glow(256, 120, 42, "rgba(255,255,255,0.85)");
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const out = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return out;
  }

  function init(canvas, zoneEl) {
    if (!window.THREE) return false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) {
      return false;
    }
    zone = zoneEl;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);

    envMap = buildEnvironment();
    scene = new THREE.Scene();
    scene.environment = envMap;
    camera = new THREE.PerspectiveCamera(32, 2, 0.1, 100);
    camera.userData.home = V(0, 1.25, 10);

    const key = makeLights(scene);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.0012;
    key.shadow.radius = 5;

    fxLights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xff8a2e, 0, 7, 2);
      scene.add(l);
      return l;
    });

    // Le tapis
    const felt = new THREE.Mesh(
      new THREE.CircleGeometry(9, 72),
      new THREE.MeshStandardMaterial({ map: Textures.felt(), transparent: true, roughness: 1, metalness: 0, envMapIntensity: 0.2 })
    );
    felt.rotation.x = -PI / 2;
    felt.position.y = -1.3;
    felt.receiveShadow = true;
    scene.add(felt);

    for (let i = 0; i < 240; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Textures.softDot(), transparent: true, depthWrite: false, toneMapped: false }));
      sprite.visible = false;
      scene.add(sprite);
      sprites.push({ sprite, pos: V(), vel: V(), life: 0, age: 0, gravity: 0, drag: 0, size: 0.1, grow: 0, opacity: 1 });
    }

    hands = [0, 1].map((side) => {
      const h = buildHand(side, cos(side).skin);
      setSkin(h, cos(side).skin);
      scene.add(h.mirror);
      return h;
    });

    // Les vignettes des boutons
    thumbTarget = new THREE.WebGLRenderTarget(256, 256, { format: THREE.RGBAFormat, encoding: THREE.sRGBEncoding });
    thumbScene = new THREE.Scene();
    thumbScene.environment = envMap;
    makeLights(thumbScene);
    // Le rendu vers une image ne passe pas par la correction de couleurs : on baisse un peu la lumière
    thumbScene.traverse((o) => { if (o.isLight) o.intensity *= 0.72; });
    thumbCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    thumbCamera.position.set(0, 0, 5.4);
    thumbCamera.lookAt(0, 0, 0);

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(zone);
    else addEventListener("resize", resize);
    if (window.IntersectionObserver) {
      new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(zone);
    }
    ok = true;
    requestAnimationFrame((t) => { last = t; frame(t); });
    return true;
  }

  function renderThumb(group, size = 128) {
    thumbScene.add(group);
    renderer.setRenderTarget(thumbTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(thumbScene, thumbCamera);
    const pixels = new Uint8Array(256 * 256 * 4);
    renderer.readRenderTargetPixels(thumbTarget, 0, 0, 256, 256, pixels);
    renderer.setRenderTarget(null);
    thumbScene.remove(group);
    const big = document.createElement("canvas");
    big.width = big.height = 256;
    const bctx = big.getContext("2d");
    const image = bctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      image.data.set(pixels.subarray((255 - y) * 1024, (256 - y) * 1024), y * 1024);
    }
    bctx.putImageData(image, 0, 0);
    const small = document.createElement("canvas");
    small.width = small.height = size;
    small.getContext("2d").drawImage(big, 0, 0, size, size);
    return small.toDataURL("image/png");
  }

  // Image d'une arme pour les boutons, l'historique et la personnalisation
  function thumbnail(id, side) {
    if (!ok) return null;
    const w = makeWeapon(id, side);
    if (id === "scissors") {
      w.setOpen(0.62);
      w.group.rotation.set(0.15, 0, 0.72);
      if (side === 1) w.body.rotation.y = 0;
      w.group.position.x = -0.06;
      w.group.scale.setScalar(0.86);
    } else if (id === "paper") {
      w.params.wave = 0.5;
      w.update(0, 0.6);
      w.group.rotation.set(-0.1, -0.32, 0.08);
      w.group.scale.setScalar(0.92);
    } else if (id === "rock") {
      w.group.rotation.set(0.25, 0.5, 0);
      w.group.scale.setScalar(1.22);
    } else if (id === "fire") {
      w.group.scale.setScalar(2.1);
      // Sur une vignette transparente, le mélange additif serait invisible sur fond clair
      w.body.children.forEach((sprite) => {
        sprite.material.blending = THREE.NormalBlending;
        sprite.material.opacity = Math.min(1, sprite.material.opacity * 1.5);
      });
    } else if (id === "water") {
      w.group.scale.setScalar(1.2);
    } else {
      w.group.rotation.y = -0.3;
      w.group.scale.setScalar(1.1);
    }
    const url = renderThumb(w.group);
    releaseWeapon(w);
    return url;
  }

  function handThumbnail(side, pose = "open") {
    if (!ok) return null;
    const h = buildHand(side, cos(side).skin);
    setSkin(h, cos(side).skin);
    h.pose = flatPose(POSES[pose]);
    applyPose(h);
    h.mirror.scale.x = 1;
    h.root.position.set(-0.78, -0.08, 0);
    h.wrist.rotation.set(0.05, 0.25, 0.5);
    h.mirror.scale.multiplyScalar(0.92);
    const url = renderThumb(h.mirror);
    h.mirror.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    [h.skin, h.nailMat, h.sleeveMat, h.cuffMat].forEach((m) => m.dispose());
    return url;
  }

  return {
    init,
    get ok() { return ok; },
    hooks,
    playRound,
    reset,
    setSpeed(v) { speed = v; },
    skip() { boost = 6; },
    unskip() { boost = 1; },
    setHandStyle(v) { handStyle = v; },
    setThinking(v) { thinking = v; },
    setWeaponSet(s) { weaponSet = s; },
    setCosmetics(side, c) {
      cosmetics[side] = c;
      if (ok && hands[side]) setSkin(hands[side], c.skin);
    },
    thumbnail,
    handThumbnail,
  };
})();
