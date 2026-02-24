import { Application, extend } from "@pixi/react";
import { Container } from "pixi.js";
import { type RefObject } from "react";
import ArchitectureView from "./ArchitectureView";

extend({ Container });

interface CanvasProps {
  containerRef: RefObject<HTMLDivElement | null>;
}

export default function Canvas({ containerRef }: CanvasProps) {
  return (
    <Application
      background="#0a0a0a"
      resizeTo={containerRef}
      antialias
      resolution={window.devicePixelRatio || 1}
      autoDensity
    >
      <ArchitectureView />
    </Application>
  );
}
