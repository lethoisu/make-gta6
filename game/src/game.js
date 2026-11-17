// Solmar Bay — the game itself: one world holding the city, the player, traffic,
// police, missions and combat, advanced one fixed step at a time. This module
// knows nothing about the DOM or the canvas; the renderer draws `state` and the
// input module feeds `step`. A Node simulation can drive it headless.
import { BEST_KEY, CAR, MISSIONS, PICKUPS, PLACES, SAVE_KEY, SPAWN, WANTED } from './config.js';
import { createRandom, clamp, distance, randomPick, randomRange } from './random.js';
import { createCity, nearestRoadPoint, randomRoadPoint } from './city.js';
import { createPlayer } from './player.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions, MISSION_EVENT_ALL_DONE, MISSION_EVENT_COMPLETE, MISSION_EVENT_STEP } from './missions.js';
import { createEffects } from './effects.js';
import { engineSound, sfx } from './audio.js';

export const EVENT_NONE = 0;
export const EVENT_MISSION_STEP = 1;
export const EVENT_MISSION_COMPLETE = 2;
export const EVENT_VICTORY = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_WANTED_UP = 32;
export const EVENT_WANTED_DOWN = 64;
export const EVENT_CASH = 128;
export const EVENT_SHOT = 256;
export const EVENT_PUNCH = 512;
export const EVENT_CRASH = 1024;
export const EVENT_STOLEN = 2048;
export const EVENT_ENTER_CAR = 4096;
export const EVENT_EXIT_CAR = 8192;
export const EVENT_PICKUP = 16384;
export const EVENT_HIT = 32768;

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8e4da', '#3da66a', '#e8b93d', '#8a6fd9', '#d97fb0', '#5bc0c9'];

