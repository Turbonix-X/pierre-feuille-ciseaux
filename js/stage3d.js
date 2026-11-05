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
  const THUMB_IN = [1.0, -0.12, 0.34, 0.5];
  const POSES = {
    fist: [curled(0.03), curled(0.01), curled(-0.01), curled(-0.04), THUMB_IN],
    open: [finger(0.05, 0.08, 0.06, 0.2), finger(0.03, 0.06, 0.05, 0.05), finger(0.05, 0.07, 0.05, -0.1), finger(0.08, 0.1, 0.07, -0.27), [0.22, 0.98, 0.12, 0.1]],
    splay: [finger(-0.08, 0.02, 0.02, 0.32), finger(-0.08, 0.02, 0.02, 0.09), finger(-0.06, 0.02, 0.02, -0.14), finger(-0.04, 0.03, 0.02, -0.38), [0.12, 1.12, 0.04, 0.04]],
    relaxed: [finger(0.3, 0.42, 0.26, 0.12), finger(0.34, 0.48, 0.28, 0.03), finger(0.4, 0.52, 0.3, -0.05), finger(0.46, 0.56, 0.32, -0.15), [0.35, 0.72, 0.2, 0.2]],
    scissors: [finger(0.02, 0.04, 0.03, 0.27), finger(0.02, 0.04, 0.03, -0.13), curled(-0.06), curled(-0.1), [1.05, -0.3, 0.3, 0.5]],
    scissorsWide: [finger(0, 0.03, 0.02, 0.44), finger(0, 0.03, 0.02, -0.3), curled(-0.06), curled(-0.1), [1.05, -0.3, 0.3, 0.5]],
    scissorsClosed: [finger(0.02, 0.04, 0.03, 0.07), finger(0.02, 0.04, 0.03, 0.04), curled(-0.06), curled(-0.1), [1.05, -0.3, 0.3, 0.5]],
    crumple: [finger(0.75, 1.3, 0.9, 0.3), finger(1, 0.95, 0.5, -0.24), curled(-0.06), curled(-0.1), [0.8, 0.1, 0.3, 0.4]],
    wrap: [finger(0.85, 0.95, 0.65, 0.12), finger(0.85, 1, 0.65, 0.03), finger(0.88, 1, 0.68, -0.05), finger(0.92, 1, 0.68, -0.14), [0.85, 0.3, 0.45, 0.45]],
    // Tenir une pierre : la paume en creux, les doigts remontent autour
    cup: [finger(0.72, 0.72, 0.42, 0.16), finger(0.74, 0.74, 0.44, 0.04), finger(0.76, 0.76, 0.44, -0.07), finger(0.8, 0.78, 0.46, -0.2), [0.72, 0.62, 0.3, 0.26]],
    // Porter une flamme ou une goutte : la main ouverte, à peine creusée
    cradle: [finger(0.36, 0.36, 0.2, 0.16), finger(0.36, 0.38, 0.22, 0.04), finger(0.38, 0.38, 0.22, -0.07), finger(0.42, 0.4, 0.24, -0.2), [0.42, 0.78, 0.18, 0.18]],
    // Tenir les ciseaux : les doigts passés dans un anneau, le pouce dans l'autre
    grip: [finger(0.95, 1.2, 0.8, 0.02), finger(1.1, 1.45, 0.95, 0), finger(1.25, 1.6, 1, -0.02), finger(1.35, 1.65, 1, -0.05), [0.92, 0.42, 0.22, 0.32]],
    gripOpen: [finger(0.95, 1.2, 0.8, 0.02), finger(1.1, 1.45, 0.95, 0), finger(1.25, 1.6, 1, -0.02), finger(1.35, 1.65, 1, -0.05), [0.62, 0.8, 0.12, 0.14]],
    // Pincer la feuille entre le pouce et l'index
    pinch: [finger(0.72, 0.74, 0.46, 0.12), finger(0.92, 1.12, 0.72, 0.02), finger(1.1, 1.3, 0.85, -0.05), finger(1.22, 1.4, 0.92, -0.1), [0.86, 0.34, 0.34, 0.2]],
    fire: [finger(0.42, 0.75, 0.42, 0.24), finger(0.38, 0.72, 0.42, 0.07), finger(0.42, 0.76, 0.42, -0.11), finger(0.46, 0.8, 0.46, -0.28), [0.5, 0.85, 0.3, 0.3]],
    water: [finger(0.34, 0.42, 0.26, 0.06), finger(0.3, 0.4, 0.26, 0.01), finger(0.32, 0.42, 0.26, -0.04), finger(0.36, 0.46, 0.3, -0.09), [0.68, 0.55, 0.25, 0.25]],
    point: [finger(0.02, 0.03, 0.03, 0.04), curled(0), curled(-0.02), curled(-0.05), [0.95, -0.05, 0.3, 0.45]],
    limp: [finger(0.5, 0.42, 0.3, 0.1), finger(0.52, 0.45, 0.3, 0.02), finger(0.56, 0.48, 0.33, -0.05), finger(0.6, 0.5, 0.35, -0.13), [0.45, 0.55, 0.3, 0.3]],
  };
  const flatPose = (p) => [].concat(...p);
  const GESTURE = { rock: "fist", paper: "open", scissors: "scissors", fire: "fire", water: "water" };

  // Une main dessinée dans la fenêtre de création : 0 tendu, 1 à moitié, 2 plié
  function poseFromStates(states) {
    const s = states || { thumb: 2, index: 0, middle: 2, ring: 2, pinky: 2 };
    const spreads = [0.2, 0.05, -0.1, -0.27];
    const fingers = ["index", "middle", "ring", "pinky"].map((name, i) => {
      const v = s[name];
      if (v === 0) return finger(0.04, 0.06, 0.04, spreads[i]);
      if (v === 1) return finger(0.72, 0.82, 0.5, spreads[i] * 0.5);
      return curled(spreads[i] * 0.15);
    });
    const thumb = s.thumb === 0 ? [0.22, 0.98, 0.12, 0.1] : s.thumb === 1 ? [0.7, 0.42, 0.25, 0.3] : THUMB_IN;
    return flatPose([...fingers, thumb]);
  }

  const customStates = (id) => {
    const w = weaponSet && weaponSet.weapons[id];
    return w && w.custom ? w.hand : null;
  };
  const gesturePose = (id) => (GESTURE[id] ? flatPose(POSES[GESTURE[id]]) : poseFromStates(customStates(id)));

  // Le coude est loin hors de l'écran : c'est lui qui fait bouger l'avant-bras, le poignet ne fait que plier
  const ELBOW = 6;
  const ARM_YAW = 0.16;
  const HAND_Y = 0.12;

  function buildHand(side, skinHex) {
    const skin = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.6, metalness: 0, envMapIntensity: 0.38 });
    const nailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05 });
    const brand = side === 0 ? 0xffd60a : 0x9b6dff;
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x26222f, roughness: 0.82 });
    const cuffMat = new THREE.MeshStandardMaterial({ color: brand, roughness: 0.45, emissive: brand, emissiveIntensity: 0.14 });

    const mirror = new THREE.Group();
    if (side === 1) mirror.scale.x = -1;
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.position.x = -ELBOW;
    arm.rotation.order = "ZYX";
    const fore = new THREE.Group();
    fore.position.x = ELBOW;
    const wrist = new THREE.Group();
    wrist.position.x = ELBOW;
    wrist.rotation.order = "YXZ";
    mirror.add(root);
    root.add(arm);
    arm.add(fore, wrist);

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
    const foreGeo = new THREE.CylinderGeometry(0.27, 0.42, 15, 28);
    foreGeo.rotateZ(PI / 2);
    foreGeo.translate(-7.46, 0, 0);
    const foreMesh = add(foreGeo, skin, fore);
    foreMesh.scale.z = 0.76;
    const sleeve = new THREE.CylinderGeometry(0.42, 0.56, 14, 28);
    sleeve.rotateZ(PI / 2);
    sleeve.translate(-8.1, 0, 0);
    const sleeveMesh = add(sleeve, sleeveMat, fore);
    sleeveMesh.scale.z = 0.8;
    const cuff = new THREE.TorusGeometry(0.42, 0.075, 12, 36);
    cuff.rotateY(PI / 2);
    const cuffMesh = add(cuff, cuffMat, fore);
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
      side, mirror, root, arm, wrist, fingers, thumb: { base: thumbBase, mid: thumbMid, tip: thumbTip },
      skin, nailMat, sleeveMat, cuffMat,
      pose: pose.slice(), target: pose.slice(), vel: pose.map(() => 0), rate: 16,
      dx: 0, dy: 0, dz: 0, az: 0, roll: 0, ry: 0.16, rz: 0.1,
      flex: 0.1, flexVel: 0, prevSwing: 0, aura: null, auraClock: 0,
    };
  }

  function setSkin(h, hex) {
    // Le code couleur est en sRGB : sans cette conversion, toutes les peaux ressortent bien plus claires que la pastille
    h.skin.color.set(hex).convertSRGBToLinear();
    h.nailMat.color.copy(h.skin.color).lerp(new THREE.Color(0xffffff), 0.62);
  }

  function applyPose(h, t = 0) {
    const p = h.pose;
    h.fingers.forEach((f, i) => {
      const o = i * 4;
      // Les doigts ne sont jamais tout à fait immobiles
      const alive = Math.sin(t * 1.4 + i * 1.3 + h.side) * 0.018;
      f.base.rotation.set(0, -p[o] - alive, p[o + 3]);
      f.pip.rotation.y = -p[o + 1] - alive;
      f.dip.rotation.y = -p[o + 2];
    });
    h.thumb.base.rotation.set(0, -p[16], p[17]);
    h.thumb.mid.rotation.y = -p[18];
    h.thumb.tip.rotation.y = -p[19];
  }

  // name : un nom de POSES, ou directement un tableau de valeurs
  const setPose = (h, name, rate = 16) => {
    h.target = typeof name === "string" ? flatPose(POSES[name]) : name;
    h.rate = rate;
  };

  // Les doigts suivent un petit ressort : ils arrivent l'un après l'autre et dépassent à peine leur position
  const FINGER_LAG = [1.14, 1.04, 0.95, 0.86, 1.12];
  function springPose(h, dt) {
    if (dt > 0.1) {
      h.pose = h.target.slice();
      h.vel.fill(0);
      return;
    }
    const steps = Math.max(1, Math.ceil(dt / 0.012));
    const d = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < h.pose.length; i++) {
        const rate = h.rate * FINGER_LAG[Math.min(4, Math.floor(i / 4))];
        const accel = (h.target[i] - h.pose[i]) * rate * rate - h.vel[i] * 2 * rate * 0.72;
        h.vel[i] += accel * d;
        h.pose[i] += h.vel[i] * d;
      }
    }
  }

  function updateHand(h, dt, t) {
    springPose(h, dt);
    applyPose(h, t);
    const breathe = Math.sin(t * (thinking ? 5 : 1.6) + h.side * 1.1) * (thinking ? 0.05 : 0.03);
    h.root.position.set(-handSpread + h.dx, HAND_Y + h.dy + breathe, ELBOW * Math.sin(ARM_YAW) + h.dz);
    h.arm.rotation.set(h.roll, ARM_YAW, h.az);

    // Le poignet suit en retard : quand le bras monte, la main reste en arrière, puis rattrape
    const swing = h.dy * 0.9 + h.az * ELBOW;
    if (dt > 0.1) {
      h.flex = h.rz;
      h.flexVel = 0;
    } else if (dt > 0) {
      const armSpeed = Math.max(-9, Math.min(9, (swing - h.prevSwing) / dt));
      const goal = h.rz - armSpeed * 0.055;
      const steps = Math.max(1, Math.ceil(dt / 0.012));
      const d = dt / steps;
      for (let s = 0; s < steps; s++) {
        h.flexVel += ((goal - h.flex) * 170 - h.flexVel * 15) * d;
        h.flex += h.flexVel * d;
      }
    }
    h.prevSwing = swing;
    h.wrist.rotation.set(0, h.ry, h.flex + breathe * 0.4);

    // Le feu et l'eau sortent des doigts quand la main fait leur signe
    if (h.aura && dt > 0 && dt < 0.2) {
      h.auraClock += dt;
      while (h.auraClock > 0.035) {
        h.auraClock -= 0.035;
        const tip = handPoint(h, rand(1.1, 1.75), rand(-0.38, 0.42), 0.3);
        if (h.aura === "fire") {
          particle(tip, V(rand(-0.2, 0.2), rand(0.8, 1.7), 0), { color: [0xffc84a, 0xf26a12, 0xff9d2e][Math.floor(rand(3))], size: rand(0.14, 0.3), life: rand(0.3, 0.6), gravity: -0.5 });
        } else {
          particle(tip, V(rand(-0.15, 0.15), rand(-0.4, 0.2), 0), { color: 0x4ab8ff, size: rand(0.07, 0.15), life: rand(0.35, 0.6), gravity: 5, additive: false });
        }
      }
    }
  }

  const handPoint = (h, x, y, z) => {
    h.root.updateWorldMatrix(true, true);
    return h.wrist.localToWorld(V(x, y, z));
  };

  // Une secousse dans le poignet (après un choc, un coup reçu…)
  const jolt = (h, amount) => { h.flexVel += amount; };

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
    hands.forEach((h) => jolt(h, -3 * strength));
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
      tween(0.4, (k) => { lateHand.rz = 0.1 - k * 0.5; lateHand.dy = -k * 0.3; }),
    ]);
  }

  // --- Les six attaques des armes personnalisées, avec ou sans objet ----------------

  // Un « acteur » : soit l'objet, soit la main elle-même quand on joue au geste
  const TIP = 1.72;
  const sideSign = (side) => (side === 0 ? 1 : -1);

  function objectActor(w) {
    return {
      side: w.side,
      tint: w.tint,
      pos: () => w.group.position.clone(),
      moveTo: (p, d, ease = Ease.inOut, arc = 0) => moveTo(w.group, p, d, ease, arc),
      pulse: (s, d, ease) => scaleTo(w.group, s, d, ease),
      async shake(d, power = 0.08) {
        const base = w.group.position.clone();
        await tween(d, () => w.group.position.copy(base).add(V(rand(-power, power), rand(-power, power), 0)), Ease.linear);
        w.group.position.copy(base);
      },
      destroy() { shatter(w); return Promise.resolve(); },
      async fling() {
        const sign = sideSign(w.side);
        const from = w.group.position.clone();
        await tween(0.62, (k) => {
          w.group.position.set(from.x - sign * k * 9, from.y + Math.sin(k * PI * 0.6) * 2.4, from.z - k * 2);
          w.group.rotation.z += 0.42 * sign;
          w.group.rotation.x += 0.24;
          if (Math.random() < 0.7) particle(w.group.position, V(rand(-0.4, 0.4), rand(-0.4, 0.4), 0), { color: 0xffffff, size: 0.12, life: 0.35, gravity: 0 });
        }, Ease.out);
        removeWeapon(w);
      },
      async flatten() {
        const s = w.group.scale.x;
        await tween(0.12, (k) => w.group.scale.set(s * (1 + k * 0.7), Math.max(0.04, s * (1 - k * 0.94)), s * (1 + k * 0.7)), Ease.out);
        await wait(0.2);
        await tween(0.2, (k) => w.group.scale.setScalar(Math.max(0.001, 0.5 * (1 - k))));
        removeWeapon(w);
      },
      async pullInto(p) {
        const from = w.group.position.clone();
        const s = w.group.scale.x;
        await tween(0.7, (k) => {
          w.group.position.lerpVectors(from, p, k);
          w.group.scale.setScalar(Math.max(0.001, s * (1 - k * k)));
          w.group.rotation.z += 0.32;
        }, Ease.in);
        removeWeapon(w);
      },
      slice: () => sliceWeapon(w),
    };
  }

  function handActor(h) {
    const s = sideSign(h.side);
    const actor = {
      side: h.side,
      tint: "#ffffff",
      pos: () => handPoint(h, TIP, 0, 0.1),
      moveTo(p, d, ease = Ease.inOut, arc = 0) {
        const from = { dx: h.dx, dy: h.dy, dz: h.dz };
        const dx = handSpread + s * p.x - TIP;
        const dy = p.y - HAND_Y;
        const dz = p.z - 0.25;
        return tween(d, (k) => {
          h.dx = from.dx + (dx - from.dx) * k;
          h.dy = from.dy + (dy - from.dy) * k + (arc ? arc * Math.sin(k * PI) : 0);
          h.dz = from.dz + (dz - from.dz) * k;
        }, ease);
      },
      pulse: () => wait(0.01),
      async shake(d, power = 0.08) {
        const base = { dx: h.dx, dy: h.dy };
        await tween(d, () => {
          h.dx = base.dx + rand(-power, power);
          h.dy = base.dy + rand(-power, power);
        }, Ease.linear);
        h.dx = base.dx;
        h.dy = base.dy;
      },
      async destroy() {
        h.aura = null;
        setPose(h, "limp", 12);
        jolt(h, -14);
        await handRecoil(h);
      },
      async fling() {
        h.aura = null;
        setPose(h, "splay", 18);
        const from = { dx: h.dx, dy: h.dy, az: h.az };
        await tween(0.42, (k) => {
          h.dx = from.dx + (-7 - from.dx) * k;
          h.dy = from.dy + Math.sin(k * PI) * 0.9;
          h.az = from.az + k * 0.5;
          if (Math.random() < 0.6) particle(actor.pos(), V(rand(-0.4, 0.4), rand(-0.4, 0.4), 0), { color: 0xffffff, size: 0.12, life: 0.35, gravity: 0 });
        }, Ease.out);
        await wait(0.2);
        setPose(h, "limp", 9);
        await tween(0.42, (k) => {
          h.dx = -7 + 7 * k;
          h.az = (from.az + 0.5) * (1 - k);
          h.dy = -0.2 * k;
        }, Ease.out);
      },
      async flatten() {
        h.aura = null;
        setPose(h, "limp", 20);
        jolt(h, -20);
        const from = h.dy;
        await tween(0.14, (k) => { h.dy = from - k * 0.5; h.rz = 0.1 - k * 0.5; }, Ease.out);
        await wait(0.22);
        await handRecoil(h);
      },
      async pullInto(p) {
        h.aura = null;
        setPose(h, "splay", 14);
        await actor.moveTo(p.clone().add(V(s * 0.3, 0, 0)), 0.55, Ease.in);
        setPose(h, "limp", 10);
        jolt(h, -12);
        await handRecoil(h);
      },
      async slice() {
        h.aura = null;
        setPose(h, "crumple", 18);
        jolt(h, -16);
        await handRecoil(h);
      },
    };
    return actor;
  }

  // La main touchée recule et retombe
  async function handRecoil(h) {
    const from = { dx: h.dx, dy: h.dy, dz: h.dz, rz: h.rz, roll: h.roll };
    await tween(0.34, (k) => {
      h.dx = from.dx * (1 - k);
      h.dy = from.dy + (-0.2 - from.dy) * k;
      h.dz = from.dz * (1 - k);
      h.rz = from.rz + (-0.12 - from.rz) * k;
      h.roll = from.roll * (1 - k);
    }, Ease.out);
  }

  // Coupe un objet en deux avec des plans de coupe qui suivent les deux morceaux
  async function sliceWeapon(w) {
    if (w.id === "fire") {
      shatter(w);
      return;
    }
    const n = V(0.62, 0.78, 0).normalize();
    const p0 = w.group.position.clone();
    const c0 = -n.dot(p0);
    const planeA = new THREE.Plane(n.clone(), c0);
    const planeB = new THREE.Plane(n.clone().negate(), -c0);
    const clone = w.group.clone(true);
    scene.add(clone);
    const made = [];
    const clip = (group, plane) => group.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone();
      m.clippingPlanes = [plane];
      m.side = THREE.DoubleSide;
      o.material = m;
      made.push(m);
    });
    clip(w.group, planeA);
    clip(clone, planeB);
    await tween(0.62, (k) => {
      const a = V(n.x * k * 0.7, n.y * k * 0.5 - k * k * 1.2, -k * 0.2);
      const b = V(-n.x * k * 0.7, -n.y * k * 0.5 - k * k * 2, -k * 0.2);
      w.group.position.copy(p0).add(a);
      clone.position.copy(p0).add(b);
      planeA.constant = c0 - n.dot(a);
      planeB.constant = -c0 + n.dot(b);
    }, Ease.in);
    scene.remove(clone);
    removeWeapon(w);
    made.forEach((m) => m.dispose());
  }

  function shockRing(pos, color, size = 5) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1, 56),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    ring.position.copy(pos);
    scene.add(ring);
    return tween(0.48, (k) => {
      ring.scale.setScalar(0.2 + k * size);
      ring.material.opacity = 1 - k;
    }, Ease.out).then(() => {
      scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    });
  }

  function slashStreak(pos) {
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    streak.position.copy(pos);
    streak.position.z += 0.7;
    streak.rotation.z = -0.67;
    scene.add(streak);
    return tween(0.3, (k) => {
      streak.scale.set(0.2 + k, 1 - k * 0.85, 1);
      streak.material.opacity = 1 - k * k;
    }, Ease.out).then(() => {
      scene.remove(streak);
      streak.geometry.dispose();
      streak.material.dispose();
    });
  }

  // Un éclair : une ligne brisée de points lumineux
  function lightning(from, to) {
    const steps = 22;
    let offset = V();
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      offset.add(V(rand(-0.13, 0.13), rand(-0.17, 0.17), 0)).multiplyScalar(0.92);
      const taper = Math.sin(k * PI);
      const p = from.clone().lerp(to, k).addScaledVector(offset, 1 + taper * 2.2);
      particle(p, V(), { color: i % 3 ? 0xc9b0ff : 0xffffff, size: 0.26, life: 0.17, gravity: 0, opacity: 1 });
      particle(p, V(), { color: 0x9b6dff, size: 0.62, life: 0.13, gravity: 0, opacity: 0.45 });
    }
  }

  const tintHex = (actor) => new THREE.Color(actor.tint).getHex();

  const ATTACKS = {
    // 💥 Le gagnant recule, fonce, et le perdant vole en éclats
    async charge(W, L, c) {
      const sign = sideSign(W.side);
      await Promise.all([
        L.moveTo(c.clone().add(V(sign * 0.75, 0, 0)), 0.3),
        W.moveTo(c.clone().add(V(-sign * 2.6, 0.3, 0)), 0.36, Ease.out),
      ]);
      Sound.whoosh(0.16, 0.14);
      await W.moveTo(c.clone().add(V(sign * 0.4, 0, 0)), 0.15, Ease.in);
      Sound.boom();
      impact(1.2);
      burstParticles(L.pos(), 24, { speed: 5.5, size: 0.11, gravity: 3 });
      await L.destroy();
      await W.moveTo(c, 0.36, Ease.back);
    },
    // 🚀 Un énorme coup, et le perdant part hors de l'écran
    async eject(W, L, c) {
      const sign = sideSign(W.side);
      await Promise.all([
        L.moveTo(c.clone().add(V(sign * 0.6, -0.1, 0)), 0.28),
        W.moveTo(c.clone().add(V(-sign * 2.8, -0.2, 0)), 0.36, Ease.out),
      ]);
      await W.shake(0.2, 0.05);
      Sound.whoosh(0.14, 0.16);
      await W.moveTo(c.clone().add(V(sign * 0.25, -0.1, 0)), 0.12, Ease.in);
      Sound.boom();
      Sound.eject();
      impact(1.35);
      const at = L.pos();
      burstParticles(at, 30, { speed: 7, size: 0.13, gravity: 2, colors: [0xffd60a, 0xffffff, tintHex(W)] });
      shockRing(at, 0xffd60a, 3.4);
      await Promise.all([L.fling(), W.moveTo(c, 0.46, Ease.back)]);
    },
    // 🧨 Le gagnant gonfle, et tout saute
    async explode(W, L, c) {
      const sign = sideSign(W.side);
      await Promise.all([
        L.moveTo(c.clone().add(V(sign * 0.7, 0, 0)), 0.3),
        W.moveTo(c.clone().add(V(-sign * 0.7, 0, 0)), 0.3),
      ]);
      Sound.charge();
      await Promise.all([W.pulse(1.35, 0.5, Ease.in), W.shake(0.5, 0.06), L.shake(0.5, 0.03)]);
      Sound.boom();
      Sound.rockHit(0.8);
      impact(1.8);
      const at = c.clone();
      shockRing(at, 0xffd60a, 6.5);
      shockRing(at, 0xff5a1e, 4.4);
      burstParticles(at, 62, { speed: 8.5, size: 0.2, gravity: 2, colors: [0xfff2a8, 0xffc84a, 0xf26a12, 0x9c1c08, tintHex(W)], life: 0.9, flat: 0.8 });
      smoke(at, 16, 0x4c4a52, 1.5);
      fxFlash(at);
      await Promise.all([L.destroy(), W.pulse(1, 0.3, Ease.back)]);
      await W.moveTo(c, 0.28, Ease.back);
    },
    // 🔨 Le gagnant monte et retombe de tout son poids
    async crush(W, L, c) {
      const low = c.clone().add(V(0, -0.5, 0));
      await Promise.all([
        L.moveTo(low, 0.3),
        W.moveTo(c.clone().add(V(0, 2.3, 0)), 0.38, Ease.out),
      ]);
      await wait(0.08);
      Sound.whoosh(0.16, 0.14);
      await W.moveTo(low.clone().add(V(0, 0.45, 0)), 0.15, Ease.in);
      Sound.rockHit(1);
      impact(1.5);
      const at = low.clone().add(V(0, -0.2, 0));
      shockRing(at, 0xffffff, 3.2);
      smoke(at, 11, 0x8a8894, 0.85);
      burstParticles(at, 22, { speed: 4.5, up: 1, size: 0.1, gravity: 9, colors: [0xbcc0c6, 0xffffff, tintHex(L)], additive: false });
      await Promise.all([
        L.flatten(),
        (async () => {
          await W.moveTo(c.clone().add(V(0, 0.4, 0)), 0.18, Ease.out);
          await W.moveTo(c, 0.2, Ease.back);
        })(),
      ]);
    },
    // 🗡️ Un passage éclair, puis le perdant se sépare en deux
    async slice(W, L, c) {
      const sign = sideSign(W.side);
      await Promise.all([
        L.moveTo(c, 0.28),
        W.moveTo(c.clone().add(V(-sign * 2.4, 1.05, 0.2)), 0.34, Ease.out),
      ]);
      await wait(0.06);
      Sound.whoosh(0.1, 0.18);
      await W.moveTo(c.clone().add(V(sign * 2.4, -1, 0.2)), 0.13, Ease.in);
      Sound.snip();
      Sound.metal(0.7);
      slashStreak(L.pos());
      impact(0.7);
      burstParticles(L.pos(), 18, { speed: 4, size: 0.09, gravity: 3, colors: [0xffffff, 0xc9b0ff] });
      await wait(0.16);
      await Promise.all([L.slice(), W.moveTo(c, 0.42, Ease.back, 0.5)]);
    },
    // 🌀 Un tourbillon avale le perdant
    async suck(W, L, c) {
      const sign = sideSign(W.side);
      const wAt = c.clone().add(V(-sign * 1.3, 0.1, 0));
      await Promise.all([
        W.moveTo(wAt, 0.3),
        L.moveTo(c.clone().add(V(sign * 1.3, 0, 0)), 0.3),
      ]);
      Sound.suck();
      const center = W.pos();
      await Promise.all([
        tween(0.95, () => {
          for (let i = 0; i < 3; i++) {
            const a = rand(PI * 2);
            const r = rand(0.9, 2.1);
            const from = center.clone().add(V(Math.cos(a) * r, Math.sin(a) * r * 0.75, 0.2));
            const v = center.clone().sub(from).multiplyScalar(2.3).add(V(-Math.sin(a) * 2.2, Math.cos(a) * 2.2, 0));
            particle(from, v, { color: [0xc9b0ff, 0x9b6dff, tintHex(W)][i], size: rand(0.08, 0.16), life: 0.42, gravity: 0 });
          }
        }, Ease.linear),
        W.pulse(1.25, 0.9, Ease.inOut),
        (async () => {
          await L.shake(0.3, 0.07);
          await L.pullInto(center);
        })(),
      ]);
      Sound.clash();
      impact(0.8);
      shockRing(center, 0x9b6dff, 2.6);
      await Promise.all([W.pulse(1, 0.26, Ease.back), W.moveTo(c, 0.32, Ease.back)]);
    },
    // ⚡ Plusieurs éclairs, de plus en plus forts
    async zap(W, L, c) {
      const sign = sideSign(W.side);
      await Promise.all([
        W.moveTo(c.clone().add(V(-sign * 1.5, 0.7, 0)), 0.32),
        L.moveTo(c.clone().add(V(sign * 1.4, -0.1, 0)), 0.32),
      ]);
      for (let i = 0; i < 4; i++) {
        Sound.zap(0.7 + i * 0.12);
        lightning(W.pos(), L.pos());
        fxFlash(L.pos(), 0xc9b0ff);
        impact(0.35 + i * 0.12);
        await L.shake(0.13, 0.05 + i * 0.03);
        await wait(0.04);
      }
      Sound.boom();
      impact(1.1);
      burstParticles(L.pos(), 34, { speed: 6.5, size: 0.11, gravity: 2.5, colors: [0xffffff, 0xc9b0ff, 0x9b6dff] });
      smoke(L.pos(), 9, 0x4c4a52, 0.9);
      await L.destroy();
      await W.moveTo(c, 0.34, Ease.back);
    },
  };

  // Une lueur brève au point d'impact
  function fxFlash(pos, color = 0xffc84a) {
    particle(pos, V(), { color, size: 4.2, life: 0.2, gravity: 0, opacity: 0.8 });
  }

  const attackOf = (id) => {
    const w = weaponSet && weaponSet.weapons[id];
    return w && w.custom && ATTACKS[w.attack] ? w.attack : "charge";
  };

  async function fightWithAttack(wi, lo) {
    const c = CENTER();
    await rotateTo(wi.group, 0, 0, 0, 0.01);
    await ATTACKS[attackOf(wi.id)](objectActor(wi), objectActor(lo), c);
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

  // --- Les combats sans objet : ce sont les mains qui se battent ----------------------

  const handCenter = () => V(0, 0.45, 0.3);

  // Le poing s'abat sur la main adverse
  async function handSlam(W, L) {
    const c = handCenter();
    const sW = sideSign(W.side);
    const victim = handActor(L), hitter = handActor(W);
    await victim.moveTo(c.clone().add(V(sW * 0.1, -0.35, 0)), 0.26);
    Sound.whoosh(0.3, 0.09);
    W.dz = 0;
    const flexFrom = W.rz;
    await Promise.all([
      hitter.moveTo(c.clone().add(V(sW * 0.05, 2.1, 0.45)), 0.34, Ease.out),
      tween(0.34, (k) => { W.rz = flexFrom + (-0.5 - flexFrom) * k; }),
    ]);
    await wait(0.06);
    await Promise.all([
      hitter.moveTo(c.clone().add(V(sW * 0.05, 0.1, 0.45)), 0.13, Ease.in),
      tween(0.13, (k) => { W.rz = -0.5 + 0.6 * k; }, Ease.in),
    ]);
    Sound.rockHit(1);
    impact(1.4);
    const at = victim.pos();
    burstParticles(at, 24, { colors: [0xffd60a, 0xffe45c, 0xffffff], speed: 6, up: 1, size: 0.1, gravity: 8 });
    smoke(at, 6, 0x8a8894, 0.7);
    setPose(L, L.pose[0] < 0.3 ? "crumple" : "limp", 26);
    jolt(L, -24);
    const fromDy = L.dy;
    await tween(0.14, (k) => { L.dy = fromDy - k * 0.42; }, Ease.out);
    jolt(W, 12);
    await hitter.moveTo(c.clone().add(V(sW * 0.05, 0.75, 0.45)), 0.2, Ease.out);
    await handRecoil(L);
  }

  // Le V claque sur la main adverse, comme une paire de ciseaux
  async function handSnip(W, L) {
    const c = handCenter();
    const sW = sideSign(W.side);
    const victim = handActor(L), hitter = handActor(W);
    await Promise.all([
      victim.moveTo(c.clone().add(V(sW * 0.05, 0.05, 0)), 0.26),
      hitter.moveTo(c.clone().add(V(-sW * 0.75, 0.04, 0.42)), 0.28),
    ]);
    setPose(W, "scissorsWide", 26);
    await wait(0.12);
    for (let i = 0; i < 3; i++) {
      const from = W.dx;
      setPose(W, "scissorsClosed", 34);
      Sound.snip();
      await tween(0.09, (k) => { W.dx = from + k * 0.2; }, Ease.in);
      const at = victim.pos().add(V(0, rand(-0.2, 0.2), 0.2));
      burstParticles(at, 9, { colors: [0xffffff, 0xc9b0ff], speed: 3, size: 0.08, gravity: 5 });
      jolt(L, -8 - i * 5);
      impact(0.3 + i * 0.1);
      setPose(L, i === 2 ? "limp" : "relaxed", 18);
      setPose(W, "scissorsWide", 26);
      await wait(0.12);
    }
    setPose(W, "scissors", 18);
    Sound.snip();
    await handRecoil(L);
  }

  // La main ouverte se pose sur l'autre et l'emprisonne
  async function handWrap(W, L) {
    const c = handCenter();
    const sW = sideSign(W.side);
    const victim = handActor(L), hitter = handActor(W);
    await victim.moveTo(c.clone().add(V(sW * 0.4, -0.2, 0)), 0.26);
    Sound.whoosh(0.3, 0.08);
    // La main se retourne pour montrer son dos et couvre l'autre
    await Promise.all([
      hitter.moveTo(c.clone().add(V(sW * 0.55, 0.85, 0.9)), 0.34, Ease.out),
      tween(0.34, (k) => { W.roll = k * 2.7; W.rz = 0.1 - k * 0.3; }, Ease.inOut),
    ]);
    Sound.rustle(0.34);
    await hitter.moveTo(c.clone().add(V(sW * 0.55, 0.12, 0.9)), 0.2, Ease.in);
    setPose(W, "wrap", 20);
    Sound.clash();
    impact(0.7);
    jolt(L, -10);
    for (let i = 0; i < 3; i++) {
      const from = L.dy;
      Sound.rustle(0.1);
      await tween(0.12, (k) => { W.dy += Math.sin(k * PI) * 0.012; L.dy = from - k * 0.05; });
      jolt(L, -5);
    }
    setPose(L, "limp", 12);
    setPose(W, "open", 14);
    await Promise.all([
      handRecoil(L),
      tween(0.32, (k) => { W.roll = 2.7 * (1 - k); }, Ease.inOut),
    ]);
  }

  // Le feu ou l'eau jaillit des doigts
  async function handJet(W, L, element) {
    const c = handCenter();
    const sW = sideSign(W.side);
    const hitter = handActor(W), victim = handActor(L);
    await Promise.all([
      hitter.moveTo(c.clone().add(V(-sW * 1.15, 0.05, 0.15)), 0.28),
      victim.moveTo(c.clone().add(V(sW * 1.15, 0, 0.15)), 0.28),
    ]);
    setPose(W, "splay", 20);
    const fire = element === "fire";
    if (fire) Sound.burn(1.1);
    else Sound.splash(0.9);
    const palette = fire ? [0xffc84a, 0xf26a12, 0xfff2a8] : [0x4ab8ff, 0x9bdcff, 0x1487e8];
    let n = 0;
    await tween(1.05, (k) => {
      const from = hitter.pos(), to = victim.pos();
      for (let i = 0; i < 4; i++) {
        const v = to.clone().sub(from).multiplyScalar(2.2).add(V(rand(-0.35, 0.35), rand(-0.45, 0.45), rand(-0.2, 0.2)));
        particle(from.clone().add(V(rand(-0.1, 0.1), rand(-0.12, 0.12), 0)), v, { color: palette[i % 3], size: rand(0.12, 0.28), life: 0.44, gravity: fire ? -1 : 2, additive: fire });
      }
      n += 1;
      if (n % 8 === 0) {
        jolt(L, -5);
        smoke(to.clone().add(V(0, 0.1, 0)), 1, fire ? 0x4c4a52 : 0xeef0f4, 0.65);
      }
      // L'élément adverse s'éteint petit à petit
      if (k > 0.55) L.aura = null;
    }, Ease.linear);
    setPose(L, "limp", 12);
    setPose(W, GESTURE[element], 16);
    impact(0.6);
    await handRecoil(L);
  }

  // Les deux mains se cognent et rebondissent
  async function handClash(A, B) {
    const c = handCenter();
    const a = handActor(A), b = handActor(B);
    await Promise.all([a.moveTo(c.clone().add(V(-2, 0.2, 0)), 0.2, Ease.out), b.moveTo(c.clone().add(V(2, 0.2, 0)), 0.2, Ease.out)]);
    Sound.whoosh(0.13, 0.1);
    await Promise.all([a.moveTo(c.clone().add(V(-0.06, 0, 0)), 0.14, Ease.in), b.moveTo(c.clone().add(V(0.06, 0, 0)), 0.14, Ease.in)]);
    Sound.clash();
    impact(0.8);
    burstParticles(c, 24, { colors: [0xffffff, 0xffd60a, 0xc9b0ff], speed: 5.5, size: 0.11 });
    jolt(A, -10);
    jolt(B, -10);
    await Promise.all([handRecoil(A), handRecoil(B)]);
  }

  // Le même signe : les deux mains se rejoignent, dans un jaillissement d'étincelles
  async function handMeet(A, B) {
    const c = handCenter();
    const a = handActor(A), b = handActor(B);
    Sound.sparkle();
    await Promise.all([a.moveTo(c.clone().add(V(-1.2, 0.3, 0)), 0.3), b.moveTo(c.clone().add(V(1.2, 0.3, 0)), 0.3)]);
    await Promise.all([a.moveTo(c.clone().add(V(-0.05, 0.3, 0)), 0.18, Ease.in), b.moveTo(c.clone().add(V(0.05, 0.3, 0)), 0.18, Ease.in)]);
    Sound.sparkle();
    impact(0.6);
    const at = c.clone().add(V(0, 0.3, 0.3));
    burstParticles(at, 46, { speed: 5.5, gravity: 2, size: 0.13 });
    shockRing(at, 0xffd60a, 3.2);
    jolt(A, 12);
    jolt(B, 12);
    await wait(0.28);
    await Promise.all([handRecoilUp(A), handRecoilUp(B)]);
  }

  async function handRecoilUp(h) {
    const from = { dx: h.dx, dy: h.dy, dz: h.dz };
    await tween(0.3, (k) => {
      h.dx = from.dx * (1 - k);
      h.dy = from.dy * (1 - k);
      h.dz = from.dz * (1 - k);
    }, Ease.out);
  }

  // Des signes différents : les mains se ratent
  async function handMiss(A, B) {
    const c = handCenter();
    const a = handActor(A), b = handActor(B);
    Sound.whoosh(0.3, 0.1);
    await Promise.all([a.moveTo(c.clone().add(V(0.5, 0.55, 0)), 0.3), b.moveTo(c.clone().add(V(-0.5, -0.45, 0)), 0.3)]);
    jolt(A, -6);
    jolt(B, -6);
    await wait(0.1);
    await Promise.all([handRecoil(A), handRecoil(B)]);
  }

  async function handLate(W, L) {
    const hitter = handActor(W);
    const at = handPoint(L, 0.9, 0, 0.3);
    await hitter.moveTo(at.clone().add(V(0, 0.1, 0.4)), 0.3, Ease.in, 0.5);
    Sound.boom();
    impact(1);
    burstParticles(at, 24, { speed: 5, size: 0.11 });
    jolt(L, -16);
    await Promise.all([handRecoil(L), handRecoilUp(W)]);
  }

  async function gestureFight(a, b, result, mode) {
    const [A, B] = hands;
    if (a === null || b === null) {
      await (a === null ? handLate(B, A) : handLate(A, B));
      return;
    }
    if (mode === "mirror" || mode === "duo") {
      if (result.same) await handMeet(A, B);
      else await handMiss(A, B);
      return;
    }
    if (result.raw === 0) {
      await handClash(A, B);
      return;
    }
    const W = result.raw > 0 ? A : B;
    const L = result.raw > 0 ? B : A;
    const id = result.raw > 0 ? a : b;
    if (id === "rock") await handSlam(W, L);
    else if (id === "scissors") await handSnip(W, L);
    else if (id === "paper") await handWrap(W, L);
    else if (id === "fire" || id === "water") await handJet(W, L, id);
    else {
      const actorW = handActor(W), actorL = handActor(L);
      await ATTACKS[attackOf(id)](actorW, actorL, handCenter());
      setPose(L, "limp", 10);
    }
  }

  // --- Le déroulement d'une manche ----------------------------------------------

  async function chant() {
    for (let i = 0; i < 3; i++) {
      hooks.beat(i);
      // Le bras prend de l'élan, puis retombe en frappant
      await tween(0.16, (k) => hands.forEach((h) => {
        h.az = k * 0.11;
        h.dy = k * 0.06;
      }), Ease.out);
      await tween(0.13, (k) => hands.forEach((h) => {
        h.az = 0.11 * (1 - k) - 0.012 * k;
        h.dy = 0.06 * (1 - k);
      }), Ease.in);
      Sound.beat(i);
      hands.forEach((h) => jolt(h, -5 - i * 2));
      shake = Math.max(shake, 0.02 + i * 0.012);
      await wait(0.03);
    }
    hooks.beat(3);
  }

  // Comment chaque objet se tient. at : point de la main où il se place. roll : la main tourne la paume vers le haut.
  const HOLD = {
    rock: { pose: "cup", roll: -1.02, at: [0.86, 0, 0.74], scale: 0.86, rot: [0.3, 0.5, 0.1] },
    fire: { pose: "cradle", roll: -1.02, at: [0.74, 0, 1.02], scale: 0.86, rot: [0, 0, 0] },
    water: { pose: "cradle", roll: -1.02, at: [0.76, 0, 0.72], scale: 0.72, rot: [0, 0, 0] },
    custom: { pose: null, roll: -1.02, at: [0.76, 0, 1.06], scale: 0.72, rot: [0.18, 0, 0] },
    paper: { pose: "pinch", roll: -0.04, at: [1.53, 1.08, 0.3], scale: 0.86, rot: [0, 0, 0] },
    scissors: { pose: "grip", roll: -0.06, at: [2.02, 0.03, 0.34], scale: 0.9, rot: [0.08, 0, 0.02] },
  };

  // L'objet colle à la main tant qu'elle le tient
  function attachTo(w, h, info) {
    const rot = info.rot;
    w.follow = () => {
      w.group.position.copy(handPoint(h, info.at[0], info.at[1], info.at[2]));
      const tilt = (h.flex - 0.1) * sideSign(h.side);
      w.group.rotation.set(rot[0], rot[1], rot[2] * sideSign(h.side) + tilt);
    };
    w.follow();
  }

  async function revealObject(h, id) {
    const info = HOLD[id] || HOLD.custom;
    const custom = !HOLD[id];
    // La main s'ouvre en tournant, et l'objet apparaît dedans
    const fromRoll = h.roll;
    setPose(h, custom ? gesturePose(id) : info.pose, 15);
    await tween(0.1, (k) => { h.dy = -k * 0.1; h.az = -k * 0.03; }, Ease.out);
    const w = spawn(id, h.side);
    w.group.scale.setScalar(0.03);
    attachTo(w, h, info);
    if (id === "paper") w.params.curl = 1;
    if (id === "paper") w.params.wave = 0.25;
    if (id === "scissors") w.setOpen(0);
    if (id === "fire") w.power = 0.4;
    Sound.reveal();
    await Promise.all([
      tween(0.28, (k) => {
        h.roll = fromRoll + (info.roll - fromRoll) * k;
        h.dy = -0.1 + k * 0.28;
        h.az = -0.03 + k * 0.03;
        h.dx = k * 0.34;
      }, Ease.inOut),
      scaleTo(w.group, info.scale, 0.3, Ease.back),
    ]);
    jolt(h, -6);
    if (id === "paper") {
      Sound.rustle(0.3);
      await tween(0.3, (k) => { w.params.curl = 1 - k; }, Ease.out);
    } else if (id === "scissors") {
      for (let i = 0; i < 2; i++) {
        setPose(h, "gripOpen", 34);
        await tween(0.085, (k) => w.setOpen(k * 0.72));
        Sound.snip();
        setPose(h, "grip", 34);
        await tween(0.075, (k) => w.setOpen(0.72 - k * 0.64));
      }
    } else if (id === "rock") {
      Sound.rockHit(0.24);
      jolt(h, -14);
      await tween(0.14, (k) => { h.dy = 0.18 - Math.sin(k * PI) * 0.1; });
    } else if (id === "fire") {
      Sound.ignite();
      await tween(0.26, (k) => { w.power = 0.4 + k * 0.6; });
    } else if (id === "water") {
      Sound.bubble(4);
      await wait(0.22);
    } else {
      await wait(0.16);
    }
    return w;
  }

  // Elan vers l'arrière, puis la main lance l'objet et reste un instant ouverte
  async function launchObject(h, w) {
    const start = { dx: h.dx, dy: h.dy };
    await tween(0.13, (k) => {
      h.dx = start.dx - k * 0.42;
      h.dy = start.dy + k * 0.08;
      h.rz = 0.1 - k * 0.4;
    }, Ease.out);
    Sound.whoosh(0.2, 0.08);
    const fling = tween(0.11, (k) => {
      h.dx = start.dx - 0.42 + k * 0.98;
      h.rz = -0.3 + k * 0.62;
    }, Ease.in);
    await fling;
    w.follow = null;
    setPose(h, "splay", 22);
    const target = fightPos(w.side);
    const flight = Promise.all([
      moveTo(w.group, target, 0.28, Ease.out, 0.3),
      scaleTo(w.group, 1, 0.28, Ease.out),
      rotateTo(w.group, 0, 0, 0, 0.28),
    ]);
    const settle = (async () => {
      const from = { dx: h.dx, dy: h.dy, roll: h.roll };
      await wait(0.08);
      setPose(h, "relaxed", 9);
      await tween(0.4, (k) => {
        h.dx = from.dx * (1 - k);
        h.dy = from.dy * (1 - k);
        h.roll = from.roll * (1 - k);
        h.rz = 0.32 - k * 0.22;
      }, Ease.inOut);
    })();
    await Promise.all([flight, settle]);
  }

  async function objectFight(wa, wb, a, b, result, mode) {
    if (wa === null || wb === null) {
      await fightLate(wa || wb, hands[wa ? 1 : 0]);
    } else if (mode === "mirror" || mode === "duo") {
      if (result.same) await fightMirrorSame(wa, wb);
      else await fightMirrorMiss(wa, wb);
    } else if (result.raw === 0) {
      await fightClash(wa, wb);
    } else {
      const W = result.raw > 0 ? wa : wb;
      const L = result.raw > 0 ? wb : wa;
      // Un combat dessiné s'il existe, sinon l'attaque choisie à la création de l'arme
      await (FIGHTS[`${W.id}>${L.id}`] || fightWithAttack)(W, L);
    }
  }

  // Pour une seule manche : a, b = armes jouées (ou null), result = sortie de Rules.evaluate
  async function playRound({ a, b, result, mode }) {
    clearRound();
    hands.forEach((h) => {
      setPose(h, "fist", 18);
      h.aura = null;
    });
    await tween(0.16, (k) => hands.forEach((h) => {
      h.dx *= 1 - k;
      h.dy *= 1 - k;
      h.dz *= 1 - k;
      h.az *= 1 - k;
      h.roll *= 1 - k;
      h.rz += (0.1 - h.rz) * k;
    }));
    await chant();

    if (handStyle === "object") {
      const reveals = [a, b].map((id, side) => {
        if (id === null) {
          setPose(hands[side], "limp", 10);
          return Promise.resolve(null);
        }
        return revealObject(hands[side], id);
      });
      const [wa, wb] = await Promise.all(reveals);
      if (wa === null && wb === null) {
        Sound.draw();
        await tween(0.5, (k) => hands.forEach((h) => { h.rz = 0.1 - k * 0.5; h.dy = -k * 0.3; }));
        return;
      }
      hooks.fight();
      await Promise.all([wa, wb].map((w, side) => (w ? launchObject(hands[side], w) : Promise.resolve())));
      await wait(0.06);
      await objectFight(wa, wb, a, b, result, mode);
      [wa, wb].forEach((w) => { if (w && w.params) w.params.wave = 1; });
    } else {
      // Les mains font le signe, et se battent elles-mêmes : aucun objet n'apparaît
      [a, b].forEach((id, side) => {
        const h = hands[side];
        if (id === null) {
          setPose(h, "limp", 10);
          return;
        }
        setPose(h, gesturePose(id), 24);
        if (id === "fire" || id === "water") h.aura = id;
      });
      Sound.reveal();
      await tween(0.14, (k) => hands.forEach((h, side) => {
        if ([a, b][side] !== null) h.dx = k * 0.3;
        h.rz = 0.1 - k * 0.04;
      }), Ease.out);
      await wait(0.42);
      if (a === null && b === null) {
        Sound.draw();
        await tween(0.5, (k) => hands.forEach((h) => { h.rz = 0.1 - k * 0.5; h.dy = -k * 0.3; }));
        return;
      }
      hooks.fight();
      await gestureFight(a, b, result, mode);
      hands.forEach((h) => { h.aura = null; });
    }
    await finishHands(result, a, b);
  }

  // Fin : la main gagnante se lève en serrant le poing, l'autre tombe
  async function finishHands(result, a, b) {
    const both = result.winner === 2;
    const failed = !!result.fail;
    const moves = hands.map((h, side) => {
      const isWinner = both || result.winner === h.side;
      const isLoser = failed || (result.winner !== -1 && !both && !isWinner);
      if (isLoser) setPose(h, "limp", 9);
      else if (isWinner && handStyle === "object") setPose(h, "fist", 14);
      else if (isWinner && [a, b][side] !== null) setPose(h, gesturePose([a, b][side]), 14);
      const start = { dy: h.dy, rz: h.rz, dx: h.dx, dz: h.dz, roll: h.roll, az: h.az };
      const dy = isWinner ? 0.32 : isLoser ? -0.22 : 0;
      const rz = isWinner ? 0.3 : isLoser ? -0.28 : 0.1;
      return tween(0.36, (k) => {
        h.dy = start.dy + (dy - start.dy) * k;
        h.rz = start.rz + (rz - start.rz) * k;
        h.dx = start.dx * (1 - k);
        h.dz = start.dz * (1 - k);
        h.roll = start.roll * (1 - k);
        h.az = start.az * (1 - k);
      }, Ease.inOut);
    });
    await Promise.all(moves);
    // Deux petits coups de victoire
    const winners = hands.filter((h) => both || result.winner === h.side);
    for (let i = 0; i < 2 && winners.length; i++) {
      await tween(0.11, (k) => winners.forEach((h) => { h.az = k * 0.05; }), Ease.out);
      await tween(0.12, (k) => winners.forEach((h) => { h.az = 0.05 * (1 - k); }), Ease.in);
      winners.forEach((h) => jolt(h, -6));
    }
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
      h.dx = 0; h.dy = 0; h.dz = 0; h.rz = 0.1; h.az = 0; h.roll = 0; h.aura = null;
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
      if (w.follow) w.follow();
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
    renderer.localClippingEnabled = true;
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

  // pose : un nom de POSES, ou les états des doigts choisis dans la fenêtre de création
  function handThumbnail(side, pose = "open") {
    if (!ok) return null;
    const h = buildHand(side, cos(side).skin);
    setSkin(h, cos(side).skin);
    h.pose = typeof pose === "string" ? flatPose(POSES[pose]) : poseFromStates(pose);
    applyPose(h);
    h.mirror.scale.x = 1;
    // Le bras pivote au coude, loin hors du cadre : on replace la racine pour garder le poignet dans l'image
    const tilt = 0.5;
    h.root.position.set(-0.78 + ELBOW - ELBOW * Math.cos(tilt), -0.08 - ELBOW * Math.sin(tilt), 0);
    h.arm.rotation.z = tilt;
    h.wrist.rotation.set(0.05, 0.25, 0);
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
