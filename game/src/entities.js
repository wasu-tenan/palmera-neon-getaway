// The living city: the player on foot and in cars, traffic that drives the
// grid and brakes for trouble, pedestrians who wander the pavements and flee
// from danger, and police Interceptors who hunt by stars. One physics step
// drives every car — the player's, the traffic's and the law's — so a stolen
// taxi handles exactly like the one that was cruising the avenue a moment ago.

import { CAR, GRID, HEAT, WALKER, WORLD } from './config.js';
import { collideCircle, isOnRoad, pointRectDistance, raycastBuildings } from './world.js';

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function makeCar(x, y, angle, color, opts = {}) {
  return {
    x, y, angle,
    vx: 0, vy: 0,
    color,
    hp: CAR.health,
    parked: !!opts.parked,
    cop: !!opts.cop,
    hasDriver: !!opts.hasDriver,
    wreck: false,
    lightPhase: Math.random() * 6,
    // Traffic state: the grid node it is heading for, and the one it left.
    node: null,
    fromNode: null,
    cruiseSpeed: opts.cruiseSpeed ?? 300,
    slotAngle: opts.slotAngle ?? 0,
    stuckTime: 0,
    lastX: x,
    lastY: y,
  };
}

export function carSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

/** The one car step: throttle, steering, drift, drag. Control is -1..1. */
export function stepCarPhysics(S, car, throttle, steer, handbrake, dt) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let forward = car.vx * fx + car.vy * fy;
  let lateral = car.vx * -fy + car.vy * fx;

  if (!car.wreck) {
    if (throttle > 0) forward += throttle * CAR.accel * dt * (forward < 0 ? 2.2 : 1);
    else if (throttle < 0) {
      if (forward > 30) forward += throttle * CAR.brake * dt;
      else forward += throttle * CAR.accel * 0.55 * dt;
    }
    forward -= forward * CAR.drag * dt;
    if (Math.abs(forward) < 4 && throttle === 0) forward = 0;
    forward = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, forward));
    const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
    lateral *= Math.max(0, 1 - grip * dt);
    if (handbrake) forward -= forward * 1.4 * dt;
    const steerAuthority = Math.max(-1, Math.min(1, forward / 240));
    car.angle += steer * CAR.steerMax * 2.6 * steerAuthority * dt;
  } else {
    forward -= forward * 3 * dt;
    lateral *= Math.max(0, 1 - 4 * dt);
  }

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * forward + -nfy * lateral;
  car.vy = nfy * forward + nfx * lateral;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Buildings and the sea stop a car hard, and it costs paint and health.
  const before = Math.hypot(car.vx, car.vy);
  const resolved = collideCircle(S.world, car.x, car.y, 24);
  if (resolved.hit || resolved.x !== car.x || resolved.y !== car.y) {
    car.x = resolved.x;
    car.y = resolved.y;
    const after = Math.hypot(car.vx, car.vy);
    if (before > 170) {
      damageCar(S, car, (before - 170) * 0.055, true);
      if (car === S.player.car) S.sounds.push(['crash', Math.min(1, before / 600)]);
      spawnSparks(S, car.x, car.y, 8);
    }
    car.vx *= 0.35;
    car.vy *= 0.35;
  }
}

export function damageCar(S, car, amount, byPlayerAction) {
  if (car.wreck) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.wreck = true;
    spawnSmoke(S, car.x, car.y, 14);
    if (car.cop && byPlayerAction) S.stats.copsWrecked += 1;
  }
}

/** Circle-against-circle traffic collisions: a shunt, a dent, a noise. */
export function collideCars(S, dt) {
  const all = S.allCars;
  for (let i = 0; i < all.length; i += 1) {
    const a = all[i];
    for (let j = i + 1; j < all.length; j += 1) {
      const b = all[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 48 * 48 || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (48 - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impulse = -rel * 0.72;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        if (-rel > 130) {
          damageCar(S, a, (-rel - 110) * 0.05, b === S.player.car);
          damageCar(S, b, (-rel - 110) * 0.05, a === S.player.car);
          spawnSparks(S, (a.x + b.x) / 2, (a.y + b.y) / 2, 6);
          if (a === S.player.car || b === S.player.car) {
            S.sounds.push(['crash', Math.min(1, -rel / 550)]);
            if ((a.cop || b.cop)) addHeat(S, HEAT.hitCop, S.player.x, S.player.y);
            else if (S.player.car) addHeat(S, HEAT.hitCar, S.player.x, S.player.y);
          }
        }
      }
    }
  }
  void dt;
}

// ---------------------------------------------------------------------------
// Particles and floating text: short-lived dressing the renderer paints.

export function spawnParticles(S, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = S.random.range(0, Math.PI * 2);
    const v = S.random.range(speed * 0.3, speed);
    S.fx.particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      t: 0,
      life: S.random.range(life * 0.5, life),
      color,
      size: S.random.range(size * 0.6, size * 1.3),
    });
  }
}

