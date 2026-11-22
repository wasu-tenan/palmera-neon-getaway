// Palmera City: Neon Getaway — boot and the one loop. Input is read every
// frame, the city advances in fixed 1/60 s steps, and the renderer paints
// what is there. Screens: title, play (with dialogue over it), paused, and
// the busted / wasted cards. ?seed=N fixes the city's deal; ?shot=start|
// foot|drive|chase|play|end stages a deterministic scene for a screenshot
// and sets window.__shotReady when it is painted.

import { CAR, CLOCK, HEAT, MONEY, SAVE_KEY, STEP, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import {
  addFloater, addHeat, carSpeed, collideCars, damageCar, desiredCops, dist, firePistol,
  hurtPed, makeCar, makePed, meleeAttack, spawnCop, spawnSmoke, starsOf, stepBust,
  stepCarPhysics, stepCop, stepFx, stepPed, stepPlayerOnFoot, stepTrafficCar, wrapAngle,
} from './entities.js';
import {
  advanceDialogue, currentObjective, STORY, stepMission, stepTaxi, tryStartMission,
} from './missions.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { CAR_COLORS, CROWD, GRID } from './config.js';

const MAX_FRAME = 0.25;
const VIEW_H = 880;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const audio = createAudio();

// ------------------------------------------------------------ state --------

function freshState(stateSeed) {
  const random = createRandom(stateSeed);
  const world = createWorld(random);
  const cars = [];
  const spots = [...world.parkedSpots];
  for (let i = 0; i < CROWD.parked && spots.length; i += 1) {
    const spot = spots.splice(random.int(0, spots.length - 1), 1)[0];
    cars.push(makeCar(spot.x, spot.y, spot.angle, random.pick(CAR_COLORS), { parked: true }));
  }
  for (let i = 0; i < CROWD.traffic; i += 1) {
    const ax = random.pick(GRID.avenueX);
    const y = random.range(420, 2900);
    const car = makeCar(ax + (random.chance(0.5) ? GRID.laneOffset : -GRID.laneOffset), y,
      random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, random.pick(CAR_COLORS),
      { hasDriver: true, cruiseSpeed: random.range(250, 360) });
    cars.push(car);
  }
  const peds = [];
  for (let i = 0; i < CROWD.peds; i += 1) peds.push(makePed(world, random));
  const spawn = world.spawn;
  return {
    random,
    world,
    time: 0,
    day: 1,
    clockMinutes: CLOCK.startHour * 60,
    night: 0,
    player: {
      x: spawn.x, y: spawn.y, vx: 0, vy: 0, angle: -Math.PI / 2,
      health: 100, car: null, walkPhase: 0, stagger: 0, punchT: 0, attackCd: 0,
    },
    cars,
    peds,
    cops: [],
    allCars: [...cars],
    camera: { x: spawn.x, y: spawn.y },
    aimWorld: null,
    input: null,
    money: MONEY.start,
    heat: 0,
    lastCrimeAt: -999,
    lastCopSawAt: -999,
    lastHurtAt: -999,
    bustMeter: 0,
    bustStars: 0,
    weapon: { owned: false, ammo: 0, selected: 'fists' },
    fx: { particles: [], floaters: [], tracers: [] },
    sounds: [],
    stats: { missionsDone: 0, carsStolen: 0, taxiFares: 0, copsWrecked: 0, earned: 0 },
    storyStep: 0,
    mission: { active: false, stageIndex: 0, dialogue: null, timerLeft: null },
    targetCar: null,
    taxi: null,
    taxiTimer: 18,
    threat: null,
    saveRequested: false,
    endRequest: null,
    copTimer: 0,
    resprayTimer: 0,
    storyCompleteT: -999,
  };
}

let S = freshState(seed);
S.input = createInput(canvas);

// ------------------------------------------------------------- save --------

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: S.money,
      storyStep: S.storyStep,
      weapon: S.weapon,
      stats: S.stats,
      day: S.day,
      clockMinutes: S.clockMinutes,
    }));
  } catch {
    // Storage can be off (private windows): the run then lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function applySave(save) {
  S.money = save.money ?? S.money;
  S.storyStep = Math.min(STORY.length, save.storyStep ?? 0);
  if (save.weapon) S.weapon = save.weapon;
  if (save.stats) S.stats = { ...S.stats, ...save.stats };
  S.day = save.day ?? 1;
  S.clockMinutes = save.clockMinutes ?? S.clockMinutes;
}

