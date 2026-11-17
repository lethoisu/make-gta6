// Combat: fists, the pistol, and what the streets drop. Bullets fly straight,
// punch hits what is close and in front, and pickups (cash, health, ammo) wait
// on the pavement. No drawing — the renderer draws bullets and pickups.
import { CAR, PICKUPS, PISTOL, PLAYER } from './config.js';
import { distance } from './random.js';
import { isInBuilding } from './city.js';

export function createCombat(random) {
  const bullets = [];
  const pickups = [];

  function spawnPickup(kind, x, y, value) {
    pickups.push({ kind, x, y, value: value ?? 0, bob: random() * Math.PI * 2 });
  }

  function scatterCash(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const d = 20 + random() * 60;
      spawnPickup('cash', x + Math.cos(a) * d, y + Math.sin(a) * d,
        PICKUPS.cashValues[Math.floor(random() * PICKUPS.cashValues.length)]);
    }
  }

  /** Fire the pistol from (x, y) along `angle`. Returns true if a shot left. */
  function shoot(x, y, angle, ammoLeft) {
    if (ammoLeft <= 0) return false;
    const spread = (random() - 0.5) * PISTOL.spread * 2;
    bullets.push({
      x: x + Math.cos(angle) * 22,
      y: y + Math.sin(angle) * 22,
      vx: Math.cos(angle + spread) * PISTOL.bulletSpeed,
      vy: Math.sin(angle + spread) * PISTOL.bulletSpeed,
      travelled: 0,
    });
    return true;
  }

  /** A punch: anything close and in front takes damage. Returns what was hit. */
  function punch(x, y, angle, targets) {
    const hits = [];
    for (const t of targets) {
      if (t.health <= 0) continue;
      const d = distance(x, y, t.x, t.y);
      if (d > PLAYER.punchRange + 14) continue;
      const toTarget = Math.atan2(t.y - y, t.x - x);
      let diff = toTarget - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 1.1) hits.push(t);
    }
    return hits;
  }

  /**
   * Step bullets and pickups. `hitCars` are the cars bullets can damage
   * (traffic, police, gang); `hitPeds` the pedestrians. Returns events:
   * { carDestroyed: [...], pedHit: n, pickedUp: [...] }.
   */
  function step(dt, city, hitCars, hitPeds, playerPos, onPickup) {
    const events = { carDestroyed: [], pedHit: 0, pickedUp: [] };
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.travelled += PISTOL.bulletSpeed * dt;
      let dead = b.travelled > PISTOL.range || isInBuilding(city, b.x, b.y, 0);
      if (!dead) {
        for (const car of hitCars) {
          if (car.health <= 0) continue;
          const dx = b.x - car.x;
          const dy = b.y - car.y;
          const along = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
          const across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
          if (along < car.length / 2 + 4 && across < car.width / 2 + 4) {
            car.health -= PISTOL.damage;
            dead = true;
            if (car.health <= 0) events.carDestroyed.push(car);
            break;
          }
        }
      }
      if (!dead) {
        for (const ped of hitPeds) {
          if (ped.down > 0) continue;
          if (distance(b.x, b.y, ped.x, ped.y) < 16) {
            ped.down = 999;
            events.pedHit += 1;
            dead = true;
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const p = pickups[i];
      p.bob += dt * 4;
      if (distance(p.x, p.y, playerPos.x, playerPos.y) < 30) {
        events.pickedUp.push(p);
        onPickup(p);
        pickups.splice(i, 1);
      }
    }
    return events;
  }

  return { bullets, pickups, spawnPickup, scatterCash, shoot, punch, step };
}
