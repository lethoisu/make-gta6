// The city of Solmar Bay: its roads, blocks, buildings, beach and marina, and the
// helpers that answer "is this point on a road / inside a building" and "how do I
// drive from here to there along the roads". Pure data and geometry — no drawing,
// no browser — so the logic simulation can use it too.
import { PLACES, ROADS, WORLD } from './config.js';
import { clamp, distance, randomInt, randomPick, randomRange } from './random.js';

/** The road grid: intersections are the nodes a route is built from. */
export function createCity(random) {
  const { avenues, streets, width: roadW, beachY } = ROADS;
  const half = roadW / 2;

  // --- Buildings: one per block, kept off the roads and off the special zones. ---
  const buildings = [];
  const specials = [
    // The named landmarks, drawn bigger and labelled.
    { x: 2500, y: 1375, w: 340, h: 220, kind: 'casino', label: "Kane's Casino" },
    { x: 1000, y: 1850, w: 220, h: 140, kind: 'garage', label: "Sol's Garage" },
    { x: 500, y: 475, w: 200, h: 140, kind: 'safehouse', label: 'Safehouse' },
    { x: 2000, y: 475, w: 260, h: 150, kind: 'hospital', label: 'Hospital' },
    { x: 1500, y: 1825, w: 240, h: 150, kind: 'hotel', label: 'Palm Hotel' },
    { x: 2750, y: 475, w: 200, h: 140, kind: 'shop', label: 'Sunset Mall' },
    { x: 500, y: 1375, w: 220, h: 140, kind: 'shop', label: 'Fish Market' },
    { x: 500, y: 925, w: 200, h: 130, kind: 'shop', label: 'Taco Stand' },
    { x: 2750, y: 925, w: 220, h: 140, kind: 'shop', label: 'Neon Arcade' },
  ];
  for (const s of specials) {
    buildings.push({ ...s, color: s.kind === 'casino' ? 'casino' : s.kind === 'hospital' ? 'alt' : 'main' });
  }

  // Fill the other blocks with ordinary buildings, skipping the park and marina.
  const parkBlock = { x0: 1250 + half, x1: 1750 - half, y0: 700 + half, y1: 1150 - half };
  for (let ai = 0; ai < avenues.length - 1; ai += 1) {
    for (let si = 0; si < streets.length - 1; si += 1) {
      const x0 = avenues[ai] + half + 18;
      const x1 = avenues[ai + 1] - half - 18;
      const y0 = streets[si] + half + 18;
      const y1 = streets[si + 1] - half - 18;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // Park block stays green; marina strip stays open; beach row stays sand.
      if (cx > parkBlock.x0 && cx < parkBlock.x1 && cy > parkBlock.y0 && cy < parkBlock.y1) continue;
      if (x0 > 2900) continue;
      if (y0 > beachY - 120) continue;
      if (buildings.some((b) => Math.abs(b.x - cx) < 260 && Math.abs(b.y - cy) < 200)) continue;
      const w = randomRange(random, 150, Math.min(300, x1 - x0));
      const h = randomRange(random, 110, Math.min(220, y1 - y0));
      buildings.push({
        x: cx + randomRange(random, -20, 20),
        y: cy + randomRange(random, -15, 15),
        w, h,
        kind: randomPick(random, ['main', 'main', 'alt']),
        label: null,
        color: randomPick(random, ['main', 'main', 'alt']),
      });
    }
  }

  // Palm trees: along the beach, in the park, and scattered on sidewalks.
  const trees = [];
  for (let x = 120; x < WORLD.width - 100; x += 90) {
    trees.push({ x: x + randomRange(random, -20, 20), y: beachY + randomRange(random, 30, 90) });
  }
  for (let i = 0; i < 26; i += 1) {
    trees.push({
      x: randomRange(random, parkBlock.x0 + 20, parkBlock.x1 - 20),
      y: randomRange(random, parkBlock.y0 + 20, parkBlock.y1 - 20),
    });
  }
  for (let i = 0; i < 30; i += 1) {
    const av = randomPick(random, avenues);
    const st = randomPick(random, streets);
    trees.push({ x: av + (random() < 0.5 ? -1 : 1) * (half + 14), y: st + randomRange(random, -160, 160) });
  }

  // Benches and lamps are decoration the renderer places from the same seed.
  const lamps = [];
  for (const av of avenues) {
    for (const st of streets) {
      lamps.push({ x: av + half + 8, y: st + half + 8 });
    }
  }

  const city = {
    buildings,
    trees,
    lamps,
    park: parkBlock,
    beachY,
    places: PLACES,
  };
  return city;
}

