// Everything the player sees: the sun-soaked city from above (pastel roofs,
// neon signs, palms, the harbour), the cars and crowds, and the screen furniture
// — HUD, circular minimap, dialogue box, menus. The renderer only reads the
// state; the simulation lives elsewhere. Night is a tint and a thousand lit
// windows, and police lightbars strobe red and blue at any hour.

import { FONT, FONT_DISPLAY, GRID, PALETTE, WORLD } from './config.js';
import { starsOf } from './entities.js';

const VIEW_H = 880; // world pixels of height on screen at any window size

function shade(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * factor)));
  return `rgb(${r},${g},${b})`;
}

function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bf03635;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    return dpr;
  }
  let dpr = resize();
  window.addEventListener('resize', () => { dpr = resize(); });

  // -------------------------------------------------------------- world ---

  function drawGround(S, cam, vw, vh) {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(cam.x - 80, cam.y - 80, vw + 160, vh + 160);
    // Mown stripes on the grass, cheap and cheerful.
    ctx.fillStyle = PALETTE.grassDark;
    const stripe = 128;
    for (let x = Math.floor((cam.x - 80) / stripe) * stripe; x < cam.x + vw + 80; x += stripe * 2) {
      ctx.fillRect(x, cam.y - 80, stripe, vh + 160);
    }
    // Sand along the shore.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(cam.x - 80, WORLD.waterY - 26, vw + 160, 30);
    // Water, with slow foam lines crawling the shore.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(cam.x - 80, WORLD.waterY, vw + 160, cam.y + vh - WORLD.waterY + 80);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let y = WORLD.waterY + 46; y < cam.y + vh; y += 74) {
      ctx.fillRect(cam.x - 80, y, vw + 160, 20);
    }
    ctx.strokeStyle = PALETTE.waterFoam;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = cam.x - 80; x <= cam.x + vw + 80; x += 26) {
      const y = WORLD.waterY + 3 + Math.sin(S.time * 1.4 + x * 0.02) * 3;
      if (x === cam.x - 80) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Harbour piers.
    ctx.fillStyle = PALETTE.dock;
    for (const px of [3560, 3860, 4160]) {
      ctx.fillRect(px, WORLD.waterY, 34, 150);
    }
  }

  function drawRoads(S, cam, vw, vh) {
    const half = GRID.roadHalf;
    ctx.fillStyle = PALETTE.sidewalk;
    const sw = half + 13;
    for (const ax of GRID.avenueX) ctx.fillRect(ax - sw, cam.y - 80, sw * 2, vh + 160);
    for (const sy of [...GRID.streetY, GRID.promenadeY]) ctx.fillRect(cam.x - 80, sy - sw, vw + 160, sw * 2);
    ctx.fillStyle = PALETTE.asphalt;
    for (const ax of GRID.avenueX) ctx.fillRect(ax - half, cam.y - 80, half * 2, vh + 160);
    for (const sy of [...GRID.streetY, GRID.promenadeY]) ctx.fillRect(cam.x - 80, sy - half, vw + 160, half * 2);
    // Centre dashes.
    ctx.fillStyle = PALETTE.laneMark;
    for (const ax of GRID.avenueX) {
      for (let y = Math.floor((cam.y - 80) / 64) * 64; y < cam.y + vh + 80; y += 64) {
        if (GRID.streetY.some((sy) => Math.abs(y - sy) < half + 8)) continue;
        ctx.fillRect(ax - 2, y, 4, 34);
      }
    }
    for (const sy of [...GRID.streetY, GRID.promenadeY]) {
      for (let x = Math.floor((cam.x - 80) / 64) * 64; x < cam.x + vw + 80; x += 64) {
        if (GRID.avenueX.some((ax) => Math.abs(x - ax) < half + 8)) continue;
        ctx.fillRect(x, sy - 2, 34, 4);
      }
    }
    // Crosswalks at every junction.
    ctx.fillStyle = PALETTE.crosswalk;
    for (const ax of GRID.avenueX) {
      for (const sy of GRID.streetY) {
        if (ax + half < cam.x - 40 || ax - half > cam.x + vw + 40 || sy + half < cam.y - 40 || sy - half > cam.y + vh + 40) continue;
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(ax + i * 15 - 5, sy - half - 12, 10, 9);
          ctx.fillRect(ax + i * 15 - 5, sy + half + 3, 10, 9);
          ctx.fillRect(ax - half - 12, sy + i * 15 - 5, 9, 10);
          ctx.fillRect(ax + half + 3, sy + i * 15 - 5, 9, 10);
        }
      }
    }
    // The respray bay is painted on the ground where Rosa works.
    const bay = S.world.zones.respray.rect;
    ctx.fillStyle = 'rgba(255, 105, 180, 0.25)';
    ctx.fillRect(bay.x, bay.y, bay.w, bay.h);
    ctx.strokeStyle = '#ff69b4';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(bay.x, bay.y, bay.w, bay.h);
    ctx.setLineDash([]);
    // The repo lot's fence lines.
    const lot = S.world.zones.repolot.rect;
    ctx.strokeStyle = 'rgba(240,240,240,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(lot.x - 6, lot.y - 6, lot.w + 12, lot.h + 12);
  }

  function drawBuilding(S, b, index) {
    const lift = Math.min(46, 8 + b.floors * 3.1);
    // Shadow, then the sunlit wall skirt, then the roof.
    ctx.fillStyle = 'rgba(20, 30, 20, 0.25)';
    ctx.fillRect(b.x + 12, b.y + 14, b.w, b.h);
    ctx.fillStyle = shade(b.color, 0.72 * b.shade);
    ctx.fillRect(b.x, b.y + lift, b.w, b.h);
    ctx.fillStyle = shade(b.color, b.shade);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(90, 70, 40, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    // Windows: a lit grid at night, pale glass by day.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        const wx = b.x + 10 + cx * ((b.w - 16) / cols);
        const wy = b.y + 10 + cy * ((b.h - 16) / rows);
        const lit = hash2(index * 31 + cx, cy * 7 + index) < 0.42;
        if (S.night > 0.25 && lit) ctx.fillStyle = `rgba(255, 205, 92, ${0.55 + S.night * 0.45})`;
        else ctx.fillStyle = 'rgba(120, 160, 190, 0.5)';
        ctx.fillRect(wx, wy, 9, 12);
      }
    }
    // Rooftop clutter.
    ctx.fillStyle = 'rgba(105, 95, 85, 0.65)';
    for (let i = 0; i < b.roofProps; i += 1) {
      const px = b.x + 14 + hash2(index, i * 3) * (b.w - 44);
      const py = b.y + 12 + hash2(i * 5, index) * (b.h - 40);
      ctx.fillRect(px, py, 18, 13);
    }
    // The sign, neon after dark.
    if (b.name) {
      ctx.font = `700 ${Math.max(11, Math.min(17, b.w / 11))}px ${FONT}`;
      ctx.textAlign = 'center';
      const hues = ['#ff5d8f', '#ffd23f', '#4ef0e0', '#ff9046', '#b388ff', '#8be26e'];
      if (S.night > 0.3) {
        ctx.shadowColor = hues[b.signHue];
        ctx.shadowBlur = 14;
        ctx.fillStyle = hues[b.signHue];
      } else {
        ctx.fillStyle = 'rgba(38, 48, 60, 0.85)';
      }
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h + lift + 16);
      ctx.shadowBlur = 0;
    }
  }

  function drawPalm(p) {
    ctx.strokeStyle = '#7a5a36';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 3, p.y - 12 * p.s);
    ctx.stroke();
    ctx.strokeStyle = '#2e9e4f';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      ctx.beginPath();
      ctx.moveTo(p.x + 3, p.y - 12 * p.s);
      ctx.quadraticCurveTo(
        p.x + 3 + Math.cos(a) * 12 * p.s,
        p.y - 12 * p.s + Math.sin(a) * 5 * p.s - 3,
        p.x + 3 + Math.cos(a) * 19 * p.s,
        p.y - 12 * p.s + Math.sin(a) * 9 * p.s + 4,
      );
      ctx.stroke();
    }
  }

  function drawCar(S, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(15, 20, 15, 0.3)';
    ctx.fillRect(-20, -9 + 4, 46, 23);
    // Wheels.
    ctx.fillStyle = '#15181c';
    for (const [wx, wy] of [[-15, -13], [13, -13], [-15, 10], [13, 10]]) {
      ctx.fillRect(wx, wy, 10, 5);
    }
    // Body.
    const body = car.wreck ? '#3a3f45' : (car.cop ? PALETTE.copBody : car.color);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-23, -11.5, 46, 23, 6);
    ctx.fill();
    if (car.cop) {
      ctx.fillStyle = PALETTE.copTrim;
      ctx.fillRect(-8, -11.5, 15, 23);
      ctx.fillStyle = '#ffd23f';
      ctx.font = `700 7px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('POLICÍA', 0, 2.5);
    }
    // Cabin and glass.
    ctx.fillStyle = car.wreck ? '#22262b' : '#bfe6f5';
    ctx.beginPath();
    ctx.roundRect(-6, -9, 17, 18, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(30, 45, 60, 0.85)';
    ctx.fillRect(8, -9, 4, 18);
    ctx.fillRect(-9, -9, 3.4, 18);
    // Headlights and tail lights.
    ctx.fillStyle = '#fff6bf';
    ctx.fillRect(21.5, -8.5, 2.4, 5);
    ctx.fillRect(21.5, 3.5, 2.4, 5);
    ctx.fillStyle = '#ff5252';
    ctx.fillRect(-23.5, -8.5, 2.4, 5);
    ctx.fillRect(-23.5, 3.5, 2.4, 5);
    // The Interceptor lightbar strobes.
    if (car.cop && !car.wreck) {
      const phase = Math.sin(S.time * 11 + car.lightPhase) > 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#2f7bff';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 16;
      ctx.fillRect(-3, -4.5, 7, 9);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    // Headlight cones after dark.
    if (S.night > 0.35 && !car.wreck) {
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const grad = ctx.createRadialGradient(car.x + fx * 24, car.y + fy * 24, 6, car.x + fx * 24, car.y + fy * 24, 120);
      grad.addColorStop(0, `rgba(255, 244, 180, ${0.34 * S.night})`);
      grad.addColorStop(1, 'rgba(255, 244, 180, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(car.x + fx * 24 - fy * 9, car.y + fy * 24 + fx * 9);
      ctx.lineTo(car.x + fx * 128 - fy * 34, car.y + fy * 128 + fx * 34);
      ctx.lineTo(car.x + fx * 128 + fy * 34, car.y + fy * 128 - fx * 34);
      ctx.lineTo(car.x + fx * 24 + fy * 9, car.y + fy * 24 - fx * 9);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPerson(S, x, y, angle, shirt, skin, walkPhase, isPlayer, punchT) {
    ctx.fillStyle = 'rgba(15, 20, 15, 0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const stride = Math.sin(walkPhase) * 5;
    ctx.strokeStyle = '#2d3a4a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle + 2.6) * stride * 0.4 + Math.cos(angle) * stride * 0.4, y + Math.sin(angle) * stride * 0.4 + 4);
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(angle) * stride * 0.4, y - Math.sin(angle) * stride * 0.4 + 4);
    ctx.stroke();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(x, y, 9.5, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = PALETTE.playerTrim;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    // Arm toward the aim, longer mid-punch.
    const armLen = punchT > 0 ? 17 : 12;
    ctx.strokeStyle = skin;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * armLen, y + Math.sin(angle) * armLen);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, y, 5.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPed(S, ped) {
    if (ped.mode === 'passenger') return;
    if (ped.mode === 'down') {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(13, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd23f';
      ctx.font = `700 11px ${FONT}`;
      ctx.textAlign = 'center';
      const tw = Math.sin(S.time * 3 + ped.x) * 2;
      ctx.fillText('✶', ped.x + tw, ped.y - 14);
      return;
    }
    drawPerson(S, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, false, 0);
    if (ped.mode === 'wait') {
      // A fare waiting: a bright marker bobs over their head.
      const bob = Math.sin(S.time * 4) * 3;
      ctx.fillStyle = PALETTE.accent;
      ctx.beginPath();
      ctx.moveTo(ped.x, ped.y - 20 + bob);
      ctx.lineTo(ped.x - 7, ped.y - 32 + bob);
      ctx.lineTo(ped.x + 7, ped.y - 32 + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ screens ---

  function panel(x, y, w, h, r = 12) {
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  function drawMinimap(S, ui) {
    const cx = 102;
    const cy = ui.h - 102;
    const r = 84;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1d7f96';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const scale = r / 620; // the map shows about 1.2 km across
    const px = S.player.x;
    const py = S.player.y;
    ctx.fillStyle = '#57a05e';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#1d7f96';
    const waterTop = cy + (WORLD.waterY - py) * scale;
    if (waterTop < cy + r) ctx.fillRect(cx - r, waterTop, r * 2, r * 2);
    ctx.strokeStyle = '#454b55';
    ctx.lineWidth = Math.max(3, GRID.roadHalf * 2 * scale);
    ctx.beginPath();
    for (const ax of GRID.avenueX) {
      const x = cx + (ax - px) * scale;
      if (x < cx - r - 10 || x > cx + r + 10) continue;
      ctx.moveTo(x, cy - r);
      ctx.lineTo(x, cy + r);
    }
    for (const sy of [...GRID.streetY, GRID.promenadeY]) {
      const y = cy + (sy - py) * scale;
      if (y < cy - r - 10 || y > cy + r + 10) continue;
      ctx.moveTo(cx - r, y);
      ctx.lineTo(cx + r, y);
    }
    ctx.stroke();
    const dot = (wx, wy, color, size) => {
      const x = cx + (wx - px) * scale;
      const y = cy + (wy - py) * scale;
      const d = Math.hypot(x - cx, y - cy);
      if (d > r - 6) {
        const a = Math.atan2(y - cy, x - cx);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7), size, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    };
    dot(S.world.zones.safehouse.x, S.world.zones.safehouse.y, '#ffffff', 3.4);
    for (const car of S.cars) if (!car.parked && !car.wreck) dot(car.x, car.y, 'rgba(230,230,230,0.55)', 2);
    const flash = Math.sin(S.time * 9) > 0;
    for (const cop of S.cops) if (!cop.wreck) dot(cop.x, cop.y, flash ? '#ff3b30' : '#2f7bff', 3.4);
    if (ui.objective && !ui.objective.hideMarker) dot(ui.objective.x, ui.objective.y, '#ffd23f', 4.2);
    // The player arrow turns with the player (or their car).
    const angle = S.player.car ? S.player.car.angle : S.player.angle;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#22303c';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5.4);
    ctx.lineTo(-6, 5.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('PALMERA CITY', cx, cy - r - 6);
  }

  function drawHUD(S, ui) {
    const w = ui.w;
    // Money and clock, top left.
    ctx.textAlign = 'left';
    ctx.font = `800 27px ${FONT_DISPLAY}`;
    ctx.fillStyle = PALETTE.cash;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 5;
    ctx.fillText(`$${S.money.toLocaleString('en-US')}`, 20, 40);
    ctx.shadowBlur = 0;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    const hh = Math.floor(S.clockMinutes / 60) % 24;
    const mm = Math.floor(S.clockMinutes % 60);
    ctx.fillText(`DAY ${S.day} — ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 21, 64);
    // Objective panel.
    if (ui.objective) {
      const label = ui.objective.label;
      ctx.font = `600 14.5px ${FONT}`;
      const tw = ctx.measureText(label).width;
      panel(16, 76, tw + (ui.objective.hideMarker ? 44 : 104), 34, 9);
      ctx.fillStyle = PALETTE.accent;
      ctx.beginPath();
      ctx.moveTo(30, 86);
      ctx.lineTo(24, 99);
      ctx.lineTo(36, 99);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(label, 44, 98);
      if (!ui.objective.hideMarker) {
        const d = Math.hypot(ui.objective.x - S.player.x, ui.objective.y - S.player.y);
        ctx.fillStyle = PALETTE.accent;
        ctx.font = `700 12.5px ${FONT}`;
        ctx.fillText(`${Math.round(d / 10)} m`, 50 + tw, 98);
      }
    }
    // Wanted stars, top right — and the bust meter under them.
    const stars = starsOf(S);
    ctx.font = `26px ${FONT}`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < stars ? '#ffd23f' : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', w - 30 - (4 - i) * 33, 40);
    }
    ctx.textAlign = 'right';
    if (S.bustMeter > 0.02) {
      ctx.fillStyle = 'rgba(255, 60, 60, 0.85)';
      ctx.fillRect(w - 168, 50, 150 * S.bustMeter, 7);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(w - 168, 50, 150, 7);
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = '#ffb3b3';
      ctx.fillText('BUSTED?', w - 18, 72);
    }
    // Health, bottom centre-left.
    const hx = 204;
    const hy = ui.h - 30;
    ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
    ctx.beginPath();
    ctx.roundRect(hx, hy, 190, 13, 6);
    ctx.fill();
    const hpFrac = Math.max(0, S.player.health / 100);
    ctx.fillStyle = hpFrac > 0.3 ? PALETTE.good : PALETTE.danger;
    if (hpFrac > 0) {
      ctx.beginPath();
      ctx.roundRect(hx, hy, 190 * hpFrac, 13, 6);
      ctx.fill();
    }
    // Weapon, beside health.
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    const weaponText = !S.weapon.owned
      ? 'FISTS'
      : S.weapon.selected === 'pistol' ? `PISTOL — ${S.weapon.ammo}` : 'FISTS (1: pistol)';
    ctx.fillText(weaponText, hx, hy - 10);
    // Speedometer and car health, bottom right.
    if (S.player.car) {
      const car = S.player.car;
      const speed = Math.abs(car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle));
      ctx.textAlign = 'right';
      ctx.font = `800 34px ${FONT_DISPLAY}`;
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(`${Math.round(speed * 0.16)}`, w - 66, ui.h - 26);
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('km/h', w - 20, ui.h - 26);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
      ctx.beginPath();
      ctx.roundRect(w - 196, ui.h - 18, 120, 9, 4);
      ctx.fill();
      ctx.fillStyle = car.hp > 35 ? '#69b7ff' : PALETTE.danger;
      if (car.hp > 0) {
        ctx.beginPath();
        ctx.roundRect(w - 196, ui.h - 18, 120 * (car.hp / 100), 9, 4);
        ctx.fill();
      }
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('CAR', w - 202, ui.h - 10);
    }
    drawMinimap(S, ui);
  }

  function drawBeacon(S, ui) {
    if (!ui.objective || ui.objective.hideMarker || ui.screen !== 'play') return;
    const { x, y } = ui.objective;
    const bob = Math.sin(S.time * 3.2) * 6;
    const grad = ctx.createLinearGradient(x, y - 190, x, y);
    grad.addColorStop(0, 'rgba(255, 210, 63, 0)');
    grad.addColorStop(1, 'rgba(255, 210, 63, 0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 7, y - 190, 14, 190);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, 20 + bob * 0.4, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(x, y - 44 + bob);
    ctx.lineTo(x - 11, y - 62 + bob);
    ctx.lineTo(x + 11, y - 62 + bob);
    ctx.closePath();
    ctx.fill();
  }

  function drawTitle(S, ui) {
    const w = ui.w;
    const h = ui.h;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(10, 16, 38, 0.25)');
    grad.addColorStop(0.55, 'rgba(10, 16, 38, 0.05)');
    grad.addColorStop(1, 'rgba(10, 16, 38, 0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.min(92, w / 11)}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#ffd23f';
    ctx.shadowColor = '#ff5d8f';
    ctx.shadowBlur = 26;
    ctx.fillText('PALMERA CITY', w / 2, h * 0.3);
    ctx.shadowBlur = 0;
    ctx.font = `800 ${Math.min(40, w / 26)}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#4ef0e0';
    ctx.fillText('— NEON GETAWAY —', w / 2, h * 0.3 + 52);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = '#fdfdf8';
    ctx.fillText('Marco Vale just hit town with empty pockets and a fast right foot.', w / 2, h * 0.3 + 88);
    ctx.fillText('Run jobs for Delia Cruz, steal anything with wheels, and stay ahead of the law.', w / 2, h * 0.3 + 112);
    // Menu.
    const items = ui.hasSave ? ['NEW GAME', 'CONTINUE', 'HOW TO PLAY'] : ['NEW GAME', 'HOW TO PLAY'];
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    items.forEach((item, i) => {
      const y = h * 0.58 + i * 44;
      const selected = ui.menuIndex === i;
      if (selected) {
        ctx.fillStyle = 'rgba(255, 210, 63, 0.9)';
        ctx.beginPath();
        ctx.roundRect(w / 2 - 170, y - 27, 340, 38, 9);
        ctx.fill();
        ctx.fillStyle = '#22303c';
      } else {
        ctx.fillStyle = '#fdfdf8';
      }
      ctx.fillText(item, w / 2, y);
    });
    ctx.font = `500 13.5px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Enter / click to choose — arrow keys or WASD to move', w / 2, h * 0.58 + items.length * 44 + 12);
    if (ui.showHelp) {
      panel(w / 2 - 330, h * 0.52, 660, 218, 14);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `600 15.5px ${FONT}`;
      ctx.textAlign = 'left';
      const lines = [
        'WASD / arrows — walk or drive      Shift — sprint',
        'Mouse — aim · click / hold — punch or shoot',
        'E — enter or steal a car, talk, use a shop',
        '1 / 2 — fists / pistol        Esc or P — pause',
        'M — mute        Crimes under eyes raise your stars.',
        'Lose the law by breaking sight, or pay Rosa at',
        'Taller Rosa for a respray. Casa Vale saves your game.',
      ];
      lines.forEach((line, i) => ctx.fillText(line, w / 2 - 306, h * 0.52 + 42 + i * 24));
      ctx.textAlign = 'center';
    }
  }

  function drawEndCard(S, ui) {
    const w = ui.w;
    const h = ui.h;
    ctx.fillStyle = ui.screen === 'busted' ? 'rgba(24, 30, 90, 0.55)' : 'rgba(90, 10, 10, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.font = `800 74px ${FONT_DISPLAY}`;
    ctx.fillStyle = ui.screen === 'busted' ? '#7fb2ff' : '#ff6b5e';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    ctx.fillText(ui.screen === 'busted' ? 'BUSTED' : 'WASTED', w / 2, h * 0.42);
    ctx.shadowBlur = 0;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = '#fdfdf8';
    (ui.endLines ?? []).forEach((line, i) => ctx.fillText(line, w / 2, h * 0.42 + 44 + i * 27));
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Press Enter to wake up at Casa Vale', w / 2, h * 0.42 + 44 + (ui.endLines ?? []).length * 27 + 16);
  }

  // --------------------------------------------------------------- main ---

  function draw(S, ui) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ui.w = w;
    ui.h = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = h / VIEW_H;
    const vw = w / z;
    const vh = VIEW_H;
    const cam = {
      x: Math.max(0, Math.min(WORLD.width - vw, S.camera.x - vw / 2)),
      y: Math.max(0, Math.min(WORLD.height - vh, S.camera.y - vh / 2)),
    };
    if (vw >= WORLD.width) cam.x = (WORLD.width - vw) / 2;
    ctx.save();
    ctx.translate(0, 0);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);

    drawGround(S, cam, vw, vh);
    drawRoads(S, cam, vw, vh);
    // Palms and lamps under the buildings' shade line.
    for (const p of S.world.palms) {
      if (p.x < cam.x - 60 || p.x > cam.x + vw + 60 || p.y < cam.y - 60 || p.y > cam.y + vh + 60) continue;
      drawPalm(p);
    }
    ctx.fillStyle = '#5b6670';
    for (const lamp of S.world.lamps) {
      if (lamp.x < cam.x - 30 || lamp.x > cam.x + vw + 30 || lamp.y < cam.y - 30 || lamp.y > cam.y + vh + 30) continue;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const sorted = [...S.world.buildings].sort((a, b) => a.y - b.y);
    sorted.forEach((b, i) => {
      if (b.x2 < cam.x - 60 || b.x > cam.x + vw + 60 || b.y2 < cam.y - 80 || b.y > cam.y + vh + 60) return;
      drawBuilding(S, b, i);
    });
    drawBeacon(S, ui);
    for (const car of S.allCars) {
      if (car.x < cam.x - 80 || car.x > cam.x + vw + 80 || car.y < cam.y - 80 || car.y > cam.y + vh + 80) continue;
      drawCar(S, car);
    }
    for (const ped of S.peds) drawPed(S, ped);
    if (!S.player.car && ui.screen !== 'title') {
      drawPerson(S, S.player.x, S.player.y, S.player.angle, PALETTE.player, '#e0ac69', S.player.walkPhase, true, S.player.punchT);
    }
    // Tracers, particles, floaters.
    for (const t of S.fx.tracers) {
      ctx.strokeStyle = `rgba(255, 230, 130, ${1 - t.t / t.life})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    for (const p of S.fx.particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `800 15px ${FONT}`;
    ctx.textAlign = 'center';
    for (const f of S.fx.floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Night tint and lamp glow, in screen space over the world.
    if (S.night > 0.02) {
      ctx.fillStyle = `rgba(10, 16, 64, ${S.night * 0.34})`;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.scale(z, z);
      ctx.translate(-cam.x, -cam.y);
      for (const lamp of S.world.lamps) {
        if (lamp.x < cam.x - 60 || lamp.x > cam.x + vw + 60 || lamp.y < cam.y - 60 || lamp.y > cam.y + vh + 60) continue;
        const grad = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 44);
        grad.addColorStop(0, `rgba(255, 220, 130, ${0.3 * S.night})`);
        grad.addColorStop(1, 'rgba(255, 220, 130, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, 44, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (ui.screen === 'title') {
      drawTitle(S, ui);
      return;
    }
    drawHUD(S, ui);
    // Interaction prompt.
    if (ui.prompt && ui.screen === 'play') {
      ctx.font = `700 16px ${FONT}`;
      const tw = ctx.measureText(ui.prompt).width;
      panel(w / 2 - tw / 2 - 18, h - 74, tw + 36, 36, 10);
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'center';
      ctx.fillText(ui.prompt, w / 2, h - 51);
    }
    // Toast (mission complete, story beats).
    if (ui.toast) {
      ctx.globalAlpha = Math.min(1, ui.toast.t);
      ctx.font = `800 25px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.accent;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(ui.toast.text, w / 2, 128);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    // Dialogue box.
    if (ui.dialogue) {
      const boxH = 104;
      panel(60, h - boxH - 26, w - 120, boxH, 14);
      ctx.textAlign = 'left';
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = PALETTE.accent;
      ctx.fillText(ui.dialogue.speaker.toUpperCase(), 84, h - boxH + 8);
      ctx.font = `500 17.5px ${FONT}`;
      ctx.fillStyle = PALETTE.text;
      wrapText(ui.dialogue.text, 84, h - boxH + 36, w - 170, 23);
      ctx.font = `600 12.5px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.textAlign = 'right';
      ctx.fillText('E / click ▸', w - 84, h - 40);
    }
    if (ui.screen === 'paused') {
      ctx.fillStyle = 'rgba(8, 12, 24, 0.55)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.font = `800 46px ${FONT_DISPLAY}`;
      ctx.fillStyle = PALETTE.text;
      ctx.fillText('PAUSED', w / 2, h * 0.44);
      ctx.font = `600 16px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('Esc / P to keep playing — your game saves at Casa Vale and after every job', w / 2, h * 0.44 + 36);
    }
    if (ui.screen === 'busted' || ui.screen === 'wasted') drawEndCard(S, ui);
    // Screen-reader status line.
    if (ui.status) {
      const el = document.getElementById('status');
      if (el && el.textContent !== ui.status) el.textContent = ui.status;
    }
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let ly = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, ly);
        line = word;
        ly += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, ly);
  }

  return { draw };
}
