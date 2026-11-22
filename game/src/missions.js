// The story of Marco Vale's first week in Palmera City: four jobs for the
// fixer Delia Cruz — a harbour pickup, a courier run against the clock, a
// repo job on a guarded lot and a harbour escape under real heat — told in
// short dialogue scenes, and then the open city: taxi fares for whoever
// flags the car down. The engine here is data plus small stage checks; the
// main loop owns the screens and the talking.

import { HEAT, MONEY } from './config.js';
import { addFloater, dist, makeCar, starsOf } from './entities.js';

export const STORY = [
  {
    id: 'first-run',
    title: 'First Run',
    reward: 300,
    intro: [
      ['Delia', 'Marco Vale. Heard you drive like the tide owes you money.'],
      ['Marco', 'I heard you pay better than the tide, Delia.'],
      ['Delia', 'A crate came in at Muelle 9, the harbour warehouse. Customs never saw it, and I want it that way.'],
      ['Delia', 'Pick it up and bring it back here to the diner. Quiet streets, quick hands.'],
    ],
    stages: [
      { kind: 'goto', label: 'Pick up the crate at Muelle 9 warehouse', at: 'warehouse', radius: 56 },
      { kind: 'goto', label: "Bring the crate to Delia's Diner", at: 'diner', radius: 58 },
    ],
    outro: [
      ['Delia', 'Dry, sealed, and not one question asked. You work clean, Marco.'],
      ['Delia', 'There is more where that came from. Come back when your tank is full.'],
    ],
  },
  {
    id: 'hot-courier',
    title: 'Hot Courier',
    reward: 450,
    intro: [
      ['Delia', 'A guest at Motel Brisa checked in with a briefcase and a nervous smile.'],
      ['Delia', 'The case goes to my man Rico at the warehouse — and his boat leaves soon.'],
      ['Delia', 'Clock is running from the moment you lift it. Do not sightsee.'],
    ],
    stages: [
      { kind: 'goto', label: 'Collect the briefcase at Motel Brisa', at: 'motel', radius: 56 },
      { kind: 'goto', label: 'Get the briefcase to Rico at Muelle 9 — fast!', at: 'warehouse', radius: 60, timer: 150 },
    ],
    outro: [
      ['Rico', 'Ninety seconds to spare. The boat thanks you, friend.'],
      ['Delia', 'Fast and intact. The city is starting to talk about you, Marco.'],
    ],
  },
  {
    id: 'repo-man',
    title: 'Repo Man',
    reward: 600,
    intro: [
      ['Delia', 'A yellow Comet sits in the repo lot across town. Paperwork says it is ours.'],
      ['Delia', 'The lot crew disagrees, so go at night-quiet hours and simply drive it out.'],
      ['Delia', 'Bring it to Taller Rosa. Rosa will make it a different car by morning.'],
    ],
    stages: [
      { kind: 'steal', label: 'Steal the yellow Comet from the repo lot', at: 'repolot', radius: 70 },
      { kind: 'goto', label: 'Deliver the Comet to Taller Rosa', at: 'respray', radius: 78, needsTargetCar: true },
    ],
    outro: [
      ['Rosa', 'New plates, new paint, new life. She was never here, eh?'],
      ['Delia', 'One more job, Marco. The big one. Then Palmera is yours.'],
    ],
  },
  {
    id: 'harbour-heat',
    title: 'Harbour Heat',
    reward: 900,
    intro: [
      ['Delia', 'Tonight I move myself, not cargo. Meet me at the harbour, by the water.'],
      ['Delia', 'Half the port authority is watching that dock, so we leave loud and fast.'],
      ['Delia', 'Lose them — outrun them or let Rosa repaint us — then home, to Casa Vale.'],
    ],
    stages: [
      { kind: 'goto', label: 'Meet Delia at the harbour', at: 'harbour', radius: 64 },
      { kind: 'escape', label: 'Lose the heat — outrun the law or respray', at: 'harbour', radius: 64 },
      { kind: 'goto', label: 'Take Delia home to Casa Vale', at: 'safehouse', radius: 62 },
    ],
    outro: [
      ['Delia', 'You see? The city sparkles different when it cannot catch you.'],
      ['Delia', 'The streets are yours now, Marco. Run fares, run wild — just keep my number.'],
    ],
  },
];

