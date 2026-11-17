// Traffic and pedestrians: the city alive around the player. Traffic cars drive
// along the road grid and turn at intersections; pedestrians stroll the sidewalks
// and flee from gunfire, crashes and speeding cars. No drawing here — only motion.
import { CAR, PEDS, ROADS, TRAFFIC, WORLD } from './config.js';
import { angleDiff, clamp, distance, randomPick, randomRange } from './random.js';
import { isInBuilding, nearestRoadPoint, randomRoadPoint, randomSidewalkPoint } from './city.js';

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8e4da', '#3da66a', '#e8b93d', '#8a6fd9', '#d97fb0', '#5bc0c9'];
const PED_SHIRTS = ['#e8503a', '#3d7dd9', '#3da66a', '#e8b93d', '#8a6fd9', '#e8e4da', '#d97fb0', '#5bc0c9'];

function makeTrafficCar(random, city, x, y) {
  const onAvenue = random() < 0.5;
  const road = onAvenue ? randomPick(random, ROADS.avenues) : randomPick(random, ROADS.streets);
  const px = x !== undefined ? x : (onAvenue ? road : randomRange(random, 120, WORLD.width - 120));
  const py = y !== undefined ? y : (onAvenue ? randomRange(random, 120, WORLD.height - 220) : road);
  const model = random() < 0.12 ? 'taxi' : 'sedan';
  const m = CAR.models[model];
  const angle = onAvenue ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
  return {
    kind: 'traffic',
    model,
    color: model === 'taxi' ? '#f2c230' : randomPick(random, CAR_COLORS),
    x: px, y: py, angle,
    speed: TRAFFIC.speed + randomRange(random, -TRAFFIC.speedJitter, TRAFFIC.speedJitter),
    length: m.length, width: m.width,
    health: m.health, maxHealth: m.health,
    driver: true,
    stopped: 0,
  };
}

function makePedestrian(random, city) {
  const p = randomSidewalkPoint(city, random);
  return {
    x: p.x, y: p.y,
    angle: randomRange(random, 0, Math.PI * 2),
    speed: PEDS.walkSpeed * randomRange(random, 0.8, 1.25),
    shirt: randomPick(random, PED_SHIRTS),
    skin: randomPick(random, ['#e8b88a', '#c98d5f', '#8a5a3b', '#f0c8a0']),
    fleeing: 0,
    down: 0,
    walkPhase: randomRange(random, 0, Math.PI * 2),
    target: null,
  };
}

/** Turn a traffic car toward the nearest intersection direction when it reaches one. */
function steerTrafficCar(car, dt, random) {
  const { avenues, streets, width } = ROADS;
  const half = width / 2;
  const nearAvenue = avenues.find((a) => Math.abs(car.x - a) < 6);
  const nearStreet = streets.find((s) => Math.abs(car.y - s) < 6);
  if (nearAvenue !== undefined && nearStreet !== undefined) {
    // At an intersection: mostly go straight, sometimes turn.
    const roll = random();
    const goingVertical = Math.abs(Math.sin(car.angle)) > 0.7;
    if (roll < 0.22) {
      car.angle = goingVertical ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  // Nudge back onto the road centre if drifting.
  const road = nearestRoadPoint(car.x, car.y);
  const goingVertical = Math.abs(Math.sin(car.angle)) > 0.7;
  if (goingVertical) {
    car.x += clamp(road.x - car.x, -1, 1) * 40 * dt;
  } else {
    car.y += clamp(road.y - car.y, -1, 1) * 40 * dt;
  }
}

export function createTraffic(random, city) {
  const cars = [];
  const peds = [];
  for (let i = 0; i < TRAFFIC.cars; i += 1) cars.push(makeTrafficCar(random, city));
  for (let i = 0; i < PEDS.count; i += 1) peds.push(makePedestrian(random, city));

  /** Keep the counts topped up around the player; far-away ones respawn nearby. */
  function maintain(px, py) {
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      if (distance(cars[i].x, cars[i].y, px, py) > 1400) cars[i] = makeTrafficCar(random, city);
    }
    while (cars.length < TRAFFIC.cars) cars.push(makeTrafficCar(random, city));
    for (let i = peds.length - 1; i >= 0; i -= 1) {
      if (peds[i].down > 0) continue;
      if (distance(peds[i].x, peds[i].y, px, py) > 1200) peds[i] = makePedestrian(random, city);
    }
    while (peds.length < PEDS.count) peds.push(makePedestrian(random, city));
  }

  /** Step traffic and pedestrians. `threats` are {x, y, radius} to flee from. */
  function step(dt, playerPos, threats, game) {
    for (const car of cars) {
      // A car the player stole answers to the player, not to traffic.
      if (car.driver === 'player') continue;
      if (car.stopped > 0) { car.stopped -= dt; continue; }
      steerTrafficCar(car, dt, random);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // Wrap around the world edges so traffic never runs out.
      if (car.x < 60) { car.x = 60; car.angle = 0; }
      if (car.x > WORLD.width - 60) { car.x = WORLD.width - 60; car.angle = Math.PI; }
      if (car.y < 60) { car.y = 60; car.angle = Math.PI / 2; }
      if (car.y > WORLD.height - 120) { car.y = WORLD.height - 120; car.angle = -Math.PI / 2; }
    }
    for (const ped of peds) {
      ped.walkPhase += dt * 6;
      if (ped.down > 0) { ped.down -= dt; continue; }
      let flee = null;
      for (const t of threats) {
        if (distance(ped.x, ped.y, t.x, t.y) < t.radius) { flee = t; break; }
      }
      if (flee) {
        ped.fleeing = 1.2;
        const away = Math.atan2(ped.y - flee.y, ped.x - flee.x);
        ped.angle += angleDiff(ped.angle, away) * Math.min(1, dt * 8);
        ped.x += Math.cos(ped.angle) * PEDS.fleeSpeed * dt;
        ped.y += Math.sin(ped.angle) * PEDS.fleeSpeed * dt;
      } else if (ped.fleeing > 0) {
        ped.fleeing -= dt;
        ped.x += Math.cos(ped.angle) * PEDS.fleeSpeed * 0.6 * dt;
        ped.y += Math.sin(ped.angle) * PEDS.fleeSpeed * 0.6 * dt;
      } else {
        // Stroll: pick a new sidewalk target now and then.
        if (!ped.target || distance(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
          ped.target = randomSidewalkPoint(city, random);
        }
        const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
        ped.angle += angleDiff(ped.angle, want) * Math.min(1, dt * 4);
        const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
        const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
        if (!isInBuilding(city, nx, ny, 16) && ny < city.beachY + 80) {
          ped.x = nx;
          ped.y = ny;
        } else {
          ped.target = null;
        }
      }
      const c = { x: clamp(ped.x, 30, WORLD.width - 30), y: clamp(ped.y, 30, WORLD.height - 40) };
      ped.x = c.x;
      ped.y = c.y;
    }
    maintain(playerPos.x, playerPos.y);
  }

  return { cars, peds, step, maintain };
}
