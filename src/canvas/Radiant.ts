import { Container, Graphics } from "pixi.js";
import type { RadiantState } from "../agent/types";

const RADIANT_COLOR = 0xf0e6d3;
const RADIANT_CORE_COLOR = 0xffffff;
const GLOW_COLOR = 0xf0e6d3;

export class Radiant {
  container: Container;
  private core: Graphics;
  private rays: Graphics;
  private glow: Graphics;
  private time = 0;
  private state: RadiantState = "idle";

  // Smooth movement
  private currentX = 2000;
  private currentY = 2000;
  private targetX = 2000;
  private targetY = 2000;
  private moveSpeed = 0.03;

  constructor() {
    this.container = new Container();
    this.container.zIndex = 1000;

    // Outer glow
    this.glow = new Graphics();
    this.container.addChild(this.glow);

    // Rays / starburst
    this.rays = new Graphics();
    this.container.addChild(this.rays);

    // Bright core
    this.core = new Graphics();
    this.container.addChild(this.core);

    this.container.position.set(this.currentX, this.currentY);
    this.draw();
  }

  setState(state: RadiantState) {
    this.state = state;
  }

  moveTo(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  setPosition(x: number, y: number) {
    this.currentX = x;
    this.currentY = y;
    this.targetX = x;
    this.targetY = y;
    this.container.position.set(x, y);
  }

  update(dt: number) {
    this.time += dt * 0.02;

    // Lerp toward target
    const dx = this.targetX - this.currentX;
    const dy = this.targetY - this.currentY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 1) {
      // Speed up when far, slow down when close
      const speed = Math.min(this.moveSpeed * (1 + dist * 0.002), 0.12);
      this.currentX += dx * speed;
      this.currentY += dy * speed;
    } else {
      this.currentX = this.targetX;
      this.currentY = this.targetY;
    }

    this.container.position.set(this.currentX, this.currentY);
    this.draw();
  }

  private draw() {
    this.core.clear();
    this.rays.clear();
    this.glow.clear();

    const pulse = this.getPulse();
    const baseRadius = 6;
    const coreRadius = baseRadius * pulse;

    // State-driven visual parameters
    const { rayCount, rayLength, glowRadius, glowAlpha, rotationSpeed } = this.getStateParams();

    // Outer glow
    this.glow.circle(0, 0, glowRadius * pulse);
    this.glow.fill({ color: GLOW_COLOR, alpha: glowAlpha * 0.3 });
    this.glow.circle(0, 0, glowRadius * pulse * 0.6);
    this.glow.fill({ color: GLOW_COLOR, alpha: glowAlpha * 0.15 });

    // Starburst rays
    const rotation = this.time * rotationSpeed;
    for (let i = 0; i < rayCount; i++) {
      const angle = rotation + (i / rayCount) * Math.PI * 2;
      const len = rayLength * (0.7 + 0.3 * Math.sin(this.time * 3 + i * 1.5));
      const x1 = Math.cos(angle) * coreRadius;
      const y1 = Math.sin(angle) * coreRadius;
      const x2 = Math.cos(angle) * (coreRadius + len);
      const y2 = Math.sin(angle) * (coreRadius + len);
      this.rays.moveTo(x1, y1);
      this.rays.lineTo(x2, y2);
    }
    this.rays.stroke({ color: RADIANT_COLOR, width: 1.5, alpha: 0.7 });

    // Core
    this.core.circle(0, 0, coreRadius);
    this.core.fill({ color: RADIANT_CORE_COLOR, alpha: 0.95 });
    this.core.circle(0, 0, coreRadius * 0.6);
    this.core.fill({ color: RADIANT_CORE_COLOR, alpha: 1 });
  }

  private getPulse(): number {
    switch (this.state) {
      case "idle":
        return 0.9 + Math.sin(this.time * 2) * 0.1;
      case "reading":
        return 0.95 + Math.sin(this.time * 4) * 0.05;
      case "writing":
        return 1.0 + Math.sin(this.time * 1.5) * 0.15;
      case "querying":
        return 0.85 + Math.sin(this.time * 6) * 0.15;
      case "thinking":
        return 0.8 + Math.sin(this.time * 3) * 0.2;
      case "complete":
        return 1.1 + Math.sin(this.time * 1) * 0.05;
      default:
        return 1;
    }
  }

  private getStateParams() {
    switch (this.state) {
      case "idle":
        return { rayCount: 8, rayLength: 10, glowRadius: 20, glowAlpha: 0.4, rotationSpeed: 0.3 };
      case "reading":
        return { rayCount: 12, rayLength: 14, glowRadius: 25, glowAlpha: 0.6, rotationSpeed: 0.8 };
      case "writing":
        return { rayCount: 16, rayLength: 20, glowRadius: 35, glowAlpha: 0.8, rotationSpeed: 0.2 };
      case "querying":
        return { rayCount: 6, rayLength: 30, glowRadius: 18, glowAlpha: 0.5, rotationSpeed: 2.0 };
      case "thinking":
        return { rayCount: 10, rayLength: 12, glowRadius: 22, glowAlpha: 0.5, rotationSpeed: 1.2 };
      case "complete":
        return { rayCount: 20, rayLength: 25, glowRadius: 40, glowAlpha: 1.0, rotationSpeed: 0.1 };
      default:
        return { rayCount: 8, rayLength: 10, glowRadius: 20, glowAlpha: 0.4, rotationSpeed: 0.3 };
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