// ------------------------------------------------------- interactions ------

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of S.allCars) {
    if (car.wreck) continue;
    const d = dist(S.player.x, S.player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const p = S.player;
  if (!car.parked && car.hasDriver && !car.cop) {
    // Carjacking: the driver bails out and runs, and the street remembers.
    const driver = makePed(S.world, S.random);
    driver.x = car.x + 26;
    driver.y = car.y + 10;
    driver.mode = 'flee';
    S.threat = { x: car.x, y: car.y, until: S.time + 3 };
    S.peds.push(driver);
    car.hasDriver = false;
    S.stats.carsStolen += 1;
    addHeat(S, HEAT.carjack, car.x, car.y);
    addFloater(S, car.x, car.y - 30, 'CARJACKED', '#ff9046');
  } else if (car.parked) {
    S.stats.carsStolen += car.repoTarget ? 0 : 1;
    addHeat(S, car.repoTarget ? HEAT.carjack : HEAT.stealParked, car.x, car.y);
  }
  car.parked = false;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  S.sounds.push(['door']);
  audio.startEngine();
}

function exitCar() {
  const p = S.player;
  const car = p.car;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 32;
  p.y = car.y + Math.sin(side) * 32;
  p.vx = 0;
  p.vy = 0;
  p.car = null;
  if (Math.abs(carSpeed(car)) < 12) {
    car.parked = true;
    car.vx = 0;
    car.vy = 0;
  }
  S.sounds.push(['door']);
  audio.stopEngine();
}

function computePrompt() {
  const p = S.player;
  const z = S.world.zones;
  if (p.car) {
    const bay = z.respray.rect;
    if (p.x > bay.x && p.x < bay.x2 && p.y > bay.y && p.y < bay.y2) {
      if (S.heat > 0 || p.car.hp < 100) {
        return S.money >= MONEY.respray ? 'Taller Rosa is on it — stay in the bay…' : `Respray needs $${MONEY.respray}`;
      }
      return 'Taller Rosa — paint & heat removal, $150';
    }
    return null;
  }
  const car = nearestCar(64);
  if (car) {
    if (car.repoTarget) return '[E] Steal the yellow Comet';
    if (!car.parked) return '[E] Carjack the passing car';
    return '[E] Get in the car';
  }
  if (dist(p.x, p.y, z.gunshop.x, z.gunshop.y) < 46) {
    if (!S.weapon.owned) return S.money >= MONEY.pistol ? `[E] Buy the Brisa pistol — $${MONEY.pistol}` : `Pistol $${MONEY.pistol} — you are short`;
    return S.money >= MONEY.ammoPack ? `[E] Buy 24 rounds — $${MONEY.ammoPack}` : 'Ammo $40 — you are short';
  }
  if (dist(p.x, p.y, z.safehouse.x, z.safehouse.y) < 50) return '[E] Casa Vale — rest, heal & save';
  if (S.storyStep < STORY.length && !S.mission.active && dist(p.x, p.y, z.diner.x, z.diner.y) < 62) {
    return `[E] Talk to Delia — “${STORY[S.storyStep].title}”`;
  }
  return null;
}

function doInteract() {
  const p = S.player;
  if (S.mission.dialogue) {
    advanceDialogue(S);
    return;
  }
  if (p.car) {
    exitCar();
    return;
  }
  const car = nearestCar(64);
  if (car) {
    enterCar(car);
    return;
  }
  const z = S.world.zones;
  if (dist(p.x, p.y, z.gunshop.x, z.gunshop.y) < 46) {
    if (!S.weapon.owned) {
      if (S.money >= MONEY.pistol) {
        S.money -= MONEY.pistol;
        S.weapon.owned = true;
        S.weapon.ammo += 36;
        S.weapon.selected = 'pistol';
        S.sounds.push(['cash']);
        addFloater(S, p.x, p.y - 34, 'PISTOL BOUGHT', '#ffd23f');
      } else S.sounds.push(['denied']);
    } else if (S.money >= MONEY.ammoPack) {
      S.money -= MONEY.ammoPack;
      S.weapon.ammo += MONEY.ammoRounds;
      S.sounds.push(['cash']);
      addFloater(S, p.x, p.y - 34, `+${MONEY.ammoRounds} ROUNDS`, '#ffd23f');
    } else S.sounds.push(['denied']);
    return;
  }
  if (dist(p.x, p.y, z.safehouse.x, z.safehouse.y) < 50) {
    p.health = 100;
    saveGame();
    S.sounds.push(['pickup']);
    addFloater(S, p.x, p.y - 34, 'RESTED — GAME SAVED', '#69e58a');
    return;
  }
  tryStartMission(S);
}

// ---------------------------------------------------------- simulation -----

function stepPlayerCar(dt) {
  const p = S.player;
  const car = p.car;
  const input = S.input;
  let throttle = 0;
  let steer = 0;
  if (input.held('KeyW', 'ArrowUp')) throttle += 1;
  if (input.held('KeyS', 'ArrowDown')) throttle -= 1;
  if (input.held('KeyA', 'ArrowLeft')) steer -= 1;
  if (input.held('KeyD', 'ArrowRight')) steer += 1;
  const handbrake = input.held('Space');
  stepCarPhysics(S, car, throttle, steer, handbrake, dt);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.attackCd = Math.max(0, p.attackCd - dt);
  if (input.mouse.down && S.weapon.selected === 'pistol' && S.weapon.owned && p.attackCd <= 0) {
    // Shooting from the driver's seat, toward the mouse.
    if (S.aimWorld) p.angle = Math.atan2(S.aimWorld.y - p.y, S.aimWorld.x - p.x);
    firePistol(S);
    p.angle = car.angle;
  }
  // Running people down is the loudest crime in the city.
  const speed = Math.hypot(car.vx, car.vy);
  for (const ped of S.peds) {
    if (ped.mode === 'down' || ped.mode === 'passenger') continue;
    const d = dist(car.x, car.y, ped.x, ped.y);
    if (d < 30) {
      if (speed > 150) {
        hurtPed(S, ped, 100, Math.atan2(car.vy, car.vx));
        addHeat(S, HEAT.downPed, ped.x, ped.y);
        damageCar(S, car, 3, true);
        S.sounds.push(['crash', 0.3]);
      } else {
        ped.mode = 'flee';
        S.threat = { x: car.x, y: car.y, until: S.time + 2 };
      }
    }
  }
  // The respray bay: sit still in it and Rosa does the rest.
  const bay = S.world.zones.respray.rect;
  const inBay = p.x > bay.x && p.x < bay.x2 && p.y > bay.y && p.y < bay.y2;
  if (inBay && speed < 14 && (S.heat > 0 || car.hp < 100) && S.money >= MONEY.respray) {
    S.resprayTimer += dt;
    if (S.resprayTimer > 1.4) {
      S.money -= MONEY.respray;
      S.heat = 0;
      S.bustMeter = 0;
      car.hp = CAR.health;
      car.color = S.random.pick(['#4ecdc4', '#f7f1e1', '#5a6b7c', '#95d5b2', '#ff8fab']);
      S.resprayTimer = 0;
      S.sounds.push(['cash']);
      addFloater(S, car.x, car.y - 36, 'RESPRAYED — HEAT GONE', '#4ef0e0');
    }
  } else {
    S.resprayTimer = 0;
  }
}

function stepSim(dt) {
  S.time += dt;
  // The clock: a full day in about twenty-two minutes of play.
  S.clockMinutes += dt / CLOCK.secondsPerMinute;
  if (S.clockMinutes >= 1440) {
    S.clockMinutes -= 1440;
    S.day += 1;
  }
  const hour = S.clockMinutes / 60;
  const dayness = Math.max(0, Math.min(1, Math.sin(((hour - 6.2) / 12.6) * Math.PI)));
  S.night = 1 - dayness;

  const inDialogue = !!S.mission.dialogue;
  if (!inDialogue) {
    if (S.player.car) stepPlayerCar(dt);
    else stepPlayerOnFoot(S, S.input, dt);
    S.player.punchT = Math.max(0, S.player.punchT - dt);
  }

  // Traffic drives itself — but never the car Marco is sitting in: that one
  // answers to the player alone. (Letting the AI steer it too was the first
  // build's strangest bug: stolen cars kept turning off on their own.)
  for (const car of S.cars) {
    if (car === S.player.car) continue;
    stepTrafficCar(S, car, dt);
  }
  // Police: keep the hunt at the size the stars demand.
  const want = desiredCops(S);
  S.copTimer -= dt;
  if (S.cops.length < want && S.copTimer <= 0) {
    spawnCop(S);
    S.copTimer = 1.7;
  }
  for (let i = S.cops.length - 1; i >= 0; i -= 1) {
    const cop = S.cops[i];
    stepCop(S, cop, dt);
    const far = dist(cop.x, cop.y, S.player.x, S.player.y) > 1150;
    if ((far && starsOf(S) === 0) || (far && S.cops.length > want)) {
      S.cops.splice(i, 1);
      S.allCars.splice(S.allCars.indexOf(cop), 1);
    }
  }
  for (const ped of S.peds) stepPed(S, ped, dt);
  collideCars(S, dt);
  if (!inDialogue) {
    stepBust(S, dt);
    stepMission(S, dt);
    stepTaxi(S, dt);
  }
  // Heat cools when nobody in uniform has seen Marco for a while.
  if (S.heat > 0 && S.time - S.lastCopSawAt > HEAT.decayDelay && S.time - S.lastCrimeAt > 4) {
    S.heat = Math.max(0, S.heat - HEAT.decayRate * dt * (1 + (S.time - S.lastCrimeAt) / 26));
    if (S.heat === 0) S.bustMeter = 0;
  }
  // Worn cars smoke.
  for (const car of S.allCars) {
    if (car.hp < 42 && car.hp > 0 && S.random.chance(0.1)) {
      spawnSmoke(S, car.x + S.random.range(-10, 10), car.y - 8, 1);
    }
  }
  stepFx(S, dt);
  // Camera follows whoever Marco is right now.
  const focus = S.player.car ?? S.player;
  S.camera.x += (focus.x - S.camera.x) * Math.min(1, dt * 5);
  S.camera.y += (focus.y - S.camera.y) * Math.min(1, dt * 5);
  if (S.saveRequested) {
    S.saveRequested = false;
    saveGame();
  }
  if (S.bustMeter >= 1 && !S.endRequest) {
    S.endRequest = 'busted';
    S.bustStars = starsOf(S);
  }
  if (S.player.health <= 0 && !S.endRequest) S.endRequest = 'wasted';
}

// -------------------------------------------------------------- audio ------

function drainSounds() {
  for (const [name, arg] of S.sounds) {
    if (name === 'shot') audio.shot();
    else if (name === 'punch') audio.punch();
    else if (name === 'hit') audio.hit();
    else if (name === 'crash') audio.crash(arg ?? 0.5);
    else if (name === 'cash') audio.cash();
    else if (name === 'pickup') audio.pickup();
    else if (name === 'door') audio.door();
    else if (name === 'denied') audio.denied();
    else if (name === 'jingle') audio.jingle(!!arg);
  }
  S.sounds.length = 0;
  if (S.player.car) {
    const car = S.player.car;
    const ratio = Math.min(1, Math.abs(carSpeed(car)) / CAR.maxSpeed);
    audio.setEngine(ratio, true);
  }
  let nearestCop = Infinity;
  for (const cop of S.cops) {
    if (!cop.wreck) nearestCop = Math.min(nearestCop, dist(cop.x, cop.y, S.player.x, S.player.y));
  }
  if (nearestCop < 720 && starsOf(S) > 0) {
    audio.startSiren();
    audio.setSiren(1 - nearestCop / 720);
  } else {
    audio.stopSiren();
  }
}

// --------------------------------------------------------------- loop ------

const ui = {
  screen: 'title',
  menuIndex: 0,
  hasSave: !!readSave(),
  showHelp: false,
  objective: null,
  prompt: null,
  dialogue: null,
  toast: null,
  endLines: [],
  status: 'Palmera City: Neon Getaway. Choose New Game to play.',
};
let titleTime = 0;

function startRun(continueSave) {
  const save = continueSave ? readSave() : null;
  S = freshState(Math.floor(Math.random() * 4294967296));
  S.input = createInput(canvas);
  if (save) applySave(save);
  ui.screen = 'play';
  ui.showHelp = false;
  ui.status = 'Playing Palmera City.';
  audio.wake();
  audio.startMusic();
}

function endRun(kind) {
  ui.screen = kind;
  if (kind === 'busted') {
    const fine = Math.min(S.money, MONEY.bustFineBase + MONEY.bustFinePerStar * S.bustStars);
    ui.endLines = [
      `The Interceptors boxed Marco in at ${S.bustStars} star${S.bustStars === 1 ? '' : 's'}.`,
      `Fine paid: $${fine}. The car stays where it died.`,
    ];
    ui.pendingFine = fine;
  } else {
    const bill = Math.min(S.money, MONEY.wastedBill);
    ui.endLines = [
      'Marco wakes up in a hospital gown, pockets lighter.',
      `Clinic bill: $${bill}. Casa Vale is a short walk.`,
    ];
    ui.pendingFine = bill;
  }
  audio.stopEngine();
  audio.stopSiren();
  audio.jingle(false);
}

function wakeFromEnd() {
  S.money -= ui.pendingFine ?? 0;
  S.heat = 0;
  S.bustMeter = 0;
  S.endRequest = null;
  S.player.health = 100;
  S.player.car = null;
  for (const cop of S.cops) S.allCars.splice(S.allCars.indexOf(cop), 1);
  S.cops = [];
  S.player.x = S.world.spawn.x;
  S.player.y = S.world.spawn.y;
  S.camera.x = S.player.x;
  S.camera.y = S.player.y;
  ui.screen = 'play';
  saveGame();
}

function titleItems() {
  return ui.hasSave ? ['new', 'continue', 'help'] : ['new', 'help'];
}

function activateMenuItem() {
  const item = titleItems()[ui.menuIndex];
  if (item === 'new') startRun(false);
  else if (item === 'continue') startRun(true);
  else if (item === 'help') ui.showHelp = !ui.showHelp;
}

window.addEventListener('keydown', (event) => {
  audio.wake();
  if (ui.screen !== 'title') return;
  if (event.code === 'ArrowDown' || event.code === 'KeyS') {
    ui.menuIndex = (ui.menuIndex + 1) % titleItems().length;
  } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
    ui.menuIndex = (ui.menuIndex - 1 + titleItems().length) % titleItems().length;
  }
});
canvas.addEventListener('mousedown', () => audio.wake());

