// The story: five missions from Sol Reyes, each a chain of steps (steal a car,
// drive somewhere, collect packages, lose the heat, destroy gang cars, grab the
// briefcase). The mission tracker only reads the world and reports progress —
// the game owns the world, this owns the story.
import { MISSIONS, PLACES } from './config.js';
import { distance } from './random.js';

export const MISSION_EVENT_COMPLETE = 1;
export const MISSION_EVENT_STEP = 2;
export const MISSION_EVENT_ALL_DONE = 4;

export function createMissions() {
  let index = 0;
  let stepIndex = 0;
  let progress = 0;
  let active = false;
  let collectSpots = [];
  let gangTargets = [];

  function current() {
    return index < MISSIONS.length ? MISSIONS[index] : null;
  }

  function currentStep() {
    const m = current();
    return m ? m.steps[stepIndex] : null;
  }

  function objectiveText() {
    const m = current();
    if (!m) return 'Story complete — Solmar Bay is yours. Free roam!';
    const s = currentStep();
    if (!s) return m.title;
    if (s.type === 'destroy') {
      return `${m.title}: Destroy Kane gang cars (${progress}/${s.count})`;
    }
    return `${m.title}: ${s.text}`;
  }

  /** Where the HUD marker should point, or null. */
  function markerTarget() {
    const s = currentStep();
    if (!s) return null;
    if (s.type === 'goto' || s.type === 'collect') {
      const p = PLACES[s.place];
      return p ? { x: p.x, y: p.y, label: p.label } : null;
    }
    if (s.type === 'destroy' && gangTargets.length > 0) {
      const t = gangTargets[0];
      return { x: t.x, y: t.y, label: 'Gang car' };
    }
    return null;
  }

  function start(indexToStart, game) {
    index = indexToStart;
    stepIndex = 0;
    progress = 0;
    active = true;
    collectSpots = [];
    gangTargets = [];
    const m = current();
    if (m && m.wantedOnStart) game.setWanted(m.wantedOnStart);
    if (m && m.id === 'payback') game.spawnGangCars(3);
  }

  function begin(game) {
    start(0, game);
  }

  /**
   * Advance the mission from the world state. `world` carries the player, the
   * collectibles and the gang cars. Returns event flags.
   */
  function update(world, game) {
    if (!active) return 0;
    const m = current();
    if (!m) return 0;
    const s = currentStep();
    if (!s) return 0;
    let events = 0;
    const px = world.player.x;
    const py = world.player.y;

    if (s.type === 'enterCar') {
      if (world.player.inCar) events |= completeStep(game);
    } else if (s.type === 'goto') {
      const p = PLACES[s.place];
      if (p && distance(px, py, p.x, p.y) < p.r) events |= completeStep(game);
    } else if (s.type === 'collect') {
      const p = PLACES[s.place];
      if (p && distance(px, py, p.x, p.y) < p.r) {
        // The package is picked up by arriving; the game also has a pickup
        // entity for the visual, but arrival is what counts.
        events |= completeStep(game);
        if (m.wantedOnPickup && s.text.includes('briefcase')) game.setWanted(m.wantedOnPickup);
      }
    } else if (s.type === 'loseWanted') {
      if (world.wanted === 0) events |= completeStep(game);
    } else if (s.type === 'destroy') {
      const remaining = world.gangCars.filter((c) => c.health > 0).length;
      const done = s.count - remaining;
      if (done !== progress) {
        progress = done;
        events |= MISSION_EVENT_STEP;
      }
      if (remaining === 0) events |= completeStep(game);
    }
    return events;
  }

  function completeStep(game) {
    const m = current();
    const s = currentStep();
    stepIndex += 1;
    let events = MISSION_EVENT_STEP;
    if (stepIndex >= m.steps.length) {
      game.addCash(m.payout);
      events |= MISSION_EVENT_COMPLETE;
      index += 1;
      stepIndex = 0;
      progress = 0;
      gangTargets = [];
      if (index >= MISSIONS.length) {
        active = false;
        events |= MISSION_EVENT_ALL_DONE;
      } else {
        const next = current();
        if (next && next.wantedOnStart) game.setWanted(next.wantedOnStart);
        if (next && next.id === 'payback') game.spawnGangCars(3);
      }
    }
    return events;
  }

  /** Gang cars the tracker should point at (the live ones). */
  function setGangTargets(cars) {
    gangTargets = cars.filter((c) => c.health > 0);
  }

  function state() {
    return { index, stepIndex, progress, active };
  }

  function restore(saved) {
    if (!saved) return;
    index = saved.index || 0;
    stepIndex = saved.stepIndex || 0;
    progress = saved.progress || 0;
    active = index < MISSIONS.length;
  }

  return {
    current, currentStep, objectiveText, markerTarget,
    begin, start, update, completeStep, setGangTargets, state, restore,
  };
}
