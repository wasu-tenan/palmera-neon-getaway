// The screenshot scenes behind ?shot=start|foot|drive|chase|play|end (with
// &seed=N). Each one deals a fresh city from the seed and plays the real
// simulation forward with a scripted driver, so the frame is what the game
// truly looks like a few seconds in — and the same seed always stages the
// same frame. start is the title over the living harbour; foot walks Marco
// through a busy crossing; drive and play cruise the avenues at golden hour;
// chase and end run from the law after dark, when the lightbars show.

import { GRID } from './config.js';
import { createScriptedInput } from './input.js';
import { dist, spawnCop, wrapAngle } from './entities.js';

function runSteps(S, step, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) step(1 / 60);
}

/** Steer a scripted car up the nearest avenue, on its own side of the road. */
function driveNorth(S, seconds, step) {
  const input = S.input;
  const car = S.player.car;
  let nearest = GRID.avenueX[0];
  for (const ax of GRID.avenueX) {
    if (Math.abs(ax - car.x) < Math.abs(nearest - car.x)) nearest = ax;
  }
  const laneX = nearest + GRID.laneOffset;
  const total = Math.round(seconds * 60);
  for (let i = 0; i < total; i += 1) {
    const steerTarget = Math.atan2(-1, (laneX - car.x) / 160);
    const err = wrapAngle(steerTarget - car.angle);
    input.setKey('KeyW', true);
    input.setKey('KeyA', err < -0.05);
    input.setKey('KeyD', err > 0.05);
    step(1 / 60);
  }
  input.setKey('KeyW', false);
  input.setKey('KeyA', false);
  input.setKey('KeyD', false);
}

function putPlayerInCar(S) {
  const p = S.player;
  const car = S.cars.find((c) => c.parked) ?? S.cars[0];
  // Move a parked car beside the player and take it — the honest way, minus the walking.
  // The staged car wears bright red so the frame's hero is never in doubt.
  car.x = p.x + 30;
  car.y = p.y;
  car.angle = -Math.PI / 2;
  car.parked = false;
  car.color = '#e84e4e';
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  return car;
}

/** Shift bystanders off a stretch of avenue so a staged drive stays clean. */
function clearAvenue(S, avenueX, y0, y1, range) {
  for (const ped of S.peds) {
    if (Math.abs(ped.x - avenueX) < range && ped.y > y0 && ped.y < y1) {
      ped.x = avenueX + 420;
    }
  }
}

export function stageShot(name, S, step) {
  S.input = createScriptedInput();
  const input = S.input;

  if (name === 'foot') {
    S.clockMinutes = 15.5 * 60;
    // A busy junction by the diner: Marco crosses the avenue on the crosswalk
    // while the crowds use the pavements and the traffic rolls past.
    const jx = GRID.avenueX[4];
    const jy = GRID.streetY[3];
    const kerb = [
      [jx - 150, jy - GRID.roadHalf - 14], [jx + 170, jy - GRID.roadHalf - 14],
      [jx - 190, jy + GRID.roadHalf + 14], [jx + 230, jy + GRID.roadHalf + 16],
      [jx - 320, jy - GRID.roadHalf - 12], [jx + 330, jy + GRID.roadHalf + 12],
    ];
    S.peds.forEach((ped, i) => {
      if (i < kerb.length) {
        ped.x = kerb[i][0];
        ped.y = kerb[i][1];
        ped.mode = 'walk';
      }
    });
    S.player.x = jx - 120;
    S.player.y = jy + GRID.roadHalf + 12;
    S.camera.x = S.player.x;
    S.camera.y = S.player.y;
    input.setKey('KeyD', true);
    runSteps(S, step, 2.1);
    input.setKey('KeyD', false);
    S.aimWorld = { x: S.player.x + 220, y: S.player.y - 30 };
    runSteps(S, step, 0.3);
    return { screen: 'play' };
  }

  if (name === 'drive' || name === 'play') {
    S.clockMinutes = 17.8 * 60;
    putPlayerInCar(S);
    S.player.car.y = 2400;
    S.player.car.x = GRID.avenueX[4] + GRID.laneOffset;
    S.player.car.angle = -Math.PI / 2;
    clearAvenue(S, GRID.avenueX[4], 900, 2500, 130);
    driveNorth(S, 3.4, step);
    return { screen: 'play' };
  }

  if (name === 'chase' || name === 'end') {
    S.clockMinutes = 21.4 * 60;
    putPlayerInCar(S);
    S.player.car.y = 2500;
    S.player.car.x = GRID.avenueX[3] + GRID.laneOffset;
    S.player.car.angle = -Math.PI / 2;
    S.heat = 330;
    S.lastCrimeAt = S.time;
    // Clear the stage: other traffic waits on the far avenues, so the frame
    // belongs to the quarry and the law.
    let parkedOff = 0;
    for (const car of S.cars) {
      if (car !== S.player.car) {
        car.x = GRID.avenueX[7] + GRID.laneOffset;
        car.y = 640 + parkedOff * 130;
        parkedOff += 1;
      }
    }
    clearAvenue(S, GRID.avenueX[3], 900, 2700, 150);
    for (let i = 0; i < 3; i += 1) spawnCop(S);
    // The hunters start tight on the tail, lightbars already hot.
    S.cops.forEach((cop, i) => {
      cop.x = S.player.car.x + (i - 1) * 56;
      cop.y = S.player.car.y + 170 + i * 95;
      cop.angle = -Math.PI / 2;
      cop.vx = 0;
      cop.vy = -260;
    });
    driveNorth(S, 2.1, step);
    if (name === 'end') {
      return {
        screen: 'busted',
        endLines: ['The Interceptors boxed the avenue at last.', 'Fine paid: $325 — and Casa Vale is a long walk home.'],
      };
    }
    return { screen: 'play' };
  }

  // start (and anything unknown): the title over the harbour at mid-morning.
  S.clockMinutes = 10.2 * 60;
  runSteps(S, step, 3);
  S.camera.x = 2500;
  S.camera.y = 2960;
  return { screen: 'title' };
}

export function shotDistance(a, b) {
  return dist(a.x, a.y, b.x, b.y);
}