export function missionStartPoint(S) {
  return S.world.zones.diner;
}

/** Where the current objective marker sits, and what it says. */
export function currentObjective(S) {
  const m = S.mission;
  if (m.dialogue) return { label: 'Talk', x: S.player.x, y: S.player.y, hideMarker: true };
  if (m.active) {
    const mission = STORY[S.storyStep];
    const stage = mission.stages[m.stageIndex];
    const point = stagePoint(S, stage);
    let label = stage.label;
    if (stage.timer && m.timerLeft !== null) label += ` — ${Math.ceil(m.timerLeft)}s`;
    return { label, x: point.x, y: point.y, mission: true };
  }
  if (S.storyStep < STORY.length) {
    const p = missionStartPoint(S);
    return { label: `Meet Delia at the diner — “${STORY[S.storyStep].title}”`, x: p.x, y: p.y };
  }
  if (S.taxi) {
    if (S.taxi.phase === 'pickup') return { label: 'Pick up your fare', x: S.taxi.ped.x, y: S.taxi.ped.y, mission: true };
    return { label: 'Drop off your fare', x: S.taxi.dest.x, y: S.taxi.dest.y, mission: true };
  }
  return { label: 'Free roam — Palmera City is yours', x: S.player.x, y: S.player.y, hideMarker: true };
}

export function stagePoint(S, stage) {
  if (stage.kind === 'steal' && S.targetCar) return S.targetCar;
  const zone = S.world.zones[stage.at];
  return zone;
}

export function beginDialogue(S, lines, onDone) {
  S.mission.dialogue = { lines, pos: 0, onDone };
}

export function advanceDialogue(S) {
  const d = S.mission.dialogue;
  if (!d) return;
  d.pos += 1;
  S.sounds.push(['pickup']);
  if (d.pos >= d.lines.length) {
    S.mission.dialogue = null;
    if (d.onDone) d.onDone(S);
  }
}

export function tryStartMission(S) {
  if (S.mission.active || S.mission.dialogue || S.storyStep >= STORY.length) return false;
  const p = missionStartPoint(S);
  if (dist(S.player.x, S.player.y, p.x, p.y) > 62) return false;
  const mission = STORY[S.storyStep];
  beginDialogue(S, mission.intro, (s) => {
    s.mission.active = true;
    s.mission.stageIndex = 0;
    setupStage(s);
    addFloater(s, s.player.x, s.player.y - 40, mission.title.toUpperCase(), '#ffd23f');
  });
  return true;
}

function setupStage(S) {
  const mission = STORY[S.storyStep];
  const stage = mission.stages[S.mission.stageIndex];
  S.mission.timerLeft = stage.timer ?? null;
  if (stage.kind === 'steal' && !S.targetCar) {
    const lot = S.world.zones.repolot;
    const car = makeCar(lot.x + 60, lot.y + 30, Math.PI / 2, '#ffd23f', { parked: true });
    car.repoTarget = true;
    S.targetCar = car;
    S.cars.push(car);
    S.allCars.push(car);
  }
  if (stage.kind === 'escape') {
    S.heat = Math.max(S.heat, HEAT.perStar * 3);
    S.lastCrimeAt = S.time;
    addFloater(S, S.player.x, S.player.y - 40, 'THE LAW IS ON YOU', '#ff5252');
  }
}

function completeMission(S) {
  const mission = STORY[S.storyStep];
  S.mission.active = false;
  S.money += mission.reward;
  S.stats.missionsDone += 1;
  S.sounds.push(['cash'], ['jingle', true]);
  addFloater(S, S.player.x, S.player.y - 44, `+$${mission.reward}`, '#8be26e');
  const finishedStory = S.storyStep === STORY.length - 1;
  beginDialogue(S, mission.outro, (s) => {
    s.storyStep += 1;
    s.saveRequested = true;
    if (finishedStory) s.storyCompleteT = s.time;
  });
}

export function failStage(S, why) {
  S.sounds.push(['jingle', false]);
  beginDialogue(S, [['Delia', why], ['Delia', 'Shake it off and run it again. I will set it up.']], (s) => {
    s.mission.stageIndex = 0;
    setupStage(s);
  });
}