function handleFrameActions() {
  const actions = S.input.takeActions();
  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.isMuted());
    addFloater(S, S.player.x, S.player.y - 34, audio.isMuted() ? 'SOUND OFF' : 'SOUND ON', '#fdfdf8');
  }
  if (ui.screen === 'title') {
    if (actions & ACTION_CONFIRM) {
      // A click picks the row under the mouse; Enter takes the selection.
      const y = S.input.mouse.y;
      const items = titleItems();
      for (let i = 0; i < items.length; i += 1) {
        const rowY = window.innerHeight * 0.58 + i * 44;
        if (Math.abs(y - (rowY - 8)) < 22) ui.menuIndex = i;
      }
      activateMenuItem();
    }
    return;
  }
  if (ui.screen === 'busted' || ui.screen === 'wasted') {
    if (actions & ACTION_CONFIRM) wakeFromEnd();
    return;
  }
  if (actions & ACTION_PAUSE) {
    ui.screen = ui.screen === 'paused' ? 'play' : 'paused';
    ui.status = ui.screen === 'paused' ? 'Paused.' : 'Playing.';
    return;
  }
  if (ui.screen !== 'play') return;
  if (actions & ACTION_INTERACT) doInteract();
  if (S.input.held('Digit1')) S.weapon.selected = 'fists';
  if (S.input.held('Digit2') && S.weapon.owned) S.weapon.selected = 'pistol';
}

