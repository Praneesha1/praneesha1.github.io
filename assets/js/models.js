// Model configurations: part names match node names inside the GLB files.
// Units: engine in millimetres, ornithopter in model units (inches in the source file).
// All motion is computed from geometry measured in the exported meshes.

const PI = Math.PI;

/* ---------------------------------------------------------------- ENGINE */
const CYL = [
  { n: 1, x: 107.95, phase: 0 },
  { n: 2, x: 24.13, phase: PI },
  { n: 3, x: -59.69, phase: PI },
  { n: 4, x: -143.51, phase: 0 },
];
const E = { ay: 24.37, az: 3.57, r: 35.56, L: 127.0 };

function engineParts() {
  const p = {
    'Engine block': { group: 'Block', explode: [0, 0, 0], color: 0xB9B6AE },
    'Crankshaft':   { group: 'Crank train', pivot: [0, E.ay, E.az], explode: [0, -200, 0], color: 0x8E8A84 },
  };
  for (const c of CYL) {
    const bigEndY = E.ay + E.r * Math.cos(c.phase);
    const sx = c.n <= 2 ? 1 : 1;
    p[`Piston ${c.n}`]         = { group: `Cylinder ${c.n}`, explode: [0, 150, 0], color: 0xE6E3DC };
    p[`Piston pin ${c.n}`]     = { group: `Cylinder ${c.n}`, explode: [0, 150, 75], color: 0xC9C5BD };
    p[`Pin clip ${c.n}a`]      = { group: `Cylinder ${c.n}`, explode: [45, 150, 75], color: 0xC9C5BD };
    p[`Pin clip ${c.n}b`]      = { group: `Cylinder ${c.n}`, explode: [-45, 150, 75], color: 0xC9C5BD };
    p[`Connecting rod ${c.n}`] = { group: `Cylinder ${c.n}`, pivot: [0, bigEndY, E.az], explode: [0, 55, 0], color: 0xD3CFC6 };
    p[`Rod cap ${c.n}`]        = { group: `Cylinder ${c.n}`, pivot: [0, bigEndY, E.az], explode: [0, -70, 0], color: 0xA9A59D };
  }
  return p;
}

export const ENGINE = {
  id: 'engine',
  title: 'Four cylinder inline engine',
  units: 'mm',
  url: 'assets/models/engine.glb',
  defaultView: [-1.15, 0.72, 1.0],
  parts: engineParts(),
  motion: { label: 'Crank angle', unit: '°', period: 2 * PI, speed: 1.6 },
  kinematics(theta, set) {
    set('Crankshaft', { rot: [theta, 0, 0] });
    for (const c of CYL) {
      const psi = theta + c.phase;
      const s = E.r * Math.sin(psi);
      const cc = E.r * Math.cos(psi);
      const pinY = E.ay + cc + Math.sqrt(E.L * E.L - s * s);
      const restPinY = E.ay + E.r * Math.cos(c.phase) + E.L;
      const dy = pinY - restPinY;
      for (const nm of [`Piston ${c.n}`, `Piston pin ${c.n}`, `Pin clip ${c.n}a`, `Pin clip ${c.n}b`]) set(nm, { pos: [0, dy, 0] });
      const gamma = -Math.asin(s / E.L);
      const dPos = [0, cc - E.r * Math.cos(c.phase), s];
      set(`Connecting rod ${c.n}`, { pos: dPos, rot: [gamma, 0, 0] });
      set(`Rod cap ${c.n}`, { pos: dPos, rot: [gamma, 0, 0] });
    }
  },
  // Side view of one cylinder (looking along the crank axis). Coordinates in mm: X = z, Y = y.
  diagram: {
    viewBox: [-110, -80, 220, 320],
    flipY: true,
    draw(theta) {
      const items = [];
      const { ay, az, r, L } = E;
      const psi = theta;
      const pin = [az + r * Math.sin(psi), ay + r * Math.cos(psi)];
      const s = r * Math.sin(psi);
      const smallY = ay + r * Math.cos(psi) + Math.sqrt(L * L - s * s);
      // cylinder walls
      items.push({ t: 'line', x1: az - 34, y1: ay + L - r - 10, x2: az - 34, y2: ay + L + r + 60, cls: 'd-static' });
      items.push({ t: 'line', x1: az + 34, y1: ay + L - r - 10, x2: az + 34, y2: ay + L + r + 60, cls: 'd-static' });
      // crank circle path
      items.push({ t: 'circle', cx: az, cy: ay, r: r, cls: 'd-path' });
      // crank web
      items.push({ t: 'line', x1: az, y1: ay, x2: pin[0], y2: pin[1], cls: 'd-crank' });
      items.push({ t: 'circle', cx: az, cy: ay, r: 6, cls: 'd-joint' });
      // rod
      items.push({ t: 'line', x1: pin[0], y1: pin[1], x2: az, y2: smallY, cls: 'd-link' });
      items.push({ t: 'circle', cx: pin[0], cy: pin[1], r: 5, cls: 'd-joint' });
      // piston
      items.push({ t: 'rect', x: az - 32, y: smallY - 22, w: 64, h: 66, cls: 'd-body' });
      items.push({ t: 'circle', cx: az, cy: smallY, r: 5, cls: 'd-joint' });
      // labels
      items.push({ t: 'text', x: az + 44, y: ay + L + r + 40, s: 'TDC', cls: 'd-label' });
      items.push({ t: 'text', x: az + 44, y: ay + L - r - 4, s: 'BDC', cls: 'd-label' });
      items.push({ t: 'line', x1: az + 36, y1: ay + L + r, x2: az + 40, y2: ay + L + r, cls: 'd-static' });
      items.push({ t: 'line', x1: az + 36, y1: ay + L - r, x2: az + 40, y2: ay + L - r, cls: 'd-static' });
      items.push({ t: 'text', x: az + r + 10, y: ay - 4, s: `r = ${r.toFixed(1)}`, cls: 'd-label' });
      items.push({ t: 'text', x: az - 100, y: ay + L / 2, s: `L = ${L.toFixed(0)}`, cls: 'd-label' });
      return items;
    },
  },
  facts: [
    ['Parts in assembly', '26'],
    ['Cylinders', '4 inline'],
    ['Stroke', '71.1 mm'],
    ['Crank radius', '35.6 mm'],
    ['Rod length', '127.0 mm'],
    ['Bore spacing', '83.8 mm'],
    ['Firing pairs', '1 and 4, 2 and 3'],
  ],
};