export function createGame(seed = 1, saved = null) {
  const random = createRandom(seed);
  const city = createCity(random);
  const effects = createEffects();
  const traffic = createTraffic(random, city);
  const police = createPolice(random, city);
  const combat = createCombat(random);
  const missions = createMissions();
  const player = createPlayer(SPAWN.x, SPAWN.y);

  const state = {
    screen: 'title',
    time: 0,
    wanted: 0,
    cash: 0,
    totalEarned: 0,
    stats: { carsStolen: 0, pedsDown: 0, shotsFired: 0, missionsDone: 0, timePlayed: 0 },
    banner: null,
    bannerTimer: 0,
    toast: null,
    toastTimer: 0,
    respawnTimer: 0,
    shootWitnessCooldown: 0,
    pedHitCooldown: 0,
    saveTimer: 0,
    muted: false,
    best: 0,
  };

  // Parked cars the player can steal, scattered along the roads.
  const parkedCars = [];
  function spawnParkedCars() {
    const models = ['sedan', 'sedan', 'sport', 'taxi', 'truck', 'sedan', 'sport', 'sedan', 'taxi', 'sedan'];
    for (let i = 0; i < models.length; i += 1) {
      const p = randomRoadPoint(random);
      const onAvenue = Math.abs(p.x - nearestRoadPoint(p.x, p.y).x) < 4;
      const angle = onAvenue ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
      const model = models[i];
      const m = CAR.models[model];
      parkedCars.push({
        kind: 'parked',
        model,
        color: model === 'taxi' ? '#f2c230' : randomPick(random, CAR_COLORS),
        x: p.x + (onAvenue ? randomRange(random, -18, 18) : 0),
        y: p.y + (onAvenue ? 0 : randomRange(random, -18, 18)),
        angle,
        speed: 0,
        length: m.length,
        width: m.width,
        health: m.health,
        maxHealth: m.health,
        driver: null,
      });
    }
  }

  // Rival gang cars for the Payback mission, parked on the street by the casino.
  const gangCars = [];
  function spawnGangCars(count) {
    gangCars.length = 0;
    for (let i = 0; i < count; i += 1) {
      const m = CAR.models.gang;
      gangCars.push({
        kind: 'gang',
        model: 'gang',
        color: '#7a3fa0',
        x: PLACES.casino.x - 260 + i * 130,
        y: PLACES.casino.y + 40,
        angle: -Math.PI / 2,
        speed: 0,
        length: m.length,
        width: m.width,
        health: m.health,
        maxHealth: m.health,
        driver: 'gang',
      });
    }
    missions.setGangTargets(gangCars);
  }

  // Pickups scattered around the city: cash, health and ammo.
  function spawnPickups() {
    for (let i = 0; i < PICKUPS.spawnCount; i += 1) {
      const p = randomRoadPoint(random);
      const kind = i % 3 === 0 ? 'health' : i % 3 === 1 ? 'ammo' : 'cash';
      combat.spawnPickup(kind, p.x + randomRange(random, -40, 40), p.y + randomRange(random, -40, 40),
        kind === 'cash' ? PICKUPS.cashValues[i % PICKUPS.cashValues.length] : 0);
    }
  }

  function allCars() {
    return [...parkedCars, ...traffic.cars, ...police.cars, ...gangCars];
  }

  function nearestCar(maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of allCars()) {
      if (car.health <= 0) continue;
      const d = distance(player.x, player.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function setWanted(value) {
    const next = clamp(Math.round(value), 0, WANTED.max);
    if (next > state.wanted) {
      state.wanted = next;
      police.resetUnseen();
      return EVENT_WANTED_UP;
    }
    state.wanted = next;
    return EVENT_NONE;
  }

  function addWanted(n) {
    if (n <= 0) return EVENT_NONE;
    return setWanted(state.wanted + n);
  }

  function addCash(amount) {
    state.cash += amount;
    state.totalEarned += amount;
    return EVENT_CASH;
  }

  function showBanner(text, sub = '') {
    state.banner = { text, sub };
    state.bannerTimer = 3.2;
  }

  function showToast(text) {
    state.toast = text;
    state.toastTimer = 2.4;
  }

  function explode(x, y) {
    effects.burst(x, y, '#ff7a2f', 26, 260, 0.8, 6);
    effects.burst(x, y, '#3a3f4a', 16, 120, 1.1, 8);
    effects.burst(x, y, '#ffd23f', 12, 200, 0.5, 4);
    effects.addShake(12);
  }

  function wreckCar(car) {
    explode(car.x, car.y);
    if (car === player.inCar) {
      player.exitCar();
      player.hurt(20);
      showToast('Your car blew up!');
    }
    if (car.kind === 'police') addWanted(1);
    if (car.kind === 'gang') missions.setGangTargets(gangCars);
    if (car.kind === 'traffic' || car.kind === 'parked') {
      const i = traffic.cars.indexOf(car);
      if (i >= 0) traffic.cars.splice(i, 1);
      const j = parkedCars.indexOf(car);
      if (j >= 0) parkedCars.splice(j, 1);
    }
    sfx.crash();
  }

  function respawn(kind) {
    // After BUSTED or WASTED: wake at the hospital, fined, heat gone.
    state.cash = Math.max(0, state.cash - WANTED.bustFine);
    player.health = player.maxHealth;
    player.x = PLACES.hospital.x;
    player.y = PLACES.hospital.y + 120;
    player.angle = -Math.PI / 2;
    player.ammo = Math.max(player.ammo, 6);
    state.wanted = 0;
    police.cars.length = 0;
    police.cops.length = 0;
    if (player.inCar) player.exitCar();
    state.screen = 'play';
    showBanner(kind === 'busted' ? 'BUSTED' : 'WASTED', `You lost $${WANTED.bustFine}. The story continues…`);
    save();
  }

  function save() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash,
        totalEarned: state.totalEarned,
        mission: missions.state(),
        stats: state.stats,
        best: state.best,
      }));
      window.localStorage.setItem(BEST_KEY, String(Math.max(state.best, state.totalEarned)));
    } catch {
      // Storage can be off: the save then lasts this visit only.
    }
  }

  function loadSave() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      state.cash = data.cash || 0;
      state.totalEarned = data.totalEarned || 0;
      state.stats = { ...state.stats, ...(data.stats || {}) };
      state.best = data.best || 0;
      missions.restore(data.mission);
      return data;
    } catch {
      return null;
    }
  }

  function newGame() {
    state.screen = 'play';
    state.time = 0;
    state.wanted = 0;
    state.cash = 0;
    state.totalEarned = 0;
    state.stats = { carsStolen: 0, pedsDown: 0, shotsFired: 0, missionsDone: 0, timePlayed: 0 };
    player.health = player.maxHealth;
    player.ammo = 12;
    player.x = SPAWN.x;
    player.y = SPAWN.y;
    if (player.inCar) player.exitCar();
    missions.begin(game);
    const m = missions.current();
    showBanner(m.title, m.briefing);
    sfx.mission();
    save();
  }

  function continueGame() {
    loadSave();
    state.screen = 'play';
    if (player.inCar) player.exitCar();
    player.x = PLACES.hospital.x;
    player.y = PLACES.hospital.y + 120;
    player.health = player.maxHealth;
    const m = missions.current();
    if (m) showBanner(m.title, m.briefing);
  }

  function hasSave() {
    try {
      return typeof window !== 'undefined' && !!window.localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  // --- The one step. `input` is { move, drive, aim, actions } from input.js. ---
  function step(dt, input) {
    let events = EVENT_NONE;
    state.time += dt;
    // Busted / wasted: hold the panel a moment, then wake at the hospital.
    if (state.screen === 'busted' || state.screen === 'wasted') {
      effects.step(dt);
      state.respawnTimer -= dt;
      if (state.respawnTimer <= 0) respawn(state.screen);
      return events;
    }
    if (state.screen !== 'play') {
      effects.step(dt);
      return events;
    }
    state.stats.timePlayed += dt;
    player.tick(dt);
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.toastTimer > 0) state.toastTimer -= dt;
    if (state.shootWitnessCooldown > 0) state.shootWitnessCooldown -= dt;
    if (state.pedHitCooldown > 0) state.pedHitCooldown -= dt;

    const actions = input.actions || 0;
    const ACTION_ENTER = 1;
    const ACTION_PUNCH = 2;
    const ACTION_SHOOT = 4;

    // --- Enter / exit a car. ---
    if (actions & ACTION_ENTER) {
      if (player.inCar) {
        player.exitCar();
        events |= EVENT_EXIT_CAR;
        sfx.click();
      } else {
        const car = nearestCar(CAR.enterRange);
        if (car) {
          player.enterCar(car);
          events |= EVENT_ENTER_CAR;
          state.stats.carsStolen += 1;
          // Stealing puts the heat on — but if the player is already wanted,
          // the same crime does not add another star.
          if (state.wanted === 0) events |= setWanted(1);
          events |= EVENT_STOLEN;
          showToast(car.kind === 'police' ? 'You stole a police car!' : 'Car stolen — the heat is on!');
          sfx.steal();
        }
      }
    }

    // --- On foot: walk / run, punch, shoot. ---
    if (!player.inCar) {
      player.stepOnFoot(dt, input.move || { x: 0, y: 0, run: false }, city);
      if (input.aim) player.aimAngle = Math.atan2(input.aim.y - player.y, input.aim.x - player.x);
      else if (player.moving) player.aimAngle = player.angle;

      if ((actions & ACTION_PUNCH) && player.punchCooldown <= 0) {
        player.punchCooldown = PLAYER.punchCooldown;
        events |= EVENT_PUNCH;
        const targets = [...traffic.peds, ...police.cops];
        // Fists: knock down peds and cops in front of the player.
        const hits = [];
        for (const t of targets) {
          if (t.down > 0) continue;
          const d = distance(player.x, player.y, t.x, t.y);
          if (d > PLAYER.punchRange + 14) continue;
          const toT = Math.atan2(t.y - player.y, t.x - player.x);
          let diff = toT - player.aimAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) < 1.1) hits.push(t);
        }
        for (const t of hits) {
          if (t.health !== undefined) {
            t.health -= PLAYER.punchDamage;
            if (t.health <= 0) t.down = 999;
          } else {
            t.down = 999;
            state.stats.pedsDown += 1;
            events |= addWanted(1);
          }
          effects.burst(t.x, t.y, '#ffffff', 6, 120, 0.4, 3);
        }
        if (hits.length > 0) sfx.punch();
      }

      if ((actions & ACTION_SHOOT) && player.fireCooldown <= 0) {
        player.fireCooldown = 0.28;
        if (player.ammo > 0) {
          player.ammo -= 1;
          state.stats.shotsFired += 1;
          events |= EVENT_SHOT;
          combat.shoot(player.x, player.y, player.aimAngle, 1);
          effects.burst(player.x + Math.cos(player.aimAngle) * 26, player.y + Math.sin(player.aimAngle) * 26, '#ffd23f', 4, 140, 0.25, 3);
          sfx.shot();
          if (state.shootWitnessCooldown <= 0) {
            state.shootWitnessCooldown = 5;
            events |= addWanted(1);
          }
        } else {
          showToast('Out of ammo — find an ammo pickup!');
          sfx.click();
        }
      }
    } else {
      // --- Driving. ---
      const crash = player.stepDriving(dt, input.drive || { throttle: 0, steer: 0 }, city, allCars(), state.time);
      if (crash > 0) {
        events |= EVENT_CRASH;
        const car = player.inCar;
        car.health -= Math.round(crash / 20);
        effects.addShake(Math.min(10, crash / 60));
        effects.burst(car.x, car.y, '#c9c2ae', 8, 140, 0.5, 4);
        sfx.crash();
        if (car.health <= 0) wreckCar(car);
      }
      if (player.inCar && player.inCar.skidding) {
        const car = player.inCar;
        effects.skid(car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14, car.angle);
      }
      engineSound(Math.abs(player.inCar ? player.inCar.speed : 0) / 640, true);
    }
    if (!player.inCar) engineSound(0, false);

    // --- The living city: traffic, pedestrians, police. ---
    const threats = [{ x: player.x, y: player.y, radius: player.inCar && Math.abs(player.speed) > 200 ? 220 : 60 }];
    for (const b of combat.bullets) threats.push({ x: b.x, y: b.y, radius: 90 });
    traffic.step(dt, player, threats, game);

    // Player's car running over pedestrians.
    if (player.inCar && Math.abs(player.inCar.speed) > 150 && state.pedHitCooldown <= 0) {
      for (const ped of traffic.peds) {
        if (ped.down > 0) continue;
        if (distance(player.x, player.y, ped.x, ped.y) < 30) {
          ped.down = 999;
          state.stats.pedsDown += 1;
          state.pedHitCooldown = 3;
          events |= addWanted(1) | EVENT_HIT;
          effects.burst(ped.x, ped.y, '#ff6b5e', 10, 160, 0.6, 4);
          sfx.punch();
          break;
        }
      }
    }

    // Police chase, rams and busts.
    const policeResult = police.step(dt, state.wanted, {
      x: player.x, y: player.y, inCar: !!player.inCar, speed: player.speed,
    }, (damage) => {
      if (player.inCar) {
        player.inCar.health -= damage;
        if (player.inCar.health <= 0) wreckCar(player.inCar);
      } else {
        player.hurt(damage);
        events |= EVENT_HIT;
      }
      effects.addShake(6);
    });
    if (policeResult.busted) {
      events |= EVENT_BUSTED;
      showBanner('BUSTED', 'The Solmar Bay PD caught up with you.');
      sfx.fail();
      state.screen = 'busted';
      state.respawnTimer = 2.6;
      return events;
    }
    // Wanted decay when the heat cannot see the player.
    if (state.wanted > 0 && policeResult.unseenTimer > WANTED.decaySeconds) {
      state.wanted -= 1;
      police.resetUnseen();
      events |= EVENT_WANTED_DOWN;
      if (state.wanted === 0) showToast('You lost the cops.');
    }

    // --- Combat: bullets and pickups. ---
    const combatEvents = combat.step(dt, city, allCars(), [...traffic.peds, ...police.cops], player, (pickup) => {
      if (pickup.kind === 'cash') {
        events |= addCash(pickup.value);
        effects.floatText(player.x, player.y - 24, `+$${pickup.value}`, '#7ee081');
        sfx.cash();
      } else if (pickup.kind === 'health') {
        player.heal(PICKUPS.healthAmount);
        effects.floatText(player.x, player.y - 24, `+${PICKUPS.healthAmount} HP`, '#7ee081');
        sfx.heal();
      } else if (pickup.kind === 'ammo') {
        player.ammo += 12;
        effects.floatText(player.x, player.y - 24, '+12 ammo', '#ffd23f');
        sfx.pickup();
      }
      events |= EVENT_PICKUP;
    });
    for (const car of combatEvents.carDestroyed) {
      if (car.health <= 0) wreckCar(car);
    }
    if (combatEvents.pedHit > 0) {
      state.stats.pedsDown += combatEvents.pedHit;
      events |= addWanted(1);
    }

    // --- Missions. ---
    missions.setGangTargets(gangCars);
    const missionEvents = missions.update({ player, wanted: state.wanted, gangCars }, game);
    if (missionEvents & MISSION_EVENT_STEP) {
      const m = missions.current();
      if (m) showToast(missions.objectiveText());
    }
    if (missionEvents & MISSION_EVENT_COMPLETE) {
      const done = missions.state();
      state.stats.missionsDone = done.index;
      const finished = MISSIONS[done.index - 1];
      if (finished) {
        showBanner('Mission passed!', `${finished.title} — $${finished.payout}`);
        effects.floatText(player.x, player.y - 30, `+$${finished.payout}`, '#7ee081');
      }
      sfx.mission();
      save();
    }
    if (missionEvents & MISSION_EVENT_ALL_DONE) {
      state.screen = 'victory';
      state.best = Math.max(state.best, state.totalEarned);
      events |= EVENT_VICTORY;
      sfx.win();
      save();
      return events;
    }

    // --- Wasted. ---
    if (player.health <= 0) {
      events |= EVENT_WASTED;
      showBanner('WASTED', 'Solmar Bay is a dangerous place.');
      sfx.fail();
      state.screen = 'wasted';
      state.respawnTimer = 2.6;
      return events;
    }

    effects.step(dt);
    state.saveTimer += dt;
    if (state.saveTimer > 12) {
      state.saveTimer = 0;
      save();
    }
    return events;
  }

  spawnParkedCars();
  spawnPickups();
  loadSave();

  const game = {
    state, city, player, traffic, police, combat, missions, effects,
    parkedCars, gangCars,
    step, newGame, continueGame, hasSave, save, loadSave,
    setWanted, addWanted, addCash, showBanner, showToast,
    spawnGangCars, allCars, nearestCar,
  };
  return game;
}