/** True when the point is on a road (or the beach strip, which is drivable sand). */
export function isOnRoad(city, x, y) {
  const { avenues, streets, width } = ROADS;
  const half = width / 2;
  if (y >= city.beachY - 10) return true;
  for (const av of avenues) if (Math.abs(x - av) <= half) return true;
  for (const st of streets) if (Math.abs(y - st) <= half) return true;
  return false;
}

/** True when the point is inside a building's footprint (with a margin for the walls). */
export function isInBuilding(city, x, y, margin = 0) {
  for (const b of city.buildings) {
    if (x > b.x - b.w / 2 - margin && x < b.x + b.w / 2 + margin &&
        y > b.y - b.h / 2 - margin && y < b.y + b.h / 2 + margin) return true;
  }
  return false;
}

/** True when a circle of radius r at (x, y) touches a building. */
export function collidesBuilding(city, x, y, r) {
  return isInBuilding(city, x, y, r);
}

/**
 * Push a point out of every building it overlaps (with margin r), along the
 * smallest penetration — so a car shoved into a wall by a bump can never wedge.
 */
export function pushOutOfBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const minX = b.x - b.w / 2 - r;
    const maxX = b.x + b.w / 2 + r;
    const minY = b.y - b.h / 2 - r;
    const maxY = b.y + b.h / 2 + r;
    if (x > minX && x < maxX && y > minY && y < maxY) {
      const dxl = x - minX;
      const dxr = maxX - x;
      const dyt = y - minY;
      const dyb = maxY - y;
      const m = Math.min(dxl, dxr, dyt, dyb);
      if (m === dxl) x = minX;
      else if (m === dxr) x = maxX;
      else if (m === dyt) y = minY;
      else y = maxY;
    }
  }
  return { x, y };
}

/** Clamp a point into the world, keeping it out of the sea. */
export function clampToWorld(x, y) {
  return {
    x: clamp(x, 40, WORLD.width - 40),
    y: clamp(y, 40, WORLD.height - 60),
  };
}

/** The nearest point on a road centreline to (x, y). */
export function nearestRoadPoint(x, y) {
  const { avenues, streets } = ROADS;
  let best = null;
  let bestD = Infinity;
  for (const av of avenues) {
    const d = Math.abs(x - av);
    if (d < bestD) { bestD = d; best = { x: av, y: clamp(y, 60, WORLD.height - 60) }; }
  }
  for (const st of streets) {
    const d = Math.abs(y - st);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 60, WORLD.width - 60), y: st }; }
  }
  return best;
}

/**
 * A drivable route from (fx, fy) to (tx, ty): a list of waypoints along road
 * centrelines (BFS over intersections), ending at the target. Used by the
 * autopilot in the screenshot scenes and the logic simulation.
 */