/* ----------------------------------------------------------- ORNITHOPTER */
const O = {
  pinRest: [0.433, 0.25],  // y, z of the crank pin at rest
  r: 0.5,
  phi0: PI / 6,            // 30 degrees
  hinge: [2.5, 0],         // y, z of the wing hinge axis
  E: [3.265, 1.807],       // lever end at rest (y, |z|)
};
O.R = Math.hypot(O.E[0] - O.hinge[0], O.E[1] - O.hinge[1]);
// The crank pin sits at z = +0.25, so the two links are different lengths.
O.L = { L: Math.hypot(O.E[0] - O.pinRest[0], -O.E[1] - O.pinRest[1]), R: Math.hypot(O.E[0] - O.pinRest[0], O.E[1] - O.pinRest[1]) };

function circleIntersect(H, Rr, P, L, prev) {
  const dy = P[0] - H[0], dz = P[1] - H[1];
  const d = Math.hypot(dy, dz);
  const a = (Rr * Rr - L * L + d * d) / (2 * d);
  const h2 = Rr * Rr - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const bx = H[0] + (a * dy) / d, bz = H[1] + (a * dz) / d;
  const px = -dz / d, pz = dy / d;
  const s1 = [bx + h * px, bz + h * pz];
  const s2 = [bx - h * px, bz - h * pz];
  const d1 = Math.hypot(s1[0] - prev[0], s1[1] - prev[1]);
  const d2 = Math.hypot(s2[0] - prev[0], s2[1] - prev[1]);
  return d1 <= d2 ? s1 : s2;
}

const orniState = { prevE: { L: [O.E[0], -O.E[1]], R: [O.E[0], O.E[1]] } };

function orniSolve(theta) {
  const ang = O.phi0 + theta;
  const pin = [O.r * Math.cos(ang), O.r * Math.sin(ang)];
  const out = { pin };
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? -1 : 1;
    const Erest = [O.E[0], sgn * O.E[1]];
    const Ecur = circleIntersect(O.hinge, O.R, pin, O.L[side], orniState.prevE[side]);
    orniState.prevE[side] = Ecur;
    const a0 = Math.atan2(Erest[1] - O.hinge[1], Erest[0] - O.hinge[0]);
    const a1 = Math.atan2(Ecur[1] - O.hinge[1], Ecur[0] - O.hinge[0]);
    const l0 = Math.atan2(Erest[1] - O.pinRest[1], Erest[0] - O.pinRest[0]);
    const l1 = Math.atan2(Ecur[1] - pin[1], Ecur[0] - pin[0]);
    out[side] = { E: Ecur, wingRot: a1 - a0, linkRot: l1 - l0 };
  }
  return out;
}

