import { Container, Graphics } from "pixi.js";

const GRID_COLOR = 0x091e2a;
const GRID_SPACING = 80;
const WORLD_SIZE = 4000;
const LINE_WIDTH = 0.5;
const LINE_COUNT = WORLD_SIZE / GRID_SPACING;

// Barely visible at rest
const BASE_ALPHA = 0.04;

// Traveling pulse — a band of light that sweeps across the grid
const PULSE_PEAK = 0.2;
const PULSE_WIDTH = 280; // half-width of the bright band (world px)
const PULSE_SPEED = 90; // world px per second

// Radiant proximity — grid lines near the Radiant glow
const RADIANT_RADIUS = 200;
const RADIANT_PEAK = 0.1;

export class Grid {
  container: Container;
  private gfx: Graphics;
  private time = 0;
  private rx = 2000;
  private ry = 2000;

  constructor() {
    this.container = new Container();
    this.container.zIndex = -1;

    this.gfx = new Graphics();
    this.container.addChild(this.gfx);

    this.draw();
  }

  update(dt: number, radiantX?: number, radiantY?: number) {
    this.time += dt / 60;
    if (radiantX !== undefined) this.rx = radiantX;
    if (radiantY !== undefined) this.ry = radiantY;
    this.draw();
  }

  private lineAlpha(linePos: number, pulsePos: number, radiantPos: number): number {
    let a = BASE_ALPHA;

    // Traveling pulse — wrap-aware distance
    let pd = Math.abs(linePos - pulsePos);
    if (pd > WORLD_SIZE / 2) pd = WORLD_SIZE - pd;
    if (pd < PULSE_WIDTH) {
      const t = pd / PULSE_WIDTH;
      a += PULSE_PEAK * (1 - t) * (1 - t);
    }

    // Radiant proximity
    const rd = Math.abs(linePos - radiantPos);
    if (rd < RADIANT_RADIUS) {
      const t = rd / RADIANT_RADIUS;
      a += RADIANT_PEAK * (1 - t * t);
    }

    return Math.min(a, 0.3);
  }

  private draw() {
    this.gfx.clear();

    // Pulse positions — vertical sweep and horizontal sweep offset
    // to create a diagonal flow feel
    const vPulse = (this.time * PULSE_SPEED) % WORLD_SIZE;
    const hPulse = (this.time * PULSE_SPEED + WORLD_SIZE * 0.35) % WORLD_SIZE;

    // Vertical lines
    for (let i = 0; i <= LINE_COUNT; i++) {
      const x = i * GRID_SPACING;
      const a = this.lineAlpha(x, vPulse, this.rx);
      this.gfx.moveTo(x, 0);
      this.gfx.lineTo(x, WORLD_SIZE);
      this.gfx.stroke({ color: GRID_COLOR, width: LINE_WIDTH, alpha: a });
    }

    // Horizontal lines
    for (let i = 0; i <= LINE_COUNT; i++) {
      const y = i * GRID_SPACING;
      const a = this.lineAlpha(y, hPulse, this.ry);
      this.gfx.moveTo(0, y);
      this.gfx.lineTo(WORLD_SIZE, y);
      this.gfx.stroke({ color: GRID_COLOR, width: LINE_WIDTH, alpha: a });
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