export function routeWaypoints(fx, fy, tx, ty) {
  const { avenues, streets } = ROADS;
  const nodes = [];
  for (let ai = 0; ai < avenues.length; ai += 1) {
    for (let si = 0; si < streets.length; si += 1) {
      nodes.push({ x: avenues[ai], y: streets[si], ai, si });
    }
  }
  const key = (ai, si) => `${ai},${si}`;
  const nearest = (x, y) => {
    let best = nodes[0];
    let bestD = Infinity;
    for (const n of nodes) {
      const d = distance(x, y, n.x, n.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  };
  // Pick the intersection a leg starts from. When the point sits on a road,
  // the two intersections bracketing it on that road are the only sensible
  // starts — the globally nearest one may lie the wrong way, forcing a
  // U-turn the driver then has to reverse out of. Of the two, take the one
  // closer to the other end of the trip.
  const pickNode = (x, y, tx2, ty2) => {
    const nearestIdx = (arr, v) => {
      let bi = 0;
      for (let i = 1; i < arr.length; i += 1) if (Math.abs(v - arr[i]) < Math.abs(v - arr[bi])) bi = i;
      return bi;
    };
    const av = nearestIdx(avenues, x);
    const st = nearestIdx(streets, y);
    const onAvenue = Math.abs(x - avenues[av]) < 60;
    const onStreet = Math.abs(y - streets[st]) < 60;
    const closerToGoal = (cands) => cands.reduce(
      (best, n) => (distance(n.x, n.y, tx2, ty2) < distance(best.x, best.y, tx2, ty2) ? n : best),
    );
    if (onAvenue && !onStreet) {
      let k = -1;
      for (let i = 0; i < streets.length; i += 1) if (streets[i] <= y) k = i;
      const cands = [];
      if (k >= 0) cands.push(nodes[av * streets.length + k]);
      if (k + 1 < streets.length) cands.push(nodes[av * streets.length + (k + 1)]);
      if (cands.length > 0) return closerToGoal(cands);
    }
    if (onStreet && !onAvenue) {
      let k = -1;
      for (let i = 0; i < avenues.length; i += 1) if (avenues[i] <= x) k = i;
      const cands = [];
      if (k >= 0) cands.push(nodes[k * streets.length + st]);
      if (k + 1 < avenues.length) cands.push(nodes[(k + 1) * streets.length + st]);
      if (cands.length > 0) return closerToGoal(cands);
    }
    return nearest(x, y);
  };
  const start = pickNode(fx, fy, tx, ty);
  const goal = pickNode(tx, ty, fx, fy);
  const prev = new Map();
  const seen = new Set([key(start.ai, start.si)]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.ai === goal.ai && cur.si === goal.si) break;
    for (const [dai, dsi] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nai = cur.ai + dai;
      const nsi = cur.si + dsi;
      if (nai < 0 || nai >= avenues.length || nsi < 0 || nsi >= streets.length) continue;
      const k = key(nai, nsi);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, cur);
      queue.push(nodes[nai * streets.length + nsi]);
    }
  }
  const path = [];
  let cur = goal;
  let guard = 0;
  while (cur && !(cur.ai === start.ai && cur.si === start.si) && guard < 100) {
    path.unshift({ x: cur.x, y: cur.y });
    cur = prev.get(key(cur.ai, cur.si));
    guard += 1;
  }
  path.push({ x: tx, y: ty });
  return path;
}

/** A random point on a road, for spawning traffic and parked cars. */
export function randomRoadPoint(random) {
  const { avenues, streets } = ROADS;
  if (random() < 0.5) {
    return { x: randomPick(random, avenues), y: randomRange(random, 120, WORLD.height - 200) };
  }
  return { x: randomRange(random, 120, WORLD.width - 120), y: randomPick(random, streets) };
}

/** A random free point on a sidewalk (beside a road, not in a building). */
export function randomSidewalkPoint(city, random) {
  for (let tries = 0; tries < 40; tries += 1) {
    const p = randomRoadPoint(random);
    const x = p.x + (random() < 0.5 ? -1 : 1) * (ROADS.width / 2 + 16);
    const y = p.y + randomRange(random, -120, 120);
    if (!isInBuilding(city, x, y, 20) && y < city.beachY) return { x, y };
  }
  return { x: 1250, y: 300 };
}
