// Keyboard and mouse, gathered in one place. The game reads held keys and the
// mouse every step; one-shot actions (interact, pause, confirm, mute) queue up
// as bit flags the main loop drains once per frame, so a tap between frames is
// never lost. A synthetic twin of this interface steers the screenshot scenes
// and the automated play-test, so staged scenes run the real input path.

export const ACTION_INTERACT = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let queued = 0;

  function code(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(code(event));
    if (code(event) === 'KeyE') queued |= ACTION_INTERACT;
    if (code(event) === 'Escape' || code(event) === 'KeyP') queued |= ACTION_PAUSE;
    if (code(event) === 'Enter' || code(event) === 'Space') queued |= ACTION_CONFIRM;
    if (code(event) === 'KeyM') queued |= ACTION_MUTE;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code(event))) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(code(event)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      queued |= ACTION_CONFIRM;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    keys,
    mouse,
    held(...codes) {
      return codes.some((c) => keys.has(c));
    },
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
    queueAction(action) {
      queued |= action;
    },
  };
}

/** A scripted input with the same shape, for staged scenes and tests. */
export function createScriptedInput() {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let queued = 0;
  return {
    keys,
    mouse,
    held(...codes) {
      return codes.some((c) => keys.has(c));
    },
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
    queueAction(action) {
      queued |= action;
    },
    setKey(c, down) {
      if (down) keys.add(c);
      else keys.delete(c);
    },
    setMouse(x, y, down) {
      mouse.x = x;
      mouse.y = y;
      mouse.down = down;
    },
  };
}
