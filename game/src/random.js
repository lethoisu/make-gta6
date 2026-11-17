// A small seeded random number generator (mulberry32): the same seed gives the same
// city, which is what makes the screenshot scenes repeatable.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max]. */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** Float in [min, max). */
export function randomRange(random, min, max) {
  return min + random() * (max - min);
}

/** One element of an array. */
export function randomPick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** Clamp a value into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
export function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two points. */
export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
