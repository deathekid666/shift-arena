const ACTION_CODES = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'ControlRight'],
  reload: ['KeyR'],
  interact: ['KeyE'],
  armor: ['Digit3'],
  melee: ['KeyV'],
  toggleBot: ['KeyB'],
  slot1: ['Digit1'],
  slot2: ['Digit2']
};

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.pointerLocked = false;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.isTouch = matchMedia('(pointer: coarse)').matches;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  lockPointer() {
    if (!this.isTouch && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
    }
  }

  down(action) {
    const codes = ACTION_CODES[action];
    return codes ? codes.some((code) => this.keys.has(code)) : false;
  }

  consume(action) {
    const codes = ACTION_CODES[action];
    if (!codes) return false;
    const code = codes.find((candidate) => this.pressed.has(candidate));
    if (!code) return false;
    codes.forEach((candidate) => this.pressed.delete(candidate));
    return true;
  }

  mouseDown(button) {
    return this.mouseButtons.has(button);
  }

  consumeMouse(button) {
    if (!this.mousePressed.has(button)) return false;
    this.mousePressed.delete(button);
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

  onMouseDown = (event) => {
    if (!this.pointerLocked) return;
    if (!this.mouseButtons.has(event.button)) this.mousePressed.add(event.button);
    this.mouseButtons.add(event.button);
  };

  onMouseUp = (event) => {
    this.mouseButtons.delete(event.button);
  };

  onBlur = () => {
    this.keys.clear();
    this.pressed.clear();
    this.mouseButtons.clear();
    this.mousePressed.clear();
  };

  onMouseMove = (event) => {
    if (!this.pointerLocked) return;
    this.yawDelta += event.movementX;
    this.pitchDelta += event.movementY;
  };

  onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked) {
      this.mouseButtons.clear();
      this.mousePressed.clear();
    }
  };
}
