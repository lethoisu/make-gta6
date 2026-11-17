// Keyboard and mouse input. Held keys give movement and driving; one-shot
// presses (enter a car, punch, shoot, pause) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted
// twice. The mouse aims the pistol; its world position is computed by main.js
// from the camera, so this module only tracks the screen position.
export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_SHOOT = 4;
export const ACTION_PAUSE = 8;
export const ACTION_CONFIRM = 16;
export const ACTION_MUTE = 32;
export const ACTION_RESTART = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['Space']);
const SHOOT = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CONFIRM = new Set(['Enter']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function onKeyDown(event) {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) ||
        RIGHT.has(event.code) || RUN.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(event.code)) { actions |= ACTION_PUNCH; event.preventDefault(); }
    else if (SHOOT.has(event.code)) actions |= ACTION_SHOOT;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (RESTART.has(event.code)) actions |= ACTION_RESTART;
    else return;
    event.preventDefault();
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  function onMouseMove(event) {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_SHOOT;
    }
  }

  function onMouseUp() {
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('mousemove', onMouseMove);
  target.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  function has(code) {
    for (const c of held) if (code.has(c)) return true;
    return false;
  }

  return {
    /** Normalised on-foot movement {x, y, run}. */
    move() {
      const x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const y = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len, run: has(RUN) };
    },
    /** Driving {throttle (-1..1), steer (-1..1)}. */
    drive() {
      return {
        throttle: (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0),
        steer: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
      };
    },
    /** Mouse position in canvas CSS pixels, or null when untouched. */
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
