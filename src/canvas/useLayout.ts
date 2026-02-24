import { useEffect } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { useStore } from "../store";

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  kind: "module" | "service";
}

interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  weight?: number;
}

export function useLayout() {
  const graph = useStore((s) => s.graph);
  const setGraph = useStore((s) => s.setGraph);

  useEffect(() => {
    const { modules, services, moduleEdges, serviceEdges } = graph;
    if (modules.length === 0 && services.length === 0) return;

    // Skip if layout already computed (non-zero positions)
    const alreadyLaid = modules.some((m) => m.x !== 0 || m.y !== 0);
    if (alreadyLaid) return;

    const nodes: LayoutNode[] = [
      ...modules.map((m) => ({
        id: m.id,
        kind: "module" as const,
        x: 2000 + Math.random() * 200 - 100,
        y: 2000 + Math.random() * 200 - 100,
      })),
      ...services.map((s) => ({
        id: s.id,
        kind: "service" as const,
        x: 2000 + Math.random() * 400 - 200,
        y: 2000 + Math.random() * 400 - 200,
      })),
    ];

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const links: LayoutLink[] = [
      ...moduleEdges
        .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
        .map((e) => ({
          source: e.source,
          target: e.target,
          weight: e.weight,
        })),
      ...serviceEdges
        .reduce<{ source: string; target: string }[]>((acc, e) => {
          const key = `${e.source}-${e.target}`;
          if (!acc.find((a) => `${a.source}-${a.target}` === key)) {
            acc.push({ source: e.source, target: e.target });
          }
          return acc;
        }, [])
        .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target)),
    ];

    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink<LayoutNode, LayoutLink>(links)
          .id((d) => d.id)
          .distance((d) => (d.weight ? 200 / Math.max(d.weight, 1) : 250))
          .strength(0.5)
      )
      .force("charge", forceManyBody().strength(-400))
      .force("center", forceCenter(2000, 2000))
      .force("collide", forceCollide(100))
      .stop();

    // Run synchronously
    for (let i = 0; i < 300; i++) sim.tick();

    // Apply computed positions
    const updatedModules = modules.map((m) => {
      const n = nodeMap.get(m.id);
      return n ? { ...m, x: n.x!, y: n.y! } : m;
    });

    const updatedServices = services.map((s) => {
      const n = nodeMap.get(s.id);
      return n ? { ...s, x: n.x!, y: n.y! } : s;
    });

    setGraph({
      ...graph,
      modules: updatedModules,
      services: updatedServices,
    });
  }, [graph, setGraph]);
}
