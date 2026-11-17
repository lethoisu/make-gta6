// Drawing only: the world's state and the current screen in, pixels out. A
// camera follows the player over the city; the HUD (health, cash, wanted stars,
// objective, minimap, speed) is drawn on top, and the menus are panels over a
// live view of the city. Flat shapes and canvas text — no images, no network.
import { FONT, PALETTE, PLACES, ROADS, WORLD } from './config.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_VICTORY = 'victory';

const VIEW = { width: 1280, height: 800 };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function districtAt(x, y) {
  if (y > 2250) return 'Sunset Beach';
  if (x > 2900) return 'Marina District';
  if (x > 1250 && x < 1750 && y > 700 && y < 1150) return 'Coral Park';
  if (y < 700) return x < 1600 ? 'Old Town' : 'Downtown';
  if (y < 1600) return x < 1600 ? 'Old Town' : 'Downtown';
  if (y < 2050) return x < 1600 ? 'Beachfront' : 'Downtown';
  return x < 1600 ? 'Beachfront' : 'Marina District';
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || VIEW.width;
    const h = canvas.clientHeight || VIEW.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(canvas.width / VIEW.width, 0, 0, canvas.height / VIEW.height, 0, 0);
  }

  function camera(game) {
    const p = game.player;
    const shake = game.effects.shakeOffset();
    return {
      x: clamp(p.x - VIEW.width / 2 + shake.x, 0, WORLD.width - VIEW.width),
      y: clamp(p.y - VIEW.height / 2 + shake.y, 0, WORLD.height - VIEW.height),
    };
  }

  function drawGround(cam) {
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(cam.x - 40, cam.y - 40, VIEW.width + 80, VIEW.height + 80);
    // Beach and sea along the south edge.
    const beachY = 2250;
    if (cam.y + VIEW.height > beachY) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(cam.x - 40, beachY, VIEW.width + 80, VIEW.height);
      ctx.fillStyle = PALETTE.sea;
      ctx.fillRect(cam.x - 40, beachY + 110, VIEW.width + 80, VIEW.height);
      ctx.fillStyle = PALETTE.seaDeep;
      for (let x = Math.floor((cam.x - 40) / 260) * 260; x < cam.x + VIEW.width + 40; x += 260) {
        ctx.fillRect(x, beachY + 150, 150, 6);
        ctx.fillRect(x + 80, beachY + 210, 180, 6);
      }
    }
    // Park.
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(1250 + 48, 700 + 48, 500 - 96, 450 - 96);
  }

  function drawRoads(cam) {
    const { avenues, streets, width } = ROADS;
    const half = width / 2;
    ctx.fillStyle = PALETTE.road;
    for (const av of avenues) ctx.fillRect(av - half, cam.y - 40, width, VIEW.height + 80);
    for (const st of streets) ctx.fillRect(cam.x - 40, st - half, VIEW.width + 80, width);
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (const av of avenues) {
      for (let y = Math.floor((cam.y - 40) / 64) * 64; y < cam.y + VIEW.height + 40; y += 64) {
        ctx.fillRect(av - 3, y, 6, 30);
      }
    }
    for (const st of streets) {
      for (let x = Math.floor((cam.x - 40) / 64) * 64; x < cam.x + VIEW.width + 40; x += 64) {
        ctx.fillRect(x, st - 3, 30, 6);
      }
    }
  }

  function drawBuildings(game, cam) {
    for (const b of game.city.buildings) {
      if (b.x + b.w / 2 < cam.x - 60 || b.x - b.w / 2 > cam.x + VIEW.width + 60 ||
          b.y + b.h / 2 < cam.y - 60 || b.y - b.h / 2 > cam.y + VIEW.height + 60) continue;
      const x = b.x - b.w / 2;
      const y = b.y - b.h / 2;
      // Long sunset shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 14, y + 18, b.w, b.h);
      ctx.fillStyle = b.color === 'casino' ? PALETTE.casino : b.color === 'alt' ? PALETTE.buildingAlt : PALETTE.building;
      ctx.fillRect(x, y, b.w, b.h);
      ctx.fillStyle = b.color === 'casino' ? PALETTE.casinoRoof : b.color === 'alt' ? PALETTE.buildingAltRoof : PALETTE.buildingRoof;
      ctx.fillRect(x + 10, y + 10, b.w - 20, b.h - 20);
      // Windows.
      ctx.fillStyle = 'rgba(255, 240, 180, 0.75)';
      const cols = Math.max(1, Math.floor(b.w / 46));
      const rows = Math.max(1, Math.floor(b.h / 42));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          ctx.fillRect(x + 16 + i * ((b.w - 32) / cols), y + 16 + j * ((b.h - 32) / rows), 14, 10);
        }
      }
      if (b.label) {
        ctx.fillStyle = PALETTE.text;
        ctx.font = `700 17px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x, y - 10);
      }
    }
    // Palm trees.
    for (const t of game.city.trees) {
      if (t.x < cam.x - 40 || t.x > cam.x + VIEW.width + 40 || t.y < cam.y - 40 || t.y > cam.y + VIEW.height + 40) continue;
      ctx.fillStyle = '#7a5a34';
      ctx.fillRect(t.x - 2, t.y - 2, 4, 12);
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y - 6, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath();
      ctx.arc(t.x - 4, t.y - 9, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Marina docks on the east edge.
    ctx.fillStyle = '#8a6a4f';
    for (let y = 1560; y < 2100; y += 120) ctx.fillRect(2980, y, 150, 14);
    ctx.fillStyle = '#e8e4da';
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Marina', 3050, 1540);
  }

  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const w = car.length;
    const h = car.width;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, -w / 2 + 4, -h / 2 + 5, w, h, 7);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    // Roof + windshield.
    ctx.fillStyle = 'rgba(20, 28, 40, 0.85)';
    roundRect(ctx, -w * 0.18, -h / 2 + 4, w * 0.32, h - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180, 220, 255, 0.7)';
    ctx.fillRect(w * 0.2, -h / 2 + 5, 7, h - 10);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(w / 2 - 3, -h / 2 + 3, 3, 6);
    ctx.fillRect(w / 2 - 3, h / 2 - 9, 3, 6);
    if (car.model === 'taxi') {
      ctx.fillStyle = '#222';
      ctx.fillRect(-w * 0.05, -h / 2, 10, 4);
      ctx.fillRect(-w * 0.05, h / 2 - 4, 10, 4);
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(-8, -5, 16, 10);
      ctx.fillStyle = '#222';
      ctx.font = '700 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 2);
    }
    if (car.model === 'police') {
      const flash = Math.sin(time * 10 + (car.sirenPhase || 0)) > 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#3d7dd9';
      ctx.fillRect(-6, -h / 2 - 2, 12, 5);
      ctx.fillStyle = '#fff';
      ctx.font = '700 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 2);
    }
    if (car.model === 'gang') {
      ctx.fillStyle = '#2b1a3a';
      ctx.font = '700 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('KANE', 0, 2);
    }
    // Damage smoke.
    if (car.health < car.maxHealth * 0.4) {
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.beginPath();
      ctx.arc(-w * 0.3, 0, 8 + Math.sin(time * 9) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, shirt, skin, down, time, walkPhase) {
    ctx.save();
    ctx.translate(x, y);
    if (down > 0) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(walkPhase || 0) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, bob * 0.2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(5, bob * 0.2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMarker(game, cam, time) {
    const target = game.missions.markerTarget();
    if (!target || game.state.screen !== 'play') return;
    const pulse = 1 + Math.sin(time * 4) * 0.15;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.strokeStyle = PALETTE.marker;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(0, -58 - Math.sin(time * 4) * 8);
    ctx.lineTo(-12, -34);
    ctx.lineTo(12, -34);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.marker;
    ctx.fillText(target.label, 0, 62);
    ctx.restore();
  }

  function drawMinimap(game) {
    const mw = 230;
    const mh = 172;
    const x0 = VIEW.width - mw - 16;
    const y0 = 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.save();
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, x0 - 6, y0 - 6, mw + 12, mh + 12, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(x0, y0, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#5d8a48';
    ctx.fillRect(x0, y0, mw, mh);
    ctx.fillStyle = '#3a3f4a';
    for (const av of ROADS.avenues) ctx.fillRect(x0 + av * sx - 2, y0, 4, mh);
    for (const st of ROADS.streets) ctx.fillRect(x0, y0 + st * sy, mw, 4);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(x0, y0 + 2250 * sy, mw, mh - 2250 * sy);
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(x0, y0 + 2360 * sy, mw, mh - 2360 * sy);
    const target = game.missions.markerTarget();
    if (target) {
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(x0 + target.x * sx, y0 + target.y * sy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of game.police.cars) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of game.gangCars) {
      if (car.health <= 0) continue;
      ctx.fillStyle = '#c77dff';
      ctx.beginPath();
      ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    ctx.save();
    ctx.translate(x0 + game.player.x * sx, y0 + game.player.y * sy);
    ctx.rotate(game.player.angle);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SOLMAR BAY', x0, y0 + mh + 22);
  }

  function drawHud(game) {
    const s = game.state;
    const p = game.player;
    // Top-left: health + cash.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, 16, 16, 250, 64, 10);
    ctx.fill();
    ctx.fillStyle = '#3a3f4a';
    roundRect(ctx, 28, 28, 180, 16, 8);
    ctx.fill();
    ctx.fillStyle = p.health > 50 ? '#7ee081' : p.health > 25 ? '#ffb13d' : '#ff4b3e';
    roundRect(ctx, 28, 28, 180 * clamp(p.health / p.maxHealth, 0, 1), 16, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${Math.ceil(p.health)}`, 214, 41);
    ctx.fillStyle = PALETTE.money;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(`$${s.cash.toLocaleString('en-US')}`, 28, 68);
    // Wanted stars, top centre.
    const stars = s.wanted;
    const sw = 34;
    const totalW = 5 * sw;
    const sx = (VIEW.width - totalW) / 2;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, sx - 12, 14, totalW + 24, 46, 10);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < stars ? '#ffd23f' : 'rgba(255,255,255,0.25)';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', sx + i * sw + sw / 2, 48);
    }
    // Objective banner under the stars.
    const objective = game.missions.objectiveText();
    ctx.font = `700 16px ${FONT}`;
    const ow = ctx.measureText(objective).width + 28;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, (VIEW.width - ow) / 2, 68, ow, 34, 9);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(objective, VIEW.width / 2, 91);
    // Bottom-left: ammo + district.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, 16, VIEW.height - 64, 250, 48, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(p.inCar ? 'E — leave car' : `Ammo ${p.ammo}  •  F — shoot  •  Space — punch`, 28, VIEW.height - 36);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 14px ${FONT}`;
    ctx.fillText(districtAt(p.x, p.y), 28, VIEW.height - 20);
    // Bottom-right: speed when driving.
    if (p.inCar) {
      const speed = Math.round(Math.abs(p.inCar.speed) * 0.16);
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(ctx, VIEW.width - 166, VIEW.height - 64, 150, 48, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 24px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${speed} mph`, VIEW.width - 28, VIEW.height - 30);
    }
    // Banner (mission passed / busted / wasted).
    if (s.banner && s.bannerTimer > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(s.bannerTimer, 0, 1);
      ctx.fillStyle = 'rgba(12,16,24,0.8)';
      roundRect(ctx, VIEW.width / 2 - 320, 130, 640, 92, 12);
      ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.font = `800 34px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(s.banner.text, VIEW.width / 2, 168);
      if (s.banner.sub) {
        ctx.fillStyle = PALETTE.text;
        ctx.font = `400 16px ${FONT}`;
        ctx.fillText(s.banner.sub, VIEW.width / 2, 198);
      }
      ctx.restore();
    }
    if (s.toast && s.toastTimer > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(s.toastTimer, 0, 1);
      ctx.fillStyle = 'rgba(12,16,24,0.75)';
      ctx.font = `700 17px ${FONT}`;
      const tw = ctx.measureText(s.toast).width + 28;
      roundRect(ctx, (VIEW.width - tw) / 2, VIEW.height - 116, tw, 34, 9);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'center';
      ctx.fillText(s.toast, VIEW.width / 2, VIEW.height - 93);
      ctx.restore();
    }
    drawMinimap(game);
  }

  function drawPanel(title, lines, accent) {
    ctx.fillStyle = 'rgba(10, 14, 22, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const w = 680;
    const h = 150 + lines.length * 34;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    ctx.fillStyle = 'rgba(16, 22, 34, 0.96)';
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.marker;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = accent || PALETTE.marker;
    ctx.font = `800 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, VIEW.width / 2, y + 66);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `400 18px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, VIEW.width / 2, y + 116 + i * 34);
    });
  }

  function draw(game, screen) {
    const time = game.state.time;
    const cam = camera(game);
    ctx.save();
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    ctx.translate(-cam.x, -cam.y);
    drawGround(cam);
    drawRoads(cam);
    drawBuildings(game, cam);
    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,20,0.4)';
    ctx.lineWidth = 5;
    for (const s of game.effects.skids) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(s.angle) * 16, s.y + Math.sin(s.angle) * 16);
      ctx.stroke();
    }
    // Pickups.
    for (const p of game.combat.pickups) {
      const bob = Math.sin(p.bob) * 3;
      ctx.fillStyle = p.kind === 'cash' ? '#7ee081' : p.kind === 'health' ? '#ff6b81' : '#ffd23f';
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12200f';
      ctx.font = '700 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.kind === 'cash' ? '$' : p.kind === 'health' ? '+' : 'A', p.x, p.y + bob + 5);
    }
    drawMarker(game, cam, time);
    // Cars: parked, traffic, gang, police.
    for (const car of game.parkedCars) if (car.health > 0) drawCar(car, time);
    for (const car of game.traffic.cars) if (car.health > 0) drawCar(car, time);
    for (const car of game.gangCars) if (car.health > 0) drawCar(car, time);
    for (const car of game.police.cars) drawCar(car, time);
    // People.
    for (const ped of game.traffic.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.down, time, ped.walkPhase);
    }
    for (const cop of game.police.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#1c2f4a', '#e8b88a', cop.down, time, time * 8);
    }
    // Bullets.
    ctx.fillStyle = '#ffe9a8';
    for (const b of game.combat.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player (on foot only — in a car, the car is the body).
    const p = game.player;
    if (!p.inCar) {
      drawPerson(p.x, p.y, p.aimAngle, PALETTE.playerShirt, '#e8b88a', 0, time, p.moving ? time * 10 : 0);
      // Aim line when armed.
      ctx.strokeStyle = 'rgba(255,210,63,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.aimAngle) * 18, p.y + Math.sin(p.aimAngle) * 18);
      ctx.lineTo(p.x + Math.cos(p.aimAngle) * 52, p.y + Math.sin(p.aimAngle) * 52);
      ctx.stroke();
    }
    // Particles and floating text.
    for (const part of game.effects.particles) {
      ctx.globalAlpha = clamp(part.life / part.maxLife, 0, 1);
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'center';
    for (const f of game.effects.floats) {
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Warm sunset wash + vignette over the whole view.
    const wash = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    wash.addColorStop(0, 'rgba(255, 170, 90, 0.05)');
    wash.addColorStop(1, 'rgba(255, 120, 60, 0.10)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(game);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['Take a breath, Jax. Solmar Bay waits.', 'P / Esc — resume    •    M — mute    •    R — restart'], PALETTE.text);
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar Bay PD caught up with you.', `You lost $${150}. The story continues…`], '#7fb3ff');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Solmar Bay is a dangerous place.', `You lost $${150}. The story continues…`], PALETTE.danger);
    } else if (screen === SCREEN_VICTORY) {
      const s = game.state;
      drawPanel('THE BIG SCORE — DONE!', [
        'The briefcase is on the boat. Kane is finished, Sol is paid,',
        `and Jax Marlowe owns the sunset. Total earned: $${s.totalEarned.toLocaleString('en-US')}.`,
        `Missions: ${s.stats.missionsDone}/5    •    Cars stolen: ${s.stats.carsStolen}    •    Time: ${Math.round(s.stats.timePlayed / 60)} min`,
      ], PALETTE.money);
    }
  }

  return { draw, resize, VIEW, screenToWorld };

  /** Convert a mouse position in canvas CSS pixels to world coordinates. */
  function screenToWorld(game, sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const vx = (sx / rect.width) * VIEW.width;
    const vy = (sy / rect.height) * VIEW.height;
    const cam = camera(game);
    return { x: cam.x + vx, y: cam.y + vy };
  }
}
