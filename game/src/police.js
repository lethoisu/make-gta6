// The wanted level and the police who answer it. Police cars spawn at the edge
// of view and chase the player; foot cops chase on foot and, if they hold the
// player, it's BUSTED. Lose the cops' line of sight and the heat fades a star
// at a time. Pure logic — no drawing, no browser.
import { CAR, POLICE, WANTED, WORLD } from './config.js';
import { angleDiff, clamp, distance, randomRange } from './random.js';
import { isInBuilding, nearestRoadPoint } from './city.js';

export function createPolice(random, city) {
  const cars = [];
  const cops = [];
  let unseenTimer = 0;
  let bustHold = 0;
  let reinforceTimer = 0;
  let hadPolice = false;

  function wantedCars(wanted) {
    return Math.min(WANTED.maxCars, wanted * WANTED.carsPerStar);
  }

  function spawnPoliceCar(px, py, angle) {
    let road = nearestRoadPoint(px + randomRange(random, -700, 700), py + randomRange(random, -700, 700));
    // Never pop in on top of the player: resample until the spawn is clear.
    for (let tries = 0; tries < 5 && distance(road.x, road.y, px, py) < 450; tries += 1) {
      road = nearestRoadPoint(px + randomRange(random, -700, 700), py + randomRange(random, -700, 700));
    }
    const m = CAR.models.police;
    cars.push({
      kind: 'police',
      model: 'police',
      color: '#2b6cb0',
      x: road.x, y: road.y,
      angle: angle !== undefined ? angle : randomRange(random, 0, Math.PI * 2),
      speed: 0,
      length: m.length, width: m.width,
      health: m.health, maxHealth: m.health,
      sirenPhase: randomRange(random, 0, Math.PI * 2),
    });
  }

  function spawnFootCop(px, py) {
    const a = randomRange(random, 0, Math.PI * 2);
    const x = clamp(px + Math.cos(a) * 420, 60, WORLD.width - 60);
    const y = clamp(py + Math.sin(a) * 420, 60, WORLD.height - 80);
    cops.push({ x, y, angle: a, speed: POLICE.footSpeed, hold: 0, down: 0, health: 60, shirt: '#1c2f4a' });
  }

  /** Make sure the right number of police exist for the wanted level. */
  function maintain(wanted, px, py) {
    const wantCars = wanted > 0 ? wantedCars(wanted) : 0;
    while (cars.length < wantCars) spawnPoliceCar(px, py);
    while (cars.length > wantCars) cars.pop();
    const wantCops = wanted >= 2 ? Math.min(4, (wanted - 1) * WANTED.footCopsPerStar) : 0;
    while (cops.length < wantCops) spawnFootCop(px, py);
    while (cops.length > wantCops) cops.pop();
  }

  /**
   * Step the police. Returns events: { busted, hitPlayer }.
   * `player` is {x, y, inCar, speed}; `onPlayerHit(damage)` is called on a ram.
   */
  function step(dt, wanted, player, onPlayerHit) {
    let busted = false;
    if (wanted <= 0) {
      cars.length = 0;
      cops.length = 0;
      unseenTimer = 0;
      bustHold = 0;
      hadPolice = false;
      return { busted: false };
    }
    if (!hadPolice) {
      // First wave of a fresh chase: the full force arrives at once.
      maintain(wanted, player.x, player.y);
      hadPolice = true;
    } else {
      // Reinforcements trickle in only while the player is seen, one at a
      // time every few seconds. If the heat loses sight, no fresh cars pop
      // in on top of the player — the cops on the tail have to find the
      // player by driving, and ones that fall far behind drop off the chase.
      reinforceTimer -= dt;
      const nearestNow = Math.min(
        ...cars.filter((c) => c.driver !== 'player').map((c) => distance(c.x, c.y, player.x, player.y)),
        ...cops.map((c) => distance(c.x, c.y, player.x, player.y)),
        Infinity,
      );
      if (reinforceTimer <= 0 && nearestNow <= WANTED.unseenRange) {
        if (cars.length < wantedCars(wanted)) spawnPoliceCar(player.x, player.y);
        else {
          const wantCops = wanted >= 2 ? Math.min(4, (wanted - 1) * WANTED.footCopsPerStar) : 0;
          if (cops.length < wantCops) spawnFootCop(player.x, player.y);
        }
        reinforceTimer = 4;
      }
      while (cars.length > wantedCars(wanted)) cars.pop();
      {
        const wantCops = wanted >= 2 ? Math.min(4, (wanted - 1) * WANTED.footCopsPerStar) : 0;
        while (cops.length > wantCops) cops.pop();
      }
    }

    // Police cars: steer toward the player, ram on contact. A car the
    // player stole is theirs now — it stops pursuing (and stops ramming
    // itself) until the player gets out.
    for (const car of cars) {
      if (car.driver === 'player') continue;
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      const want = Math.atan2(player.y - car.y, player.x - car.x);
      const diff = angleDiff(car.angle, want);
      const steer = clamp(diff * 2.4, -2.6, 2.6);
      car.speed = Math.min(POLICE.carTop, car.speed + POLICE.carAccel * dt);
      car.angle += steer * dt * (0.5 + Math.min(1, car.speed / 300));
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.sirenPhase += dt * 6;
      // Slide out of buildings instead of driving through them.
      if (isInBuilding(city, car.x, car.y, 14)) {
        car.x -= Math.cos(car.angle) * car.speed * dt;
        car.y -= Math.sin(car.angle) * car.speed * dt;
        car.angle += 0.9;
        car.speed *= 0.5;
      }
      const d = distance(car.x, car.y, player.x, player.y);
      if (!player.inCar && d < 110) {
        // On foot, the police stop and box the player in instead of running
        // them over — the foot cops do the catching.
        car.speed *= Math.max(0, 1 - 3 * dt);
      } else if (d < 44 && car.speed > 60 && car.ramCooldown <= 0) {
        car.ramCooldown = POLICE.ramCooldown;
        onPlayerHit(POLICE.ramDamage);
        car.speed *= 0.4;
      }
    }

    // Foot cops: run at the player; holding them means BUSTED.
    for (const cop of cops) {
      if (cop.down > 0) { cop.down -= dt; continue; }
      const want = Math.atan2(player.y - cop.y, player.x - cop.x);
      cop.angle += angleDiff(cop.angle, want) * Math.min(1, dt * 6);
      const d = distance(cop.x, cop.y, player.x, player.y);
      if (d > 26) {
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
      }
      if (d < 30 && !player.inCar) {
        cop.hold += dt;
        bustHold += dt;
        if (bustHold >= WANTED.bustHoldSeconds) busted = true;
      } else {
        cop.hold = 0;
      }
    }
    if (cops.every((c) => distance(c.x, c.y, player.x, player.y) >= 30)) bustHold = Math.max(0, bustHold - dt);

    // Cops that fell far behind lost the trail — drop them, so the heat can
    // actually fade when the player outruns the chase.
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      if (distance(cars[i].x, cars[i].y, player.x, player.y) > 1400) cars.splice(i, 1);
    }
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      if (distance(cops[i].x, cops[i].y, player.x, player.y) > 1000) cops.splice(i, 1);
    }

    // Unseen decay: no police within sight range for a while, lose a star.
    // A stolen police car does not count — it is the player's car now.
    const nearest = Math.min(
      ...cars.filter((c) => c.driver !== 'player').map((c) => distance(c.x, c.y, player.x, player.y)),
      ...cops.map((c) => distance(c.x, c.y, player.x, player.y)),
      Infinity,
    );
    if (nearest > WANTED.unseenRange) {
      unseenTimer += dt;
    } else {
      unseenTimer = 0;
    }
    return { busted, unseenTimer };
  }

  function resetUnseen() {
    unseenTimer = 0;
  }

  return { cars, cops, step, maintain, resetUnseen };
}
