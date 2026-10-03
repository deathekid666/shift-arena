export class ShellArmorSystem {
  constructor({ input, health, onChange }) {
    this.input = input;
    this.health = health;
    this.onChange = onChange;
    this.maxCharges = 2;
    this.charges = 2;
    this.restoreAmount = 50;
    this.useTime = 1.6;
    this.useTimer = 0;
    this.using = false;
    this.emit();
  }

  update(dt) {
    if (this.using) {
      this.useTimer = Math.max(0, this.useTimer - dt);
      if (this.useTimer <= 0) {
        this.using = false;
        const restored = this.health.restoreArmor(this.restoreAmount);
        if (restored > 0) this.charges = Math.max(0, this.charges - 1);
        this.emit();
      } else {
        this.emit();
      }
      return;
    }

    if (
      this.input.pointerLocked &&
      this.input.consume('armor') &&
      this.charges > 0 &&
      this.health.alive &&
      this.health.shield < this.health.cfg.maxShield
    ) {
      this.using = true;
      this.useTimer = this.useTime;
      this.emit();
    }
  }

  addCharge(amount = 1) {
    const before = this.charges;
    this.charges = Math.min(this.maxCharges, this.charges + amount);
    const added = this.charges - before;
    if (added > 0) this.emit();
    return added;
  }

  reset() {
    this.charges = this.maxCharges;
    this.using = false;
    this.useTimer = 0;
    this.emit();
  }

  get progress() {
    if (!this.using) return 0;
    return 1 - this.useTimer / this.useTime;
  }

  emit() {
    this.onChange?.({
      charges: this.charges,
      maxCharges: this.maxCharges,
      using: this.using,
      progress: this.progress
    });
  }
}
