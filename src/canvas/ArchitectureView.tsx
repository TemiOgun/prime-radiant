import { useApplication } from "@pixi/react";
import { useEffect, useRef } from "react";
import { Viewport as PixiViewport } from "pixi-viewport";
import { Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";
import { forceSimulation, forceManyBody, forceCenter, forceCollide } from "d3-force";
import type { SimulationNodeDatum } from "d3-force";
import { useStore } from "../store";
import { Radiant } from "./Radiant";
import { Grid } from "./Grid";
import type {
  ModuleNode,
  ServiceNode,
  ModuleEdge,
  ServiceEdge,
  FileNode,
} from "../types/graph";

const SERVICE_COLORS: Record<string, number> = {
  database: 0x3b82f6,
  cache: 0xf59e0b,
  auth: 0xa855f7,
  payments: 0x22c55e,
  storage: 0x06b6d4,
  email: 0xef4444,
  monitoring: 0xf97316,
  queue: 0x8b5cf6,
  external_api: 0x6366f1,
  internal_service: 0x64748b,
};

const FILE_TYPE_COLORS: Record<string, number> = {
  component: 0x3b82f6,
  route: 0x22c55e,
  hook: 0xa855f7,
  util: 0xf59e0b,
  model: 0x06b6d4,
  config: 0x64748b,
  other: 0x555555,
};

const MODULE_BORDER = 0x404040;
const MODULE_FILL = 0x1a1a1a;
const MODULE_BORDER_SELECTED = 0xe0e0e0;
const EDGE_COLOR = 0x333333;
const FILE_FILL = 0x141414;

const labelStyle = new TextStyle({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  fill: 0xe0e0e0,
  align: "center",
});

const sublabelStyle = new TextStyle({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 10,
  fill: 0x888888,
  align: "center",
});

const fileLabelStyle = new TextStyle({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
  fill: 0xd0d0d0,
  align: "center",
});

const fileTypeLabelStyle = new TextStyle({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 9,
  fill: 0x777777,
  align: "center",
});

function drawModuleNode(g: Graphics, node: ModuleNode, isSelected: boolean) {
  const w = 140;
  const h = 60;
  const r = 8;
  g.roundRect(node.x - w / 2, node.y - h / 2, w, h, r);
  g.fill(MODULE_FILL);
  g.stroke({
    color: isSelected ? MODULE_BORDER_SELECTED : MODULE_BORDER,
    width: isSelected ? 2 : 1,
  });
}

function drawFileNode(g: Graphics, file: FileNode) {
  const w = 100;
  const h = 36;
  const r = 6;
  const color = FILE_TYPE_COLORS[file.fileType] ?? 0x555555;
  g.roundRect(file.x - w / 2, file.y - h / 2, w, h, r);
  g.fill(FILE_FILL);
  g.stroke({ color, width: 1.5 });
}

function drawServiceNode(g: Graphics, node: ServiceNode) {
  const radius = 30;
  const color = SERVICE_COLORS[node.category] ?? 0x6366f1;
  g.circle(node.x, node.y, radius);
  g.fill({ color, alpha: 0.15 });
  g.stroke({ color, width: 1.5 });
}

function drawModuleEdges(g: Graphics, edges: ModuleEdge[], modules: ModuleNode[]) {
  const nodeMap = new Map(modules.map((m) => [m.id, m]));
  for (const edge of edges) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) continue;
    const thickness = Math.min(Math.max(edge.weight * 0.5, 0.5), 4);
    const alpha = Math.min(0.3 + edge.weight * 0.1, 0.8);
    g.moveTo(src.x, src.y);
    g.lineTo(tgt.x, tgt.y);
    g.stroke({ color: EDGE_COLOR, width: thickness, alpha });
  }
}

function drawServiceEdges(
  g: Graphics,
  edges: ServiceEdge[],
  modules: ModuleNode[],
  services: ServiceNode[]
) {
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  for (const edge of edges) {
    const src = moduleMap.get(edge.source);
    const tgt = serviceMap.get(edge.target);
    if (!src || !tgt) continue;
    const color = SERVICE_COLORS[tgt.category] ?? 0x555555;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dashLen = 6;
    const gapLen = 4;
    const steps = Math.floor(dist / (dashLen + gapLen));
    const nx = dx / dist;
    const ny = dy / dist;
    for (let i = 0; i < steps; i++) {
      const startD = i * (dashLen + gapLen);
      const endD = startD + dashLen;
      g.moveTo(src.x + nx * startD, src.y + ny * startD);
      g.lineTo(src.x + nx * endD, src.y + ny * endD);
    }
    g.stroke({ color, width: 1, alpha: 0.5 });
  }
}

