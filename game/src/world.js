// Palmera City itself: a sun-soaked grid of avenues and streets above a
// harbour. The city is dealt from the seeded random stream — blocks of pastel
// buildings, parks, car parks, palms and lamps — with the named places the
// story needs (the safehouse, Delia's diner, the respray garage, the gun shop,
// the harbour warehouse, the motel and the repo lot) placed on fixed blocks so
// every seed tells the same story in the same streets.

import { GRID, WORLD, SHOP_NAMES } from './config.js';

const ROOF_COLORS = [
  '#f6d8b1', '#f2b8c6', '#bfe3dd', '#f9e79f', '#d5c6e8', '#f5c396',
  '#c8e6c9', '#ffe0b2', '#efb3a0', '#a5d6e8', '#f7ead1', '#d7ccc8',
];

function rect(x, y, w, h) {
  return { x, y, w, h, x2: x + w, y2: y + h };
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x2 && y >= r.y && y <= r.y2;
}

/** Push a circle out of a rectangle; returns the correction, or null when clear. */
export function circleRectPush(x, y, radius, r) {
  const nearX = Math.max(r.x, Math.min(x, r.x2));
  const nearY = Math.max(r.y, Math.min(y, r.y2));
  const dx = x - nearX;
  const dy = y - nearY;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: nearX + (dx / d) * radius, y: nearY + (dy / d) * radius };
  }
  // Centre inside the rect: leave by the nearest face.
  const left = x - r.x;
  const right = r.x2 - x;
  const top = y - r.y;
  const bottom = r.y2 - y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: r.x - radius, y };
  if (min === right) return { x: r.x2 + radius, y };
  if (min === top) return { x, y: r.y - radius };
  return { x, y: r.y2 + radius };
}

/** Distance from a point to a rectangle (0 when inside). */
export function pointRectDistance(x, y, r) {
  const dx = Math.max(r.x - x, 0, x - r.x2);
  const dy = Math.max(r.y - y, 0, y - r.y2);
  return Math.hypot(dx, dy);
}

/**
 * Cast a ray against the building rectangles. Returns the distance to the
 * first wall, or maxDist when the way is clear. Slab test per rectangle —
 * the city is small enough that this is cheap even per bullet.
 */
export function raycastBuildings(buildings, ox, oy, angle, maxDist) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = maxDist;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    let tmin = 0;
    let tmax = best;
    if (Math.abs(dx) < 1e-9) {
      if (ox < b.x || ox > b.x2) continue;
    } else {
      let t1 = (b.x - ox) / dx;
      let t2 = (b.x2 - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dy) < 1e-9) {
      if (oy < b.y || oy > b.y2) continue;
    } else {
      let t1 = (b.y - oy) / dy;
      let t2 = (b.y2 - oy) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best && tmin >= 0) best = tmin;
  }
  return best;
}

/** True when the point is on asphalt (a road or the promenade). */
export function isOnRoad(x, y) {
  if (y > WORLD.waterY) return false;
  if (Math.abs(y - GRID.promenadeY) <= GRID.roadHalf) return x > 120 && x < WORLD.width - 120;
  for (let i = 0; i < GRID.avenueX.length; i += 1) {
    if (Math.abs(x - GRID.avenueX[i]) <= GRID.roadHalf) return true;
  }
  for (let j = 0; j < GRID.streetY.length; j += 1) {
    if (Math.abs(y - GRID.streetY[j]) <= GRID.roadHalf) return true;
  }
  return false;
}

export function isWater(x, y) {
  return y > WORLD.waterY;
}

/** Blocks: the buildable rectangles between the roads, row by row. */
function blockRects() {
  const blocks = [];
  const xs = GRID.avenueX;
  const ys = [...GRID.streetY, GRID.promenadeY];
  for (let row = 0; row < ys.length - 1; row += 1) {
    for (let col = 0; col < xs.length - 1; col += 1) {
      blocks.push({
        col,
        row,
        rect: rect(
          xs[col] + GRID.roadHalf + 16,
          ys[row] + GRID.roadHalf + 16,
          xs[col + 1] - xs[col] - GRID.roadHalf * 2 - 32,
          ys[row + 1] - ys[row] - GRID.roadHalf * 2 - 32,
        ),
      });
    }
  }
  return blocks;
}

