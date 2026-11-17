// The screenshot scenes behind ?shot=start|chase|mission|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot, so the frame is what real play looks like and the same seed
// always gives the same frame.
import { PLACES, STEP } from './config.js';
import { angleDiff, clamp, distance } from './random.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const START_SECONDS = 6;
const CHASE_SECONDS = 2;
const MISSION_SECONDS = 1.2;

/** Drive along an avenue toward a point ahead, staying on the road. */
function driveToward(car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDiff(car.angle, want) * 2.2, -1, 1);
  return { throttle: 1, steer };
}

function emptyInput() {
  return { move: { x: 0, y: 0, run: false }, drive: { throttle: 0, steer: 0 }, aim: null, actions: 0 };
}

/**
 * Set `game` to the named scene and return the screen to draw over it.
 * start: title backdrop over a living city. chase: a 3-star police chase in a
 * sport car with the minimap and objective showing. mission: on-foot combat
 * at the casino. end: the victory screen.
 */
export function stageShot(name, game) {
  const state = game.state;
  if (name === 'end') {
    state.cash = 7350;
    state.totalEarned = 7350;
    state.stats.missionsDone = 5;
    state.stats.carsStolen = 7;
    state.stats.timePlayed = 47 * 60;
    game.missions.restore({ index: 5, stepIndex: 0, progress: 0 });
    state.screen = 'victory';
    game.player.x = PLACES.marina.x - 60;
    game.player.y = PLACES.marina.y + 40;
    return { screen: SCREEN_VICTORY };
  }

  state.screen = 'play';
  if (name === 'chase') {
    // Put Jax in a sport car on Palm Avenue, mid-chase, 3 stars up.
    let car = game.parkedCars.find((c) => c.model === 'sport') || game.parkedCars[0];
    car.x = 1750;
    car.y = 2050;
    car.angle = -Math.PI / 2;
    car.speed = 380;
    game.player.enterCar(car);
    game.missions.start(2, game);
    game.setWanted(3);
    game.police.maintain(3, car.x, car.y);
    // The pursuit starts behind the player, on the same avenue, so the shot
    // reads as a chase instead of a head-on pile-up.
    game.police.cars.forEach((pc, i) => {
      pc.x = 1750 + (i === 1 ? -46 : i === 2 ? 46 : 0);
      pc.y = car.y + 320 + i * 130;
      pc.angle = -Math.PI / 2;
      pc.speed = 420;
    });
    // Clear the avenue ahead so the chase runs instead of piling into traffic.
    for (const tc of game.traffic.cars) {
      if (Math.abs(tc.x - 1750) < 90 && tc.y > 800 && tc.y < 2100) {
        tc.x = tc.x < 1750 ? 1250 : 2250;
      }
    }
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      const input = emptyInput();
      input.drive = driveToward(car, 1750, car.y - 400);
      game.step(STEP, input);
      if (state.screen !== 'play') break;
    }
    // A staged chase reads best undamaged: top the car and Jax back up and
    // clear any wreck toast the staging may have raised.
    car.health = car.maxHealth;
    game.player.health = game.player.maxHealth;
    state.toast = null;
    state.toastTimer = 0;
    state.banner = null;
    state.bannerTimer = 0;
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    // On foot at Kane's Casino, pistol out, gang cars in front, 1 star.
    // Payback is mission index 3.
    game.missions.start(3, game);
    game.setWanted(1);
    game.player.x = 2150;
    game.player.y = 1600;
    game.player.ammo = 24;
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      const input = emptyInput();
      const gang = game.gangCars.find((c) => c.health > 0);
      if (gang) {
        const dx = gang.x - game.player.x;
        const dy = gang.y - game.player.y;
        const d = distance(game.player.x, game.player.y, gang.x, gang.y);
        if (d > 220) {
          input.move = { x: dx / d, y: dy / d, run: false };
        }
        input.aim = { x: gang.x, y: gang.y };
        if (d < 460) input.actions = 4; // ACTION_SHOOT
      }
      game.step(STEP, input);
      if (state.screen !== 'play') break;
    }
    return { screen: SCREEN_PLAY };
  }

  // Default: title backdrop — the city alive, no player action.
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    game.step(STEP, emptyInput());
  }
  state.screen = 'title';
  return { screen: SCREEN_TITLE };
}