export function stepMission(S, dt) {
  const m = S.mission;
  if (!m.active || m.dialogue) return;
  const mission = STORY[S.storyStep];
  const stage = mission.stages[m.stageIndex];
  if (stage.timer) {
    m.timerLeft -= dt;
    if (m.timerLeft <= 0) {
      failStage(S, 'Too late — the boat left without the case.');
      return;
    }
  }
  const p = S.player;
  let done = false;
  if (stage.kind === 'goto') {
    const point = stagePoint(S, stage);
    if (stage.needsTargetCar) done = p.car === S.targetCar && dist(p.x, p.y, point.x, point.y) < stage.radius;
    else done = dist(p.x, p.y, point.x, point.y) < stage.radius;
  } else if (stage.kind === 'steal') {
    done = p.car === S.targetCar;
    if (done) S.stats.carsStolen += 1;
  } else if (stage.kind === 'escape') {
    done = S.heat <= 0 && starsOf(S) === 0;
  }
  if (!done) return;
  S.sounds.push(['pickup']);
  m.stageIndex += 1;
  if (m.stageIndex >= mission.stages.length) completeMission(S);
  else setupStage(S);
}

// ---------------------------------------------------------------------------
// Taxi work, once the story is told: the city's other honest hustle.

export function stepTaxi(S, dt) {
  if (S.storyStep < STORY.length) return;
  const p = S.player;
  if (!S.taxi) {
    S.taxiTimer -= dt;
    if (S.taxiTimer <= 0) {
      S.taxiTimer = S.random.range(16, 30);
      let best = null;
      let bestD = Infinity;
      for (const ped of S.peds) {
        if (ped.mode !== 'walk') continue;
        const d = dist(p.x, p.y, ped.x, ped.y);
        if (d < bestD && d > 260) { best = ped; bestD = d; }
      }
      if (best) {
        best.mode = 'wait';
        S.taxi = { phase: 'pickup', ped: best, dest: null, fare: 0 };
        addFloater(S, best.x, best.y - 30, '!', '#ffd23f');
      }
    }
    return;
  }
  const taxi = S.taxi;
  if (taxi.phase === 'pickup') {
    if (taxi.ped.mode !== 'wait') { S.taxi = null; return; }
    if (p.car && Math.abs(p.car.vx) + Math.abs(p.car.vy) < 30 && dist(p.x, p.y, taxi.ped.x, taxi.ped.y) < 58) {
      taxi.ped.mode = 'passenger';
      const spots = ['diner', 'motel', 'safehouse', 'gunshop', 'warehouse', 'harbour'];
      const zone = S.world.zones[S.random.pick(spots)];
      taxi.dest = { x: zone.x, y: zone.y };
      taxi.tripDist = dist(p.x, p.y, zone.x, zone.y);
      taxi.fare = MONEY.taxiBase + Math.round(taxi.tripDist / 14);
      taxi.startedAt = S.time;
      taxi.carHp = p.car.hp;
      S.sounds.push(['door']);
      addFloater(S, p.x, p.y - 36, 'FARE ON BOARD', '#ffd23f');
    }
    return;
  }
  // Dropoff phase: the passenger rides where the car goes.
  taxi.ped.x = p.x;
  taxi.ped.y = p.y;
  if (p.car && dist(p.x, p.y, taxi.dest.x, taxi.dest.y) < 62 && Math.abs(p.car.vx) + Math.abs(p.car.vy) < 40) {
    const quick = S.time - taxi.startedAt < taxi.tripDist / 9 + 60;
    const tip = quick && p.car.hp >= taxi.carHp - 5 ? Math.round(taxi.fare * 0.35) : 0;
    const total = taxi.fare + tip;
    S.money += total;
    S.stats.taxiFares += 1;
    S.stats.earned += total;
    S.sounds.push(['cash']);
    addFloater(S, p.x, p.y - 40, `+$${total}${tip ? ' (tip!)' : ''}`, '#8be26e');
    taxi.ped.mode = 'walk';
    taxi.ped.x = p.x + 30;
    taxi.ped.y = p.y + 10;
    S.taxi = null;
    S.taxiTimer = S.random.range(14, 26);
  }
}