export function spawnSparks(S, x, y, count) {
  spawnParticles(S, x, y, count, '#ffd23f', 190, 0.4, 3);
}

export function spawnSmoke(S, x, y, count) {
  spawnParticles(S, x, y, count, 'rgba(70,70,78,0.8)', 46, 1.15, 7);
}

export function addFloater(S, x, y, text, color) {
  S.fx.floaters.push({ x, y, text, color, t: 0, life: 1.5 });
}

export function stepFx(S, dt) {
  const p = S.fx.particles;
  for (let i = p.length - 1; i >= 0; i -= 1) {
    p[i].t += dt;
    if (p[i].t >= p[i].life) { p.splice(i, 1); continue; }
    p[i].x += p[i].vx * dt;
    p[i].y += p[i].vy * dt;
    p[i].vx *= 1 - 2.4 * dt;
    p[i].vy *= 1 - 2.4 * dt;
  }
  const f = S.fx.floaters;
  for (let i = f.length - 1; i >= 0; i -= 1) {
    f[i].t += dt;
    f[i].y -= 26 * dt;
    if (f[i].t >= f[i].life) f.splice(i, 1);
  }
  const t = S.fx.tracers;
  for (let i = t.length - 1; i >= 0; i -= 1) {
    t[i].t += dt;
    if (t[i].t >= t[i].life) t.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Heat and witnesses.

export function starsOf(S) {
  if (S.heat <= 0) return 0;
  return Math.min(5, Math.ceil(S.heat / HEAT.perStar));
}

/** A crime only counts when someone is close enough to see it happen. */
export function witnessed(S, x, y) {
  for (const cop of S.cops) {
    if (!cop.wreck && dist(x, y, cop.x, cop.y) < HEAT.witnessRange + 90) return true;
  }
  for (const ped of S.peds) {
    if (ped.mode !== 'down' && dist(x, y, ped.x, ped.y) < HEAT.witnessRange) return true;
  }
  return false;
}

export function addHeat(S, points, x, y) {
  if (points <= 0) return;
  if (!witnessed(S, x, y)) return;
  const before = starsOf(S);
  S.heat = Math.min(HEAT.max, S.heat + points);
  S.lastCrimeAt = S.time;
  if (starsOf(S) > before) addFloater(S, S.player.x, S.player.y - 34, '★'.repeat(starsOf(S)), '#ffd23f');
}

export function scarePeds(S, x, y, range) {
  S.threat = { x, y, until: S.time + 3.2 };
  for (const ped of S.peds) {
    if (ped.mode === 'walk' && dist(x, y, ped.x, ped.y) < range) ped.mode = 'flee';
  }
}

// ---------------------------------------------------------------------------
// The player on foot.

export function stepPlayerOnFoot(S, input, dt) {
  const p = S.player;
  p.attackCd = Math.max(0, p.attackCd - dt);
  if (p.stagger > 0) p.stagger -= dt;

  let mx = 0;
  let my = 0;
  if (input.held('KeyW', 'ArrowUp')) my -= 1;
  if (input.held('KeyS', 'ArrowDown')) my += 1;
  if (input.held('KeyA', 'ArrowLeft')) mx -= 1;
  if (input.held('KeyD', 'ArrowRight')) mx += 1;
  const moving = (mx !== 0 || my !== 0) && p.stagger <= 0;
  const sprint = input.held('ShiftLeft', 'ShiftRight');
  const speed = sprint ? WALKER.sprintSpeed : WALKER.walkSpeed;
  if (moving) {
    const len = Math.hypot(mx, my);
    const tx = (mx / len) * speed;
    const ty = (my / len) * speed;
    p.vx += (tx - p.vx) * Math.min(1, WALKER.accel * dt / speed);
    p.vy += (ty - p.vy) * Math.min(1, WALKER.accel * dt / speed);
    p.walkPhase += dt * (sprint ? 13 : 9);
  } else {
    p.vx *= Math.max(0, 1 - 12 * dt);
    p.vy *= Math.max(0, 1 - 12 * dt);
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const resolved = collideCircle(S.world, p.x, p.y, WALKER.radius);
  p.x = resolved.x;
  p.y = resolved.y;

  // Aim: the facing follows the mouse; while standing still it follows travel.
  const aim = S.aimWorld;
  if (aim) p.angle = Math.atan2(aim.y - p.y, aim.x - p.x);
  else if (moving) p.angle = Math.atan2(p.vy, p.vx);

  if (input.mouse.down && p.attackCd <= 0 && p.stagger <= 0) {
    if (S.weapon.selected === 'pistol' && S.weapon.owned) firePistol(S);
    else meleeAttack(S);
  }

  // Slow health recovery once the street has been calm for a while.
  if (S.time - S.lastHurtAt > 7 && p.health < WALKER.health) {
    p.health = Math.min(WALKER.health, p.health + 3.2 * dt);
  }
}

export function meleeAttack(S) {
  const p = S.player;
  p.attackCd = WALKER.fistCooldown;
  p.punchT = 0.18;
  S.sounds.push(['punch']);
  const range = WALKER.fistRange;
  const tx = p.x + Math.cos(p.angle) * range * 0.7;
  const ty = p.y + Math.sin(p.angle) * range * 0.7;
  for (const ped of S.peds) {
    if (ped.mode === 'down' || ped.mode === 'passenger') continue;
    if (dist(tx, ty, ped.x, ped.y) < 30) {
      hurtPed(S, ped, WALKER.fistDamage, p.angle);
      addHeat(S, HEAT.hitPed, ped.x, ped.y);
      scarePeds(S, ped.x, ped.y, 170);
      return;
    }
  }
  for (const car of S.allCars) {
    if (pointRectDistance(tx, ty, { x: car.x - 24, y: car.y - 24, x2: car.x + 24, y2: car.y + 24 }) < 12) {
      damageCar(S, car, 4, true);
      spawnSparks(S, tx, ty, 3);
      if (car.cop) addHeat(S, HEAT.hitCop, car.x, car.y);
      return;
    }
  }
}

export function firePistol(S) {
  const p = S.player;
  if (S.weapon.ammo <= 0) {
    p.attackCd = 0.3;
    S.sounds.push(['denied']);
    addFloater(S, p.x, p.y - 30, 'NO AMMO', '#ff8a80');
    return;
  }
  p.attackCd = 0.21;
  S.weapon.ammo -= 1;
  S.sounds.push(['shot']);
  const angle = p.angle;
  const wallDist = raycastBuildings(S.world.buildings, p.x, p.y, angle, 620);
  let bestDist = wallDist;
  let hitPed = null;
  let hitCar = null;
  const testCircle = (x, y, r) => {
    const dx = x - p.x;
    const dy = y - p.y;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along < 0 || along > bestDist) return -1;
    const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    return perp < r ? along : -1;
  };
  for (const ped of S.peds) {
    if (ped.mode === 'down' || ped.mode === 'passenger') continue;
    const d = testCircle(ped.x, ped.y, 14);
    if (d >= 0 && d < bestDist) { bestDist = d; hitPed = ped; hitCar = null; }
  }
  for (const car of S.allCars) {
    const d = testCircle(car.x, car.y, 27);
    if (d >= 0 && d < bestDist) { bestDist = d; hitCar = car; hitPed = null; }
  }
  const hx = p.x + Math.cos(angle) * bestDist;
  const hy = p.y + Math.sin(angle) * bestDist;
  S.fx.tracers.push({ x1: p.x + Math.cos(angle) * 18, y1: p.y + Math.sin(angle) * 18, x2: hx, y2: hy, t: 0, life: 0.07 });
  spawnParticles(S, p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 20, 3, '#ffe082', 60, 0.12, 3);
  addHeat(S, HEAT.shoot, p.x, p.y);
  scarePeds(S, p.x, p.y, 230);
  if (hitPed) {
    hurtPed(S, hitPed, 100, angle);
    addHeat(S, HEAT.downPed, hitPed.x, hitPed.y);
  } else if (hitCar) {
    damageCar(S, hitCar, hitCar.cop ? 16 : 9, true);
    spawnSparks(S, hx, hy, 5);
    if (hitCar.cop) addHeat(S, HEAT.hitCop, hitCar.x, hitCar.y);
    if (!hitCar.parked && !hitCar.cop) hitCar.fleeing = 5;
  } else if (bestDist < 620) {
    spawnParticles(S, hx, hy, 3, '#cfd8dc', 50, 0.25, 2.5);
  }
}

export function hurtPed(S, ped, damage, angle) {
  ped.hp -= damage;
  ped.vx = Math.cos(angle) * 190;
  ped.vy = Math.sin(angle) * 190;
  if (ped.hp <= 0 && ped.mode !== 'down') {
    ped.mode = 'down';
    ped.timer = 7;
    spawnParticles(S, ped.x, ped.y, 6, '#fff59d', 70, 0.5, 3);
  } else if (ped.mode === 'walk') {
    ped.mode = 'flee';
  }
}

// ---------------------------------------------------------------------------
// Pedestrians.

export function makePed(world, random) {
  const block = random.pick(world.blocks.filter((b) => b.kind !== 'repolot'));
  const ring = blockRing(block);
  const corner = random.int(0, 3);
  const pos = ring[corner];
  return {
    x: pos.x + random.range(-6, 6),
    y: pos.y + random.range(-6, 6),
    vx: 0, vy: 0,
    angle: random.range(0, Math.PI * 2),
    hp: 60,
    mode: 'walk',
    block,
    corner,
    timer: 0,
    speed: random.range(52, 84),
    shirt: random.pick(['#ff8a65', '#4fc3f7', '#aed581', '#f06292', '#fff176', '#b39ddb', '#80cbc4', '#ffcc80']),
    skin: random.pick(['#f1c27d', '#e0ac69', '#8d5524', '#ffdbac', '#c68642']),
    walkPhase: random.range(0, 6),
  };
}

export function blockRing(block) {
  const r = block.rect;
  const o = 8;
  return [
    { x: r.x - o, y: r.y - o },
    { x: r.x2 + o, y: r.y - o },
    { x: r.x2 + o, y: r.y2 + o },
    { x: r.x - o, y: r.y2 + o },
  ];
}

export function stepPed(S, ped, dt) {
  if (ped.mode === 'passenger') return;
  if (ped.mode === 'wait') {
    // A fare standing at the kerb, one arm up, going nowhere until picked up.
    ped.walkPhase += dt * 2;
    return;
  }
  if (ped.mode === 'down') {
    ped.timer -= dt;
    ped.vx *= 1 - 6 * dt;
    ped.vy *= 1 - 6 * dt;
    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;
    if (ped.timer <= 0) respawnPed(S, ped);
    return;
  }
  let tx;
  let ty;
  let speed = ped.speed;
  if (ped.mode === 'flee' && S.threat && S.time < S.threat.until) {
    const away = Math.atan2(ped.y - S.threat.y, ped.x - S.threat.x);
    tx = ped.x + Math.cos(away) * 120;
    ty = ped.y + Math.sin(away) * 120;
    speed = 215;
  } else {
    if (ped.mode === 'flee') ped.mode = 'walk';
    const ring = blockRing(ped.block);
    const target = ring[ped.corner];
    tx = target.x;
    ty = target.y;
    if (dist(ped.x, ped.y, tx, ty) < 10) {
      ped.corner = (ped.corner + 1) % 4;
      if (ped.corner === 0 && S.random.chance(0.14)) {
        const near = S.world.blocks.filter((b) => b.kind !== 'repolot'
          && Math.abs(b.col - ped.block.col) + Math.abs(b.row - ped.block.row) === 1);
        if (near.length) ped.block = S.random.pick(near);
      }
      return;
    }
  }
  const angle = Math.atan2(ty - ped.y, tx - ped.x);
  ped.angle = angle;
  ped.walkPhase += dt * (speed > 120 ? 12 : 8);
  ped.x += Math.cos(angle) * speed * dt;
  ped.y += Math.sin(angle) * speed * dt;
  const resolved = collideCircle(S.world, ped.x, ped.y, 11);
  ped.x = resolved.x;
  ped.y = resolved.y;
}

export function respawnPed(S, ped) {
  const fresh = makePed(S.world, S.random);
  if (dist(fresh.x, fresh.y, S.player.x, S.player.y) < 420) {
    fresh.x = S.world.zones.motel.x;
    fresh.y = S.world.zones.motel.y;
  }
  Object.assign(ped, fresh);
}

// ---------------------------------------------------------------------------
// Traffic.

const NODE_ROWS = [...GRID.streetY, GRID.promenadeY];

export function nodePoint(i, j) {
  return { x: GRID.avenueX[i], y: NODE_ROWS[j] };
}

export function nearestNode(x, y) {
  let bi = 0;
  let bj = 0;
  let bd = Infinity;
  for (let i = 0; i < GRID.avenueX.length; i += 1) {
    for (let j = 0; j < NODE_ROWS.length; j += 1) {
      const d = dist(x, y, GRID.avenueX[i], NODE_ROWS[j]);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
  }
  return { i: bi, j: bj };
}

function lanePoint(car, node) {
  // Aim at a point on the car's own side of the road through the junction.
  const from = car.fromNode ?? node;
  const dx = Math.sign(node.i - from.i);
  const dy = Math.sign(node.j - from.j);
  const px = GRID.avenueX[node.i];
  const py = NODE_ROWS[node.j];
  // Right-hand side offset relative to the direction of travel.
  const rx = -dy;
  const ry = dx;
  return { x: px + rx * GRID.laneOffset + dx * 30, y: py + ry * GRID.laneOffset + dy * 30 };
}

export function stepTrafficCar(S, car, dt) {
  if (car.parked || car.wreck) return;
  if (!car.node) {
    const n = nearestNode(car.x, car.y);
    car.node = n;
    car.fromNode = n;
  }
  if (car.fleeing > 0) car.fleeing -= dt;

  const target = lanePoint(car, car.node);
  const toTarget = dist(car.x, car.y, target.x, target.y);
  if (toTarget < 52) {
    // Choose the next junction: straight on mostly, sometimes a turn.
    const from = car.fromNode;
    const here = car.node;
    const dx = Math.sign(here.i - from.i);
    const dy = Math.sign(here.j - from.j);
    const options = [];
    const straight = { i: here.i + dx, j: here.j + dy };
    if (straight.i >= 0 && straight.i < GRID.avenueX.length && straight.j >= 0 && straight.j < NODE_ROWS.length) {
      options.push(straight, straight, straight);
    }
    const left = { i: here.i + dy, j: here.j - dx };
    const right = { i: here.i - dy, j: here.j + dx };
    for (const o of [left, right]) {
      if (o.i >= 0 && o.i < GRID.avenueX.length && o.j >= 0 && o.j < NODE_ROWS.length) options.push(o);
    }
    if (options.length === 0) options.push({ i: from.i, j: from.j });
    car.fromNode = here;
    car.node = S.random.pick(options);
  }

  // Pure-pursuit steering toward a lookahead point on the way to the junction.
  const lookX = car.x + Math.cos(car.angle) * 60;
  const lookY = car.y + Math.sin(car.angle) * 60;
  const aimX = (target.x + lookX) / 2;
  const aimY = (target.y + lookY) / 2;
  const desired = Math.atan2(aimY - car.y, aimX - car.x);
  const steer = Math.max(-1, Math.min(1, wrapAngle(desired - car.angle) * 2.4));

  // Obstacles: anything solid in the corridor ahead means brakes.
  let throttle = 0.55;
  const speedNow = Math.hypot(car.vx, car.vy);
  const aheadX = car.x + Math.cos(car.angle) * 74;
  const aheadY = car.y + Math.sin(car.angle) * 74;
  let blocked = false;
  for (const other of S.allCars) {
    if (other === car) continue;
    if (dist(aheadX, aheadY, other.x, other.y) < 34) { blocked = true; break; }
  }
  if (!blocked) {
    for (const ped of S.peds) {
      if (ped.mode !== 'down' && ped.mode !== 'passenger' && dist(aheadX, aheadY, ped.x, ped.y) < 26) { blocked = true; break; }
    }
  }
  if (!blocked && dist(aheadX, aheadY, S.player.x, S.player.y) < 30 && !S.player.car) blocked = true;
  if (blocked) throttle = speedNow > 40 ? -0.9 : 0;
  if (car.fleeing > 0) throttle = 1;
  const cruise = car.fleeing > 0 ? CAR.maxSpeed * 0.8 : car.cruiseSpeed;
  if (speedNow > cruise && throttle > 0) throttle = 0;
  stepCarPhysics(S, car, throttle, steer, false, dt);

  // A traffic car nudged off the road network recovers to the nearest lane.
  if (!isOnRoad(car.x, car.y)) {
    car.offRoadTime = (car.offRoadTime ?? 0) + dt;
    if (car.offRoadTime > 2.5) {
      const n = nearestNode(car.x, car.y);
      car.node = n;
      car.fromNode = n;
      car.offRoadTime = 0;
    }
  } else {
    car.offRoadTime = 0;
  }
}

// ---------------------------------------------------------------------------
// Police.

export function desiredCops(S) {
  return [0, 1, 2, 3, 4, 5][starsOf(S)];
}

export function spawnCop(S) {
  const p = S.player;
  for (let tries = 0; tries < 12; tries += 1) {
    const angle = S.random.range(0, Math.PI * 2);
    const d = S.random.range(640, 780);
    const x = Math.max(120, Math.min(WORLD.width - 120, p.x + Math.cos(angle) * d));
    const y = Math.max(120, Math.min(WORLD.waterY - 80, p.y + Math.sin(angle) * d));
    if (!isOnRoad(x, y)) continue;
    const cop = makeCar(x, y, Math.atan2(p.y - y, p.x - x), '#20304d', { cop: true, hasDriver: true });
    cop.slotAngle = S.cops.length * (Math.PI / 2.5);
    S.cops.push(cop);
    S.allCars.push(cop);
    return cop;
  }
  return null;
}

export function stepCop(S, cop, dt) {
  if (cop.wreck) return;
  const p = S.player;
  const targetEntity = p.car ?? p;
  // Box-in slots when the quarry is slow; a ramming line when it runs.
  const quarrySpeed = p.car ? Math.abs(carSpeed(p.car)) : Math.hypot(p.vx, p.vy);
  let tx = targetEntity.x + (p.car ? p.car.vx : p.vx) * 0.32;
  let ty = targetEntity.y + (p.car ? p.car.vy : p.vy) * 0.32;
  if (p.car && quarrySpeed < 130) {
    tx = p.car.x + Math.cos(p.car.angle + cop.slotAngle) * 62;
    ty = p.car.y + Math.sin(p.car.angle + cop.slotAngle) * 62;
  }
  const desired = Math.atan2(ty - cop.y, tx - cop.x);
  const steer = Math.max(-1, Math.min(1, wrapAngle(desired - cop.angle) * 2.8));
  const d = dist(cop.x, cop.y, targetEntity.x, targetEntity.y);
  let throttle = 1;
  if (d < 60 && quarrySpeed < 130) throttle = 0.25;
  stepCarPhysics(S, cop, throttle, steer, false, dt);

  // Stuck recovery: a hunter that has not moved for a while backs out.
  if (dist(cop.x, cop.y, cop.lastX, cop.lastY) < 2) cop.stuckTime += dt;
  else cop.stuckTime = 0;
  cop.lastX = cop.x;
  cop.lastY = cop.y;
  if (cop.stuckTime > 1.6) {
    cop.stuckTime = 0;
    stepCarPhysics(S, cop, -1, -steer, false, dt * 8);
    cop.angle += 0.4;
  }

  // Running down a fleeing suspect on foot hurts; the law aims to box, not kill.
  if (!p.car && dist(cop.x, cop.y, p.x, p.y) < 30 && Math.hypot(cop.vx, cop.vy) > 150) {
    hurtPlayer(S, 9, Math.atan2(p.y - cop.y, p.x - cop.x));
  }
}

export function hurtPlayer(S, amount, angle) {
  const p = S.player;
  if (S.time - S.lastHurtAt < 0.25) return;
  S.lastHurtAt = S.time;
  p.health -= amount;
  p.stagger = 0.45;
  p.vx += Math.cos(angle) * 210;
  p.vy += Math.sin(angle) * 210;
  S.sounds.push(['hit']);
  spawnParticles(S, p.x, p.y, 5, '#fff59d', 80, 0.4, 3);
}

/** Bust pressure: close, slow and seen means the meter fills. */
export function stepBust(S, dt) {
  const p = S.player;
  const speed = p.car ? Math.abs(carSpeed(p.car)) : Math.hypot(p.vx, p.vy);
  let pressure = 0;
  for (const cop of S.cops) {
    if (cop.wreck) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d < 120 && speed < 85) pressure += 1;
    if (d < 420) S.lastCopSawAt = S.time;
  }
  if (pressure > 0) S.bustMeter = Math.min(1, S.bustMeter + dt * 0.42 * pressure);
  else S.bustMeter = Math.max(0, S.bustMeter - dt * 0.3);
}
