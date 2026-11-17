// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between screens: title, play, paused,
// busted, wasted and victory.
//
// ?seed=N fixes the city. ?shot=start|chase|mission|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createGame } from './game.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RESTART, ACTION_SHOOT, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';
import { setMuted, startMusic, stopMusic, unlockAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const titleOverlay = document.getElementById('title-overlay');
const btnNew = document.getElementById('btn-new');
const btnContinue = document.getElementById('btn-continue');
const btnResume = document.getElementById('btn-resume');
const btnRestart = document.getElementById('btn-restart');
const btnAgain = document.getElementById('btn-again');
const btnMenu = document.getElementById('btn-menu');

const game = createGame(seed);
const renderer = createRenderer(canvas);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

function runShot(name) {
  // Screenshots show the game itself: hide the DOM title overlay for every
  // scene except the title screen, which is the overlay.
  if (name !== 'start') titleOverlay.classList.add('hidden');
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  // The test hook: the play-test reads the live state through this.
  window.__solmar = {
    game,
    get screen() { return screen; },
    get wanted() { return game.state.wanted; },
    get cash() { return game.state.cash; },
    get mission() { return game.missions.current() ? game.missions.current().id : null; },
    get missionStep() { return game.missions.state().stepIndex; },
    get health() { return game.player.health; },
    get inCar() { return !!game.player.inCar; },
    get speed() { return game.player.speed; },
    get cars() {
      return game.allCars()
        .filter((c) => c.health > 0)
        .map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), model: c.model }));
    },
    get playerX() { return game.player.x; },
    get playerY() { return game.player.y; },
  };

  function announce(message) {
    status.textContent = message;
  }

  function showOverlay(which) {
    for (const el of [titleOverlay, btnResume, btnRestart, btnAgain, btnMenu]) {
      if (el) el.classList.add('hidden');
    }
    if (which === 'title') {
      titleOverlay.classList.remove('hidden');
      btnContinue.classList.toggle('hidden', !game.hasSave());
    }
  }

  function startNewGame() {
    unlockAudio();
    startMusic();
    game.newGame();
    screen = SCREEN_PLAY;
    showOverlay(null);
    announce('Playing. Steal a car and drive to Sol\'s Garage.');
  }

  function continueGame() {
    unlockAudio();
    startMusic();
    game.continueGame();
    screen = SCREEN_PLAY;
    showOverlay(null);
    announce('Continuing your story.');
  }

  function backToTitle() {
    stopMusic();
    game.state.screen = SCREEN_TITLE;
    screen = SCREEN_TITLE;
    showOverlay('title');
    announce('Solmar Bay. Press Enter or click New Game to start.');
  }

  function togglePause() {
    if (screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function toggleMute() {
    const muted = !game.state.muted;
    game.state.muted = muted;
    setMuted(muted);
    announce(muted ? 'Muted.' : 'Sound on.');
  }

  btnNew.addEventListener('click', startNewGame);
  btnContinue.addEventListener('click', continueGame);
  if (btnResume) btnResume.addEventListener('click', togglePause);
  if (btnRestart) btnRestart.addEventListener('click', () => { startNewGame(); });
  if (btnAgain) btnAgain.addEventListener('click', startNewGame);
  if (btnMenu) btnMenu.addEventListener('click', backToTitle);

  function handleActions(actions) {
    if (actions & ACTION_MUTE) toggleMute();
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        if (game.hasSave()) continueGame();
        else startNewGame();
      }
      return;
    }
    if (screen === SCREEN_VICTORY) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startNewGame();
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) return;
    if (actions & ACTION_PAUSE) togglePause();
    if (screen === SCREEN_PAUSED) return;
    if (actions & ACTION_RESTART) startNewGame();
  }

  function readInput() {
    const mouse = input.mouse();
    const aim = mouse ? renderer.screenToWorld(game, mouse.x, mouse.y) : null;
    return {
      move: input.move(),
      drive: input.drive(),
      aim,
      actions: 0,
    };
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      // The city stays alive behind the title: step the world as play, then
      // put the screen back — missions are not begun yet, so nothing scores.
      game.state.screen = 'play';
      game.step(STEP, { move: { x: 0, y: 0, run: false }, drive: { throttle: 0, steer: 0 }, aim: null, actions: 0 });
      game.state.screen = 'title';
      return;
    }
    if (screen === SCREEN_PAUSED) return;
    const frameInput = readInput();
    // This frame's one-shot presses, folded in once only.
    frameInput.actions = actions & (ACTION_ENTER | ACTION_PUNCH | ACTION_SHOOT);
    game.step(STEP, frameInput);
    // Mirror the game's own screen (busted / wasted / victory).
    if (game.state.screen === 'busted') screen = SCREEN_BUSTED;
    else if (game.state.screen === 'wasted') screen = SCREEN_WASTED;
    else if (game.state.screen === 'victory') screen = SCREEN_VICTORY;
    else if (game.state.screen === 'play' && (screen === SCREEN_BUSTED || screen === SCREEN_WASTED)) {
      screen = SCREEN_PLAY;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PAUSED) {
      accumulator = 0;
    } else {
      // One-shot presses apply to the first catch-up step only, never twice.
      let firstStep = true;
      while (accumulator >= STEP) {
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    }
    renderer.draw(game, screen);
    // Pause / end-screen buttons live in the DOM so they are clickable.
    if (btnResume) btnResume.classList.toggle('hidden', screen !== SCREEN_PAUSED);
    if (btnRestart) btnRestart.classList.toggle('hidden', screen !== SCREEN_PAUSED);
    if (btnAgain) btnAgain.classList.toggle('hidden', screen !== SCREEN_VICTORY);
    if (btnMenu) btnMenu.classList.toggle('hidden', screen !== SCREEN_VICTORY);
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) togglePause();
  });

  showOverlay('title');
  announce('Solmar Bay. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
