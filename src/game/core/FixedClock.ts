export class FixedClock {
  private accumulator = 0;
  readonly step = 1 / 60;
  reset() {
    this.accumulator = 0;
  }
  advance(seconds: number, tick: (dt: number) => void) {
    // A stalled/background tab never catches up minutes of combat on return.
    this.accumulator += Math.min(0.1, Math.max(0, seconds));
    while (this.accumulator + 1e-9 >= this.step) {
      tick(this.step);
      this.accumulator -= this.step;
    }
  }
}