interface ForceNode extends SimulationNodeDatum {
  id: string;
}

function layoutFiles(files: FileNode[]): FileNode[] {
  if (files.length === 0) return [];

  const nodes: ForceNode[] = files.map((f) => ({ id: f.id, x: 2000, y: 2000 }));

  const sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(-150))
    .force("center", forceCenter(2000, 2000))
    .force("collide", forceCollide(65))
    .stop();

  for (let i = 0; i < 200; i++) sim.tick();

  const posMap = new Map(nodes.map((n) => [n.id, { x: n.x!, y: n.y! }]));
  return files.map((f) => {
    const pos = posMap.get(f.id)!;
    return { ...f, x: pos.x, y: pos.y };
  });
}

export default function ArchitectureView() {
  const { app } = useApplication();
  const viewportRef = useRef<PixiViewport | null>(null);
  const radiantRef = useRef<Radiant | null>(null);
  const gridRef = useRef<Grid | null>(null);
  const graph = useStore((s) => s.graph);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const radiantState = useStore((s) => s.radiantState);
  const radiantTargetNodeId = useStore((s) => s.radiantTargetNodeId);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const setExpandedModuleId = useStore((s) => s.setExpandedModuleId);
  const viewLevel = useStore((s) => s.viewLevel);
  const expandedModuleId = useStore((s) => s.expandedModuleId);

  // Initialize viewport + grid + radiant + ticker
  useEffect(() => {
    if (viewportRef.current) return;

    const viewport = new PixiViewport({
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      worldWidth: 4000,
      worldHeight: 4000,
      events: app.renderer.events,
    });

    viewport.drag().pinch().wheel().decelerate();
    viewport.clampZoom({ minScale: 0.1, maxScale: 3 });
    viewport.moveCenter(2000, 2000);
    viewport.sortableChildren = true;

    app.stage.addChild(viewport);
    viewportRef.current = viewport;

    // Create Grid (behind everything)
    const grid = new Grid();
    viewport.addChild(grid.container);
    gridRef.current = grid;

    // Create the Radiant
    const radiant = new Radiant();
    radiant.setPosition(2000, 2000);
    viewport.addChild(radiant.container);
    radiantRef.current = radiant;

    // Animation ticker
    const ticker = new Ticker();
    ticker.add((tick) => {
      radiant.update(tick.deltaTime);
      grid.update(tick.deltaTime, radiant.container.x, radiant.container.y);
    });
    ticker.start();

    return () => {
      ticker.stop();
      ticker.destroy();
      grid.destroy();
      gridRef.current = null;
      radiant.destroy();
      radiantRef.current = null;
      app.stage.removeChild(viewport);
      viewport.destroy();
      viewportRef.current = null;
    };
  }, [app]);

  // Update radiant state + target
  useEffect(() => {
    const radiant = radiantRef.current;
    if (!radiant) return;

    radiant.setState(radiantState);

    if (radiantTargetNodeId) {
      const mod = graph.modules.find((m) => m.id === radiantTargetNodeId);
      const svc = graph.services.find((s) => s.id === radiantTargetNodeId);
      const target = mod || svc;
      if (target) {
        radiant.moveTo(target.x, target.y);
      }
    }
  }, [radiantState, radiantTargetNodeId, graph]);

  // Redraw graph — branches on viewLevel
  useEffect(() => {
    const viewport = viewportRef.current;
    const radiant = radiantRef.current;
    const grid = gridRef.current;
    if (!viewport) return;

    // Remove everything except grid and radiant
    const children = [...viewport.children];
    for (const child of children) {
      if (child === radiant?.container || child === grid?.container) continue;
      viewport.removeChild(child);
    }

    if (viewLevel === "tactical") {
      drawTacticalView(viewport, graph, expandedModuleId, setSelectedNodeId);
    } else {
      drawStrategicView(
        viewport,
        graph,
        selectedNodeId,
        setSelectedNodeId,
        setExpandedModuleId
      );
    }
  }, [
    graph,
    selectedNodeId,
    setSelectedNodeId,
    setExpandedModuleId,
    viewLevel,
    expandedModuleId,
  ]);

  return null;
}

