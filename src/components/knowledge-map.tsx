"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods, type GraphData, type LinkObject, type NodeObject,
} from "react-force-graph-2d";
import { Eye, EyeOff, Maximize2, Network, ZoomIn, ZoomOut } from "lucide-react";
import type { AppState, GraphEdgeRecord } from "@/lib/contracts";

interface KnowledgeMapProps {
  state: AppState;
  selectedObjectId: string | null;
  onSelectObject(id: string): void;
}

type KnowledgeNode = {
  id: string;
  label: string;
  icon: string;
  color: string;
  kind: "object" | "note";
  detail: string;
  degree: number;
};

type KnowledgeLink = {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeRecord["kind"];
  label: string;
  weight: number;
};

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function nodeId(value: string | NodeObject<KnowledgeNode> | undefined) {
  return typeof value === "object" ? String(value.id) : String(value ?? "");
}

export function KnowledgeMap({ state, selectedObjectId, onSelectObject }: KnowledgeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<KnowledgeNode, KnowledgeLink> | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [showNotes, setShowNotes] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setDimensions({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo<GraphData<KnowledgeNode, KnowledgeLink>>(() => {
    const links: KnowledgeLink[] = state.graphEdges.map((edge) => ({ ...edge }));
    const degrees = new Map<string, number>();
    const addDegree = (id: string, value: number) => degrees.set(id, (degrees.get(id) ?? 0) + value);
    links.forEach((link) => {
      addDegree(link.source, Math.max(1, link.weight));
      addDegree(link.target, Math.max(1, link.weight));
    });
    if (showNotes) {
      state.notes.forEach((note) => note.mentions.forEach((object) => {
        const link: KnowledgeLink = {
          id: `mention:${note.id}:${object.id}`,
          source: `note:${note.id}`,
          target: object.id,
          kind: "mention",
          label: "",
          weight: 1,
        };
        links.push(link);
        addDegree(link.source, 1);
        addDegree(link.target, 1);
      }));
    }
    const nodes: NodeObject<KnowledgeNode>[] = state.objects.map((object, index) => {
      const angle = index * 2.399963;
      const radius = 24 * Math.sqrt(index);
      return {
        id: object.id,
        label: object.name,
        icon: object.typeIcon,
        color: object.typeColor,
        kind: "object",
        detail: `${object.typeName}: ${object.name}`,
        degree: degrees.get(object.id) ?? 0,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
    if (showNotes) {
      state.notes.forEach((note, index) => nodes.push({
        id: `note:${note.id}`,
        label: note.title || note.contentText.slice(0, 28) || "Nota sem título",
        icon: "✎",
        color: "#8a9098",
        kind: "note",
        detail: note.contentText.slice(0, 180),
        degree: degrees.get(`note:${note.id}`) ?? 0,
        x: Math.cos(index * 2.399963) * 70,
        y: Math.sin(index * 2.399963) * 70,
      }));
    }
    return { nodes, links };
  }, [showNotes, state.graphEdges, state.notes, state.objects]);

  const highlightedIds = useMemo(() => {
    if (!hoveredId) return null;
    const ids = new Set([hoveredId]);
    graphData.links.forEach((link) => {
      const source = nodeId(link.source);
      const target = nodeId(link.target);
      if (source === hoveredId) ids.add(target);
      if (target === hoveredId) ids.add(source);
    });
    return ids;
  }, [graphData.links, hoveredId]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !dimensions.width) return;
    graph.d3Force("charge")?.strength?.(-155);
    graph.d3Force("link")?.distance?.((link: LinkObject<KnowledgeNode, KnowledgeLink>) => {
      const kind = link.kind;
      return kind === "mention" ? 65 : kind === "relationship" ? 92 : 82;
    });
    graph.d3Force("link")?.strength?.((link: LinkObject<KnowledgeNode, KnowledgeLink>) => Math.min(0.8, 0.22 + (link.weight ?? 1) * 0.1));
    graph.d3ReheatSimulation();
  }, [dimensions.width, graphData]);

  const paintNode = useCallback((node: NodeObject<KnowledgeNode>, context: CanvasRenderingContext2D, scale: number) => {
    if (node.x === undefined || node.y === undefined) return;
    const id = String(node.id);
    const selected = id === selectedObjectId;
    const highlighted = !highlightedIds || highlightedIds.has(id);
    const symbolSize = (selected ? 24 : 20 + Math.min(node.degree, 5)) / scale;
    const fontSize = 10 / scale;
    context.save();
    context.globalAlpha = highlighted ? 1 : 0.2;
    if (selected) {
      context.beginPath();
      context.arc(node.x, node.y, symbolSize * 0.78, 0, Math.PI * 2);
      context.fillStyle = `${node.color}22`;
      context.fill();
    }
    roundedRect(context, node.x - symbolSize / 2, node.y - symbolSize / 2, symbolSize, symbolSize, 6 / scale);
    context.fillStyle = node.kind === "note" ? "#25263a" : "#17182a";
    context.fill();
    context.strokeStyle = node.color;
    context.lineWidth = (selected ? 1.8 : 1.2) / scale;
    context.stroke();
    context.fillStyle = node.kind === "note" ? "#c9d9eb" : node.color;
    context.font = `${12 / scale}px "Segoe UI Symbol", "Segoe UI Emoji", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(node.icon, node.x, node.y + 0.5 / scale);

    context.font = `${selected ? 650 : 550} ${fontSize}px "Segoe UI", sans-serif`;
    const labelWidth = context.measureText(node.label).width + 10 / scale;
    const labelHeight = 17 / scale;
    const labelY = node.y + symbolSize / 2 + 7 / scale;
    roundedRect(context, node.x - labelWidth / 2, labelY, labelWidth, labelHeight, 4 / scale);
    context.fillStyle = selected ? `${node.color}88` : "rgba(23,18,38,.95)";
    context.fill();
    context.fillStyle = "#f5f1f7";
    context.textBaseline = "middle";
    context.fillText(node.label, node.x, labelY + labelHeight / 2);
    context.restore();
  }, [highlightedIds, selectedObjectId]);

  const paintNodeHitArea = useCallback((node: NodeObject<KnowledgeNode>, color: string, context: CanvasRenderingContext2D, scale: number) => {
    if (node.x === undefined || node.y === undefined) return;
    const size = 34 / scale;
    context.fillStyle = color;
    context.fillRect(node.x - size / 2, node.y - size / 2, size, size + 22 / scale);
  }, []);

  const paintLinkLabel = useCallback((link: LinkObject<KnowledgeNode, KnowledgeLink>, context: CanvasRenderingContext2D, scale: number) => {
    if (!link.label || typeof link.source !== "object" || typeof link.target !== "object") return;
    const source = link.source as NodeObject<KnowledgeNode>;
    const target = link.target as NodeObject<KnowledgeNode>;
    if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return;
    const sourceId = String(source.id);
    const targetId = String(target.id);
    if (hoveredId && hoveredId !== sourceId && hoveredId !== targetId) return;
    const x = (source.x + target.x) / 2;
    const y = (source.y + target.y) / 2;
    const fontSize = 8 / scale;
    context.save();
    context.font = `600 ${fontSize}px "Segoe UI", sans-serif`;
    const width = context.measureText(link.label).width + 8 / scale;
    const height = 14 / scale;
    roundedRect(context, x - width / 2, y - height / 2, width, height, 3 / scale);
    context.fillStyle = link.kind === "suggestion" ? "#4b154b" : link.kind === "relationship" ? "#173957" : "#242235";
    context.fill();
    context.fillStyle = link.kind === "suggestion" ? "#ffd4e8" : link.kind === "relationship" ? "#c8e4f8" : "#bbb5c4";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(link.label, x, y);
    context.restore();
  }, [hoveredId]);

  if (!state.objects.length) {
    return <div className="center-empty"><div className="empty-orbit">◎</div><h2>Seu mapa começa com uma menção</h2><p>Crie uma nota e digite @ para adicionar uma pessoa, projeto ou ideia.</p></div>;
  }

  return <div className="map-shell graph-map-shell">
    <div className="graph-toolbar">
      <div className="graph-toolbar-title"><Network size={15} /><span><strong>Grafo de conhecimento</strong><small>{state.objects.length} objetos · {state.graphEdges.length} correlações</small></span></div>
      <div className="graph-legend" aria-label="Legenda do mapa">
        <span><i className="legend-line cooccurrence" /> Coocorrência</span>
        <span><i className="legend-line relationship" /> Confirmada</span>
        <span><i className="legend-line suggestion" /> Sugestão</span>
      </div>
      <button className="graph-notes-toggle" onClick={() => setShowNotes((value) => !value)}>{showNotes ? <EyeOff size={14} /> : <Eye size={14} />}{showNotes ? "Ocultar notas" : "Exibir notas"}</button>
    </div>
    <div className="force-graph-stage" ref={containerRef}>
      {dimensions.width > 0 && <ForceGraph2D<KnowledgeNode, KnowledgeLink>
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        backgroundColor="#121321"
        nodeLabel={(node) => node.detail}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintNodeHitArea}
        linkColor={(link) => {
          const connected = !hoveredId || nodeId(link.source) === hoveredId || nodeId(link.target) === hoveredId;
          if (!connected) return "rgba(89,82,105,.09)";
          return link.kind === "suggestion" ? "#e5006d" : link.kind === "relationship" ? "#4f9fd1" : link.kind === "mention" ? "#514b62" : "#6a6274";
        }}
        linkWidth={(link) => link.kind === "relationship" ? 1.8 : Math.min(3, 0.8 + link.weight * 0.35)}
        linkLineDash={(link) => link.kind === "suggestion" ? [5, 5] : link.kind === "mention" ? [2, 3] : null}
        linkCanvasObjectMode={() => "after"}
        linkCanvasObject={paintLinkLabel}
        warmupTicks={70}
        cooldownTicks={180}
        d3VelocityDecay={0.32}
        minZoom={0.25}
        maxZoom={5}
        showPointerCursor
        onEngineStop={() => graphRef.current?.zoomToFit(450, 110)}
        onNodeHover={(node) => setHoveredId(node ? String(node.id) : null)}
        onNodeClick={(node) => {
          if (node.kind === "note") return;
          onSelectObject(String(node.id));
          if (node.x !== undefined && node.y !== undefined) {
            graphRef.current?.centerAt(node.x, node.y, 350);
            graphRef.current?.zoom(2.1, 350);
          }
        }}
      />}
    </div>
    <div className="force-graph-controls" aria-label="Controles do mapa">
      <button aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.35, 220)}><ZoomIn size={14} /></button>
      <button aria-label="Diminuir zoom" title="Diminuir zoom" onClick={() => graphRef.current?.zoom(graphRef.current.zoom() / 1.35, 220)}><ZoomOut size={14} /></button>
      <button aria-label="Ajustar grafo à tela" title="Ajustar à tela" onClick={() => graphRef.current?.zoomToFit(350, 110)}><Maximize2 size={14} /></button>
    </div>
    <div className="graph-open-source">Force Graph · MIT</div>
  </div>;
}
