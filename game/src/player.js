// The player: on foot and behind the wheel. On foot the player walks, runs,
// punches and aims; in a car the car is the body — acceleration, steering,
// drift and crashes. Entering a car steals it (and its driver flees).
import { CAR, PLAYER, WORLD } from './config.js';
import { angleDiff, clamp, distance } from './random.js';
import { collidesBuilding, clampToWorld, pushOutOfBuilding } from './city.js';

export function createPlayer(x, y) {
  const player = {
    x, y,
    angle: -Math.PI / 2,
    speed: 0,
    health: PLAYER.health,
    maxHealth: PLAYER.health,
    inCar: null,
    onFoot: true,
    running: false,
    moving: false,
    punchCooldown: 0,
    fireCooldown: 0,
    ammo: 12,
    aimAngle: -Math.PI / 2,
    invulnerable: 0,
  };

  /** Move on foot. `move` is {x, y} normalized; `run` is Shift. */
  function stepOnFoot(dt, move, city) {
    const speed = move.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    player.running = move.run;
    player.moving = move.x !== 0 || move.y !== 0;
    if (player.moving) {
      const want = Math.atan2(move.y, move.x);
      player.angle += angleDiff(player.angle, want) * Math.min(1, dt * 14);
    }
    const nx = player.x + move.x * speed * dt;
    const ny = player.y + move.y * speed * dt;
    if (!collidesBuilding(city, nx, player.y, PLAYER.radius)) player.x = nx;
    if (!collidesBuilding(city, player.x, ny, PLAYER.radius)) player.y = ny;
    const c = clampToWorld(player.x, player.y);
    player.x = c.x;
    player.y = c.y;
    player.speed = player.moving ? speed : 0;
  }

  /**
   * Drive the car the player sits in. `drive` is {throttle (-1..1), steer (-1..1)}.
   * Returns the crash impulse (0 when no crash) so the game can damage and shake.
   */
  function stepDriving(dt, drive, city, cars, nowSeconds) {
    const car = player.inCar;
    if (!car) return 0;
    const model = CAR.models[car.model];
    let crash = 0;
    // Steering: sharper at low speed, looser at full speed.
    const steerAuthority = 2.6 * (1 - Math.min(0.55, Math.abs(car.speed) / model.top * 0.55));
    car.angle += drive.steer * steerAuthority * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 120 + 0.25);
    // Acceleration and drag.
    if (drive.throttle > 0) car.speed += model.accel * drive.throttle * dt;
    else if (drive.throttle < 0) car.speed += model.accel * 0.75 * drive.throttle * dt;
    else car.speed *= Math.max(0, 1 - 0.7 * dt);
    if (car.speed > 0) car.speed = Math.min(car.speed, model.top);
    else car.speed = Math.max(car.speed, -model.reverse);
    car.speed *= Math.max(0, 1 - 0.12 * dt);
    // Skid marks when turning hard at speed.
    if (Math.abs(drive.steer) > 0.7 && Math.abs(car.speed) > 320) car.skidding = true;
    else car.skidding = false;

    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const r = Math.max(car.length, car.width) / 2 - 4;
    // Never start a step wedged: a bump may have shoved the car into a wall.
    const freed = pushOutOfBuilding(city, car.x, car.y, r);
    car.x = freed.x;
    car.y = freed.y;
    // Slide along walls: try the full move, then each axis alone, so a car
    // nose-against a building can slip along its face instead of wedging.
    if (!collidesBuilding(city, nx, ny, r)) {
      car.x = nx;
      car.y = ny;
    } else if (!collidesBuilding(city, nx, car.y, r)) {
      car.x = nx;
    } else if (!collidesBuilding(city, car.x, ny, r)) {
      car.y = ny;
    } else {
      // Crash into a building: stop hard, take damage.
      if (Math.abs(car.speed) > CAR.crashDamageSpeed) crash = Math.abs(car.speed);
      car.speed *= -0.25;
    }
    const c = clampToWorld(car.x, car.y);
    car.x = c.x;
    car.y = c.y;
    // Car-car bumps.
    for (const other of cars) {
      if (other === car || other.health <= 0) continue;
      const d = distance(car.x, car.y, other.x, other.y);
      const minD = (car.length + other.length) / 2 - 6;
      if (d < minD && d > 0.01) {
        const push = (minD - d) / 2;
        const ux = (car.x - other.x) / d;
        const uy = (car.y - other.y) / d;
        car.x += ux * push;
        car.y += uy * push;
        other.x -= ux * push;
        other.y -= uy * push;
        // Scrub speed and take crash damage at most once per 1.5 s of game
        // time: without the cooldown a ram ground the player to a standstill
        // in under a second, and a long overlap shredded the car instead.
        if ((nowSeconds - (car.lastBumpAt || -99)) > 1.5) {
          if (Math.abs(car.speed) > 240) crash = Math.max(crash, Math.abs(car.speed) * 0.6);
          car.speed *= 0.85;
          car.lastBumpAt = nowSeconds;
        }
      }
    }
    // A bump may have shoved either car into a wall: push both back out.
    const freed2 = pushOutOfBuilding(city, car.x, car.y, r);
    car.x = freed2.x;
    car.y = freed2.y;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = Math.abs(car.speed);
    return crash;
  }

  function enterCar(car) {
    player.inCar = car;
    player.onFoot = false;
    car.driver = 'player';
    car.speed = 0;
    player.x = car.x;
    player.y = car.y;
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return null;
    car.driver = null;
    car.speed = 0;
    player.inCar = null;
    player.onFoot = true;
    // Step out to the side of the car.
    const side = player.angle + Math.PI / 2;
    player.x = car.x + Math.cos(side) * 34;
    player.y = car.y + Math.sin(side) * 34;
    player.speed = 0;
    return car;
  }

  function hurt(amount) {
    if (player.invulnerable > 0) return;
    player.health = Math.max(0, player.health - amount);
    player.invulnerable = 0.35;
  }

  function heal(amount) {
    player.health = Math.min(player.maxHealth, player.health + amount);
  }

  function tick(dt) {
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
  }

  return Object.assign(player, {
    stepOnFoot, stepDriving, enterCar, exitCar, hurt, heal, tick,
  });
}