export const ORNITHOPTER = {
  id: 'ornithopter',
  title: 'Ornithopter flapping wing mechanism',
  units: 'in',
  url: 'assets/models/ornithopter.glb',
  defaultView: [1.0, 0.55, 1.25],
  parts: {
    'Main frame':      { group: 'Frame', explode: [0, 0, 0], color: 0xC8413A },
    'Fuselage shaft':  { group: 'Frame', explode: [0, -2.2, 0], color: 0x4A7FD4 },
    'Crank':           { group: 'Drive', pivot: [0, 0, 0], explode: [2.2, 0, 0], color: 0x2A2A2C },
    'Left link':       { group: 'Drive', pivot: [0, O.pinRest[0], O.pinRest[1]], explode: [2.2, 1.2, -1.2], color: 0x2A2A2C },
    'Right link':      { group: 'Drive', pivot: [0, O.pinRest[0], O.pinRest[1]], explode: [2.2, 1.2, 1.2], color: 0x2A2A2C },
    'Left wing root':  { group: 'Left wing', pivot: [0, O.hinge[0], O.hinge[1]], explode: [0, 2.5, -1.5], color: 0x2A2A2C },
    'Left wing':       { group: 'Left wing', pivot: [0, O.hinge[0], O.hinge[1]], explode: [0, 2.5, -7], color: 0xEDEBE4 },
    'Right wing root': { group: 'Right wing', pivot: [0, O.hinge[0], O.hinge[1]], explode: [0, 2.5, 1.5], color: 0x2A2A2C },
    'Right wing':      { group: 'Right wing', pivot: [0, O.hinge[0], O.hinge[1]], explode: [0, 2.5, 7], color: 0xEDEBE4 },
    'Tail bracket':    { group: 'Tail', explode: [-2.5, -1.5, 0], color: 0x2A2A2C },
    'Rear hub':        { group: 'Tail', explode: [-2.5, -3.2, 0], color: 0xC8413A },
    'Tail plane':      { group: 'Tail', explode: [-6, 0, 0], color: 0xEDEBE4 },
  },
  motion: { label: 'Crank angle', unit: '°', period: 2 * PI, speed: 2.4 },
  kinematics(theta, set) {
    const k = orniSolve(theta);
    set('Crank', { rot: [theta, 0, 0] });
    const dPin = [0, k.pin[0] - O.pinRest[0], k.pin[1] - O.pinRest[1]];
    set('Left link', { pos: dPin, rot: [k.L.linkRot, 0, 0] });
    set('Right link', { pos: dPin, rot: [k.R.linkRot, 0, 0] });
    set('Left wing', { rot: [k.L.wingRot, 0, 0] });
    set('Left wing root', { rot: [k.L.wingRot, 0, 0] });
    set('Right wing', { rot: [k.R.wingRot, 0, 0] });
    set('Right wing root', { rot: [k.R.wingRot, 0, 0] });
  },
  // Front view (looking along the fuselage). X = z, Y = y.
  diagram: {
    viewBox: [-12, -2.5, 24, 14],
    flipY: true,
    draw(theta) {
      const k = orniSolve(theta);
      const it = [];
      const [hy, hz] = O.hinge;
      it.push({ t: 'line', x1: 0, y1: -0.5, x2: 0, y2: hy, cls: 'd-static' });
      it.push({ t: 'circle', cx: 0, cy: 0, r: O.r, cls: 'd-path' });
      it.push({ t: 'line', x1: 0, y1: 0, x2: k.pin[1], y2: k.pin[0], cls: 'd-crank' });
      it.push({ t: 'circle', cx: 0, cy: 0, r: 0.16, cls: 'd-joint' });
      for (const side of ['L', 'R']) {
        const E = k[side].E;
        const sgn = side === 'L' ? -1 : 1;
        it.push({ t: 'line', x1: k.pin[1], y1: k.pin[0], x2: E[1], y2: E[0], cls: 'd-link' });
        it.push({ t: 'line', x1: hz, y1: hy, x2: E[1], y2: E[0], cls: 'd-crank' });
        // wing spar: extends from hinge along lever direction scaled to span
        const ang = Math.atan2(E[0] - hy, E[1] - hz);
        const span = 9.5;
        it.push({ t: 'line', x1: hz, y1: hy, x2: hz + span * Math.cos(ang), y2: hy + span * Math.sin(ang), cls: 'd-wing' });
        it.push({ t: 'circle', cx: E[1], cy: E[0], r: 0.14, cls: 'd-joint' });
        it.push({ t: 'text', x: sgn * 7.4, y: hy + 5.2, s: side === 'L' ? 'LEFT WING' : 'RIGHT WING', cls: 'd-label', anchor: 'middle' });
      }
      it.push({ t: 'circle', cx: k.pin[1], cy: k.pin[0], r: 0.14, cls: 'd-joint' });
      it.push({ t: 'circle', cx: hz, cy: hy, r: 0.16, cls: 'd-joint' });
      it.push({ t: 'text', x: 0.9, y: -0.9, s: 'CRANK r = 0.5', cls: 'd-label' });
      it.push({ t: 'text', x: 0.5, y: hy + 0.1, s: 'HINGE', cls: 'd-label' });
      return it;
    },
  },
  facts: [
    ['Parts in assembly', '12'],
    ['Mechanism', 'One crank, two links'],
    ['Crank radius', '0.50 in'],
    ['Link lengths', '3.50 in left, 3.23 in right'],
    ['Wing lever arm', '1.96 in'],
    ['Wing hinge height', '2.50 in'],
    ['Wing span', '35.3 in'],
  ],
};

export const MODELS = { engine: ENGINE, ornithopter: ORNITHOPTER };
