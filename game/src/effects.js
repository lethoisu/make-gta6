// Feel: particles, floating text, skid marks and screen shake. Pure state and
// numbers — the renderer draws them. Nothing here touches the DOM.
import { clamp } from './random.js';

export function createEffects() {
  const particles = [];
  const floats = [];
  const skids = [];
  let shake = 0;

  function burst(x, y, color, count, speed = 160, life = 0.6, size = 4) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: life * (0.6 + Math.random() * 0.7),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
      });
    }
    if (particles.length > 320) particles.splice(0, particles.length - 320);
  }

  function floatText(x, y, text, color = '#ffffff') {
    floats.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
    if (floats.length > 24) floats.shift();
  }

  function skid(x, y, angle) {
    skids.push({ x, y, angle, life: 4 });
    if (skids.length > 160) skids.shift();
  }

  function addShake(amount) {
    shake = clamp(shake + amount, 0, 18);
  }

  function step(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      const f = floats[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      skids[i].life -= dt;
      if (skids[i].life <= 0) skids.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 26);
  }

  function shakeOffset() {
    if (shake <= 0.2) return { x: 0, y: 0 };
    return {
      x: (Math.random() * 2 - 1) * shake * 0.6,
      y: (Math.random() * 2 - 1) * shake * 0.6,
    };
  }

  return { particles, floats, skids, burst, floatText, skid, addShake, step, shakeOffset };
}