function updateAim() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const z = h / VIEW_H;
  const vw = w / z;
  let camX = Math.max(0, Math.min(WORLD.width - vw, S.camera.x - vw / 2));
  if (vw >= WORLD.width) camX = (WORLD.width - vw) / 2;
  const camY = Math.max(0, Math.min(WORLD.height - VIEW_H, S.camera.y - VIEW_H / 2));
  S.aimWorld = {
    x: camX + S.input.mouse.x / z,
    y: camY + S.input.mouse.y / z,
  };
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  handleFrameActions();
  updateAim();

  if (ui.screen === 'title') {
    // The city lives behind the title: traffic rolls, palms sway, time drifts.
    titleTime += dtReal;
    accumulator += dtReal;
    while (accumulator >= STEP) {
      stepAmbient(STEP);
      accumulator -= STEP;
    }
    S.camera.x = 2500 + Math.sin(titleTime * 0.045) * 1250;
    S.camera.y = 2920 + Math.cos(titleTime * 0.03) * 120;
  } else if (ui.screen === 'play') {
    accumulator += dtReal;
    while (accumulator >= STEP) {
      stepSim(STEP);
      accumulator -= STEP;
      if (S.endRequest) break;
    }
    if (S.endRequest) {
      endRun(S.endRequest);
      S.endRequest = null;
    }
  } else {
    accumulator = 0;
  }

  ui.objective = ui.screen === 'title' ? null : currentObjective(S);
  ui.prompt = ui.screen === 'play' && !S.mission.dialogue ? computePrompt() : null;
  ui.dialogue = null;
  if (S.mission.dialogue) {
    const d = S.mission.dialogue;
    const line = d.lines[Math.min(d.pos, d.lines.length - 1)];
    ui.dialogue = { speaker: line[0], text: line[1] };
  }
  ui.toast = null;
  if (S.storyCompleteT > 0 && S.time - S.storyCompleteT < 5) {
    ui.toast = { text: 'STORY COMPLETE — THE CITY IS YOURS', t: 5 - (S.time - S.storyCompleteT) };
  }
  ui.hasSave = !!readSave();
  drainSounds();
  audio.updateMusic(dtReal);
  renderer.draw(S, ui);
}