export function createWorld(random) {
  const buildings = [];
  const palms = [];
  const lamps = [];
  const zones = {};
  const blocks = blockRects();
  let nameIndex = random.int(0, SHOP_NAMES.length - 1);

  function nextName() {
    nameIndex = (nameIndex + 1) % SHOP_NAMES.length;
    return SHOP_NAMES[nameIndex];
  }

  function addBuilding(r, floors, name, kind) {
    const b = {
      ...r,
      floors,
      color: random.pick(ROOF_COLORS),
      shade: random.range(0.92, 1.05),
      name: name ?? null,
      kind: kind ?? 'block',
      signHue: random.int(0, 5),
      roofProps: random.int(1, 3),
    };
    buildings.push(b);
    return b;
  }

  // The named places sit on fixed blocks so the story geography never moves.
  const special = new Map([
    ['0,2', 'safehouse'],
    ['4,1', 'diner'],
    ['2,3', 'gunshop'],
    ['6,2', 'respray'],
    ['7,0', 'motel'],
    ['5,4', 'repolot'],
    ['3,4', 'park'],
    ['1,1', 'park'],
    ['6,4', 'carpark'],
    ['2,0', 'carpark'],
  ]);

  for (const block of blocks) {
    const key = `${block.col},${block.row}`;
    const kind = special.get(key);
    const r = block.rect;
    if (kind === 'park') {
      block.kind = 'park';
      const count = random.int(6, 10);
      for (let i = 0; i < count; i += 1) {
        palms.push({ x: random.range(r.x + 20, r.x2 - 20), y: random.range(r.y + 20, r.y2 - 20), s: random.range(0.8, 1.3) });
      }
      continue;
    }
    if (kind === 'carpark') {
      block.kind = 'carpark';
      continue;
    }
    if (kind === 'safehouse') {
      const b = addBuilding(rect(r.x + 60, r.y + 40, 240, 200), 6, 'CASA VALE', 'safehouse');
      zones.safehouse = { x: b.x + b.w / 2, y: b.y2 + 26, label: 'Safehouse', building: b };
      continue;
    }
    if (kind === 'diner') {
      const b = addBuilding(rect(r.x + 40, r.y + 60, 300, 170), 2, "DELIA'S DINER", 'diner');
      zones.diner = { x: b.x + b.w / 2, y: b.y2 + 26, label: "Delia's Diner", building: b };
      continue;
    }
    if (kind === 'gunshop') {
      const b = addBuilding(rect(r.x + 70, r.y + 50, 220, 180), 3, 'ARMERÍA BRISA', 'gunshop');
      zones.gunshop = { x: b.x + b.w / 2, y: b.y2 + 26, label: 'Armería Brisa (gun shop)', building: b };
      continue;
    }
    if (kind === 'motel') {
      const b = addBuilding(rect(r.x + 30, r.y + 40, 320, 150), 3, 'MOTEL BRISA', 'motel');
      zones.motel = { x: b.x + b.w / 2, y: b.y2 + 26, label: 'Motel Brisa', building: b };
      continue;
    }
    if (kind === 'respray') {
      const b = addBuilding(rect(r.x + 30, r.y + 30, 180, 150), 2, 'TALLER ROSA', 'garage');
      zones.respray = {
        x: r.x + 250, y: r.y + 200, label: 'Taller Rosa (respray)',
        rect: rect(r.x + 190, r.y + 150, 130, 110), building: b,
      };
      continue;
    }
    if (kind === 'repolot') {
      block.kind = 'repolot';
      zones.repolot = { x: r.x + r.w / 2, y: r.y + r.h / 2, label: 'Repo lot', rect: r };
      // A low fence office that still blocks movement and bullets.
      addBuilding(rect(r.x + 20, r.y + 20, 110, 80), 1, 'REPO OFFICE', 'office');
      continue;
    }
    // An ordinary block: one, two or four buildings dealt by the stream.
    block.kind = 'buildings';
    const layout = random.int(0, 2);
    if (layout === 0) {
      addBuilding(rect(r.x + 26, r.y + 26, r.w - 52, r.h - 52), random.int(4, 14), random.chance(0.5) ? nextName() : null);
    } else if (layout === 1) {
      const w = (r.w - 66) / 2;
      addBuilding(rect(r.x + 16, r.y + 30, w, r.h - 60), random.int(3, 11), random.chance(0.45) ? nextName() : null);
      addBuilding(rect(r.x + 50 + w, r.y + 30, w, r.h - 60), random.int(3, 11), random.chance(0.45) ? nextName() : null);
    } else {
      const w = (r.w - 66) / 2;
      const h = (r.h - 66) / 2;
      for (let q = 0; q < 4; q += 1) {
        const qx = r.x + 16 + (q % 2) * (w + 34);
        const qy = r.y + 16 + Math.floor(q / 2) * (h + 34);
        addBuilding(rect(qx, qy, w, h), random.int(2, 9), random.chance(0.35) ? nextName() : null);
      }
    }
  }

  // The harbour warehouse: a long dock shed south of the promenade.
  const warehouse = addBuilding(rect(3520, 2960, 560, 120), 2, 'MUELLE 9 — WAREHOUSE', 'warehouse');
  zones.warehouse = { x: warehouse.x + warehouse.w / 2, y: warehouse.y - 24, label: 'Muelle 9 warehouse', building: warehouse };
  zones.harbour = { x: 3800, y: 3120, label: 'The harbour' };

  // Palms along the promenade and scattered on the grass verges.
  for (let x = 180; x < WORLD.width - 160; x += random.int(70, 130)) {
    palms.push({ x, y: GRID.promenadeY - GRID.roadHalf - 22, s: random.range(0.85, 1.35) });
    if (random.chance(0.6)) palms.push({ x: x + 30, y: WORLD.waterY - 14, s: random.range(0.8, 1.2) });
  }
  for (let i = 0; i < 60; i += 1) {
    const x = random.range(140, WORLD.width - 140);
    const y = random.range(140, WORLD.waterY - 60);
    if (!isOnRoad(x, y)) palms.push({ x, y, s: random.range(0.7, 1.15) });
  }

  // Lamps at the intersections and along the promenade.
  for (const ax of GRID.avenueX) {
    for (const sy of GRID.streetY) {
      lamps.push({ x: ax - GRID.roadHalf - 8, y: sy - GRID.roadHalf - 8 });
      lamps.push({ x: ax + GRID.roadHalf + 8, y: sy + GRID.roadHalf + 8 });
    }
  }
  for (let x = 256; x < WORLD.width - 200; x += 256) {
    lamps.push({ x, y: GRID.promenadeY - GRID.roadHalf - 8 });
  }

  // Parked-car spots: nose-to-kerb along the avenues and the car parks.
  const parkedSpots = [];
  for (const block of blocks) {
    if (block.kind === 'carpark') {
      const r = block.rect;
      for (let i = 0; i < 6; i += 1) {
        parkedSpots.push({ x: r.x + 50 + (i % 3) * 120, y: r.y + 70 + Math.floor(i / 3) * 130, angle: Math.PI / 2 });
      }
    }
  }
  for (const ax of GRID.avenueX) {
    for (let y = 470; y < 2950; y += 340) {
      if (GRID.streetY.some((sy) => Math.abs(y - sy) < 130)) continue;
      parkedSpots.push({ x: ax - GRID.roadHalf + 17, y, angle: -Math.PI / 2 });
      parkedSpots.push({ x: ax + GRID.roadHalf - 17, y: y + 160, angle: Math.PI / 2 });
    }
  }

  return {
    buildings,
    palms,
    lamps,
    zones,
    blocks,
    parkedSpots,
    spawn: { x: zones.safehouse.x, y: zones.safehouse.y + 44 },
  };
}

/** Keep a circle inside the world and out of the water and the buildings. */
export function collideCircle(world, x, y, radius) {
  let hit = false;
  x = Math.max(radius + 60, Math.min(WORLD.width - 60 - radius, x));
  const maxY = isWater(x, y) ? WORLD.waterY - radius : WORLD.height - 60 - radius;
  y = Math.max(radius + 60, Math.min(maxY, y));
  for (let i = 0; i < world.buildings.length; i += 1) {
    const push = circleRectPush(x, y, radius, world.buildings[i]);
    if (push) {
      x = push.x;
      y = push.y;
      hit = true;
    }
  }
  return { x, y, hit };
}
