const ACTION_CODES = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'ControlRight']
};

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.pointerLocked = false;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.isTouch = matchMedia('(pointer: coarse)').matches;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  lockPointer() {
    if (!this.isTouch && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
    }
  }

  down(action) {
    return ACTION_CODES[action].some((code) => this.keys.has(code));
  }

  consume(action) {
    const codes = ACTION_CODES[action];
    const code = codes.find((candidate) => this.pressed.has(candidate));
    if (!code) return false;
    codes.forEach((candidate) => this.pressed.delete(candidate));
    return true;
  }

  consumeLook() {
    const value = { yaw: this.yawDelta, pitch: this.pitchDelta };
    this.yawDelta = 0;
    this.pitchDelta = 0;
    return value;
  }

  onKeyDown = (event) => {
    if (!this.keys.has(event.code)) this.pressed.add(event.code);
    this.keys.add(event.code);
  };

  onKeyUp = (event) => {
    this.keys.delete(event.code);
  };

  onMouseMove = (event) => {
    if (!this.pointerLocked) return;
    this.yawDelta += event.movementX;
    this.pitchDelta += event.movementY;
  };

  onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };
}