/** Behind the title the world idles: traffic, crowds, weather, nothing personal. */
function stepAmbient(dt) {
  S.time += dt;
  S.clockMinutes += dt / CLOCK.secondsPerMinute * 0.4;
  if (S.clockMinutes >= 1440) S.clockMinutes -= 1440;
  const hour = S.clockMinutes / 60;
  S.night = 1 - Math.max(0, Math.min(1, Math.sin(((hour - 6.2) / 12.6) * Math.PI)));
  for (const car of S.cars) stepTrafficCar(S, car, dt);
  for (const ped of S.peds) stepPed(S, ped, dt);
  collideCars(S, dt);
  stepFx(S, dt);
}

// -------------------------------------------------------------- shots ------

if (shot) {
  const scene = stageShot(shot, S, (dt) => {
    // Staged scenes run the play step, dialogue-free and end-free.
    stepSim(dt);
    S.endRequest = null;
    S.bustMeter = Math.min(S.bustMeter, 0.9);
  });
  ui.screen = scene.screen;
  ui.endLines = scene.endLines ?? [];
  ui.objective = currentObjective(S);
  ui.hasSave = false;
  let painted = 0;
  const paint = () => {
    renderer.draw(S, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  requestAnimationFrame(frame);
}

// A small test hook: the automated play-test reads a summary and pokes the
// same doors a player would (new game, continue, teleport for scene setup).
window.__game = {
  summary() {
    return {
      screen: ui.screen,
      money: S.money,
      heat: S.heat,
      stars: starsOf(S),
      storyStep: S.storyStep,
      missionActive: S.mission.active,
      stageIndex: S.mission.stageIndex,
      inCar: !!S.player.car,
      health: Math.round(S.player.health),
      cops: S.cops.length,
      peds: S.peds.length,
      cars: S.allCars.length,
      player: { x: Math.round(S.player.x), y: Math.round(S.player.y) },
      weapon: { ...S.weapon },
      stats: { ...S.stats },
      hasSave: !!readSave(),
      dialogue: !!S.mission.dialogue,
    };
  },
  newGame() { startRun(false); },
  continueGame() { startRun(true); },
  teleport(x, y) {
    S.player.x = x;
    S.player.y = y;
    if (S.player.car) {
      S.player.car.x = x;
      S.player.car.y = y;
    }
    S.camera.x = x;
    S.camera.y = y;
  },
  setHeat(value) { S.heat = value; S.lastCrimeAt = S.time; },
  givePistol() {
    S.weapon.owned = true;
    S.weapon.ammo = 48;
    S.weapon.selected = 'pistol';
  },
  interact() { doInteract(); },
  state: () => S,
};