function drawStrategicView(
  viewport: PixiViewport,
  graph: ReturnType<typeof useStore.getState>["graph"],
  selectedNodeId: string | null,
  setSelectedNodeId: (id: string | null) => void,
  setExpandedModuleId: (id: string | null) => void
) {
  const { modules, services, moduleEdges, serviceEdges } = graph;
  if (modules.length === 0 && services.length === 0) return;

  // Draw edges first (behind nodes)
  const edgeGraphics = new Graphics();
  edgeGraphics.zIndex = 0;
  drawModuleEdges(edgeGraphics, moduleEdges, modules);
  drawServiceEdges(edgeGraphics, serviceEdges, modules, services);
  viewport.addChild(edgeGraphics);

  // Draw module nodes
  for (const mod of modules) {
    const container = new Container();
    container.zIndex = 10;
    container.eventMode = "static";
    container.cursor = "pointer";

    const bg = new Graphics();
    drawModuleNode(bg, mod, mod.id === selectedNodeId);
    container.addChild(bg);

    const label = new Text({ text: mod.name, style: labelStyle });
    label.anchor.set(0.5);
    label.position.set(mod.x, mod.y - 8);
    container.addChild(label);

    const sublabel = new Text({
      text: `${mod.fileCount} files`,
      style: sublabelStyle,
    });
    sublabel.anchor.set(0.5);
    sublabel.position.set(mod.x, mod.y + 10);
    container.addChild(sublabel);

    container.on("pointerdown", () => {
      setSelectedNodeId(mod.id);
    });
    container.on("pointertap", (e) => {
      if (e.detail === 2) {
        setExpandedModuleId(mod.id);
      }
    });

    viewport.addChild(container);
  }

  // Draw service nodes
  for (const svc of services) {
    const container = new Container();
    container.zIndex = 10;
    container.eventMode = "static";
    container.cursor = "pointer";

    const bg = new Graphics();
    drawServiceNode(bg, svc);
    container.addChild(bg);

    const label = new Text({ text: svc.label, style: labelStyle });
    label.anchor.set(0.5);
    label.position.set(svc.x, svc.y + 40);
    container.addChild(label);

    const catLabel = new Text({
      text: svc.category.replace("_", " "),
      style: sublabelStyle,
    });
    catLabel.anchor.set(0.5);
    catLabel.position.set(svc.x, svc.y - 2);
    container.addChild(catLabel);

    container.on("pointerdown", () => {
      setSelectedNodeId(svc.id);
    });

    viewport.addChild(container);
  }
}

function drawTacticalView(
  viewport: PixiViewport,
  graph: ReturnType<typeof useStore.getState>["graph"],
  expandedModuleId: string | null,
  setSelectedNodeId: (id: string | null) => void
) {
  if (!expandedModuleId) return;

  const rawFiles = graph.filesByModule[expandedModuleId];
  if (!rawFiles || rawFiles.length === 0) return;

  const files = layoutFiles(rawFiles);

  // Draw file nodes
  for (const file of files) {
    const container = new Container();
    container.zIndex = 10;
    container.eventMode = "static";
    container.cursor = "pointer";

    const bg = new Graphics();
    drawFileNode(bg, file);
    container.addChild(bg);

    const label = new Text({ text: file.name, style: fileLabelStyle });
    label.anchor.set(0.5);
    label.position.set(file.x, file.y - 5);
    container.addChild(label);

    const typeLabel = new Text({ text: file.fileType, style: fileTypeLabelStyle });
    typeLabel.anchor.set(0.5);
    typeLabel.position.set(file.x, file.y + 9);
    container.addChild(typeLabel);

    container.on("pointerdown", () => {
      setSelectedNodeId(file.id);
    });

    viewport.addChild(container);
  }

  // Snap camera to center of file layout at zoom 1.5
  viewport.setZoom(1.5);
  viewport.moveCenter(2000, 2000);
}
