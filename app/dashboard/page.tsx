"use client";

import * as d3 from "d3";
import {
  AlertTriangle,
  Download,
  FolderGit2,
  Gauge,
  Home,
  Network,
  Package,
  Settings,
  Shield,
  Sparkles,
  Files,
  Timer,
  ShieldAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { StackSenseLogo } from "@/components/stacksense-logo";

type AgentName = "mapper" | "risk" | "auditor" | "scorer";
type AgentStatus = "waiting" | "running" | "done" | "error";
type AgentState = Record<AgentName, { status: AgentStatus; msg: string }>;

const initialAgents: AgentState = {
  mapper: { status: "waiting", msg: "" },
  risk: { status: "waiting", msg: "" },
  auditor: { status: "waiting", msg: "" },
  scorer: { status: "waiting", msg: "" },
};

const AGENT_ORDER: AgentName[] = ["mapper", "risk", "auditor", "scorer"];

const AGENT_LABELS: Record<AgentName, string> = {
  mapper: "Mapper",
  risk: "Risk detector",
  auditor: "Auditor",
  scorer: "Scorer",
};

/** Obsidian + deep teal palette */
const PAGE_BG = "#04151A";
const GLASS_BG = "rgba(22,62,60,0.4)";
const GLASS_BORDER = "rgba(111,148,135,0.15)";
const TXT_PRIMARY = "#e8f0ed";
const TXT_SECONDARY = "#6F9487";
const TXT_MUTED = "rgba(232,240,237,0.38)";
const SECTION_LABEL = "rgba(111,148,135,0.65)";
const ACCENT = "#325F57";
const ACCENT_HOVER = "#6F9487";
const SUCCESS = "#6F9487";
const WARNING = "#d9a23c";
const DANGER = "#c96b5c";
const FILE_MONO = "#8fb5aa";
const SIDEBAR_BG = "#092828";
const SIDEBAR_BORDER = "rgba(111,148,135,0.12)";
const ACTIVE_NAV_BG = "#163E3C";
const ACTIVE_NAV_TEXT = "#6F9487";
const BUTTON_BG = "#325F57";
const BUTTON_TEXT = "#e8f0ed";
const KPI_ICON_COLOR = "#6F9487";
const SIDEBAR_WIDTH = 240;

const quotes = [
  { quote: "The cost of a data breach averages $4.45 million.", source: "IBM Security Report 2023" },
  {
    quote: "73% of developers don't have time to manually audit their dependencies.",
    source: "Stack Overflow Survey",
  },
  {
    quote: "Most vulnerabilities are known for 60 days before they are exploited.",
    source: "Ponemon Institute",
  },
  { quote: "The average codebase contains 158 known vulnerabilities.", source: "Veracode Research" },
  {
    quote: "Only 25% of developers say security is a priority in their workflow.",
    source: "GitHub Security Report",
  },
  { quote: "Supply chain attacks increased 742% in 2022.", source: "Sonatype Report" },
  { quote: "A single outdated dependency can expose your entire application.", source: "OWASP" },
  { quote: "Security should be a feature, not an afterthought.", source: "StackSense" },
];

type NavId = "overview" | "map" | "risk" | "deps" | "insights" | "analyze";

const NAV_ITEMS: { id: NavId; label: string; icon: typeof Home }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "map", label: "Codebase Map", icon: Network },
  { id: "risk", label: "Risk Analysis", icon: Shield },
  { id: "deps", label: "Dependencies", icon: Package },
  { id: "insights", label: "AI Insights", icon: Sparkles },
  { id: "analyze", label: "Analyze", icon: Settings },
];

const AGENT_ICONS: Record<AgentName, typeof FolderGit2> = {
  mapper: FolderGit2,
  risk: ShieldAlert,
  auditor: Package,
  scorer: Gauge,
};

function formatWallMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Dashboard text palette (readability) */
const TEXT_HEADING = "#ffffff";
const TEXT_LABEL = "#9ab8ae";
const TEXT_DESC = "#b8d4c8";
const TEXT_NAV = "#c4ddd5";
const TEXT_META = "#6F9487";

function healthScoreTierColor(score: number): string {
  const s = Math.min(100, Math.max(0, score));
  if (s >= 80) return "#28ca41";
  if (s >= 60) return "#ffbd2e";
  return "#ff5f57";
}

function healthBadgeChrome(score: number): { background: string; border: string; color: string } {
  const s = Math.min(100, Math.max(0, score));
  if (s >= 80) {
    return {
      background: "rgba(40,202,65,0.15)",
      border: "1px solid rgba(40,202,65,0.3)",
      color: "#28ca41",
    };
  }
  if (s >= 60) {
    return {
      background: "rgba(255,189,46,0.15)",
      border: "1px solid rgba(255,189,46,0.3)",
      color: "#ffbd2e",
    };
  }
  return {
    background: "rgba(255,95,87,0.15)",
    border: "1px solid rgba(255,95,87,0.3)",
    color: "#ff5f57",
  };
}

function healthMetricBarColor(label: string): string {
  const l = label.toLowerCase();
  if (l === "coupling" || l === "dead code") return "#ff5f57";
  if (l === "coverage") return "#28ca41";
  if (l === "dependencies") return "#ffbd2e";
  return "#325F57";
}

function agentPipelineDotColor(status: AgentStatus): string {
  if (status === "done") return "#28ca41";
  if (status === "running") return "#ffbd2e";
  if (status === "error") return "#ff5f57";
  return "#444441";
}

const glassPanel: CSSProperties = {
  background: GLASS_BG,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: `1px solid ${GLASS_BORDER}`,
  borderRadius: 16,
};

function formatAgentTiming(ms: number | undefined, status: AgentStatus): string {
  if (status === "waiting") return "—";
  if (status === "running") return "Live";
  if (status === "error") return "Failed";
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function parseAgentSseBlock(block: string): Record<string, unknown> | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));
  if (lines.length === 0) return null;
  const payload = lines.map((line) => line.replace(/^data:\s*/, "")).join("\n");
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    return obj;
  } catch {
    return null;
  }
}

function HealthScoreRing({ score }: { score: number }) {
  const uid = useId().replace(/:/g, "");
  const s = Math.min(100, Math.max(0, Math.round(Number(score) || 0)));
  const tierColor = useMemo(() => healthScoreTierColor(s), [s]);
  const cx = 90;
  const cy = 90;
  const r = 62;
  const circumference = useMemo(() => 2 * Math.PI * r, []);
  const [dashOffset, setDashOffset] = useState(circumference);
  const glowId = `${uid}-health-glow`;
  const pulseGradId = `${uid}-health-pulse-grad`;

  useEffect(() => {
    setDashOffset(circumference);
    let frame = 0;
    const duration = 1500;
    const start = performance.now();
    const from = circumference;
    const target = circumference * (1 - s / 100);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDashOffset(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [s, circumference]);

  return (
    <div className="stacksense-health-ring-enter flex flex-col items-center" style={{ marginBottom: 24 }}>
      <svg
        width={180}
        height={180}
        viewBox="0 0 180 180"
        style={{ overflow: "visible" }}
        aria-label={`Health score ${s} out of 100`}
      >
        <defs>
          <radialGradient id={pulseGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={tierColor} stopOpacity="0.38" />
            <stop offset="70%" stopColor={tierColor} stopOpacity="0.12" />
            <stop offset="100%" stopColor={PAGE_BG} stopOpacity="0" />
          </radialGradient>
          <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation={4} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          className="stacksense-health-ring-pulse"
          cx={cx}
          cy={cy}
          r={r + 14}
          fill={`url(#${pulseGradId})`}
          opacity={0.6}
          pointerEvents="none"
        />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(111,148,135,0.2)" strokeWidth={11} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={tierColor}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          filter={`url(#${glowId})`}
          style={{ transition: "stroke 0.45s ease" }}
        />
        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          fill={TEXT_HEADING}
          fontSize={56}
          fontWeight={700}
          fontFamily="system-ui, sans-serif"
          letterSpacing="-0.5px"
        >
          {s}
        </text>
        <text
          x={cx}
          y={cy + 52}
          textAnchor="middle"
          fill={TEXT_LABEL}
          fontSize={18}
          fontWeight={600}
          fontFamily="system-ui, sans-serif"
        >
          / 100
        </text>
      </svg>
    </div>
  );
}

type MapperNode = {
  id: string;
  risk?: string;
  deps?: number;
  name?: string;
  path?: string;
  size?: number;
};
type MapperEdge = { source: string; target: string };

type SimNode = d3.SimulationNodeDatum & MapperNode;

function riskPalette(risk: string | undefined) {
  const r = (risk || "healthy").toLowerCase();
  if (r === "critical") {
    return { fill: "rgba(201, 107, 92, 0.28)", stroke: DANGER };
  }
  if (r === "warning") {
    return { fill: "rgba(217, 162, 60, 0.28)", stroke: WARNING };
  }
  return { fill: "rgba(111, 148, 135, 0.22)", stroke: SUCCESS };
}

function fileBasename(path: string) {
  const trimmed = path.trim();
  const parts = trimmed.split(/[/\\]/);
  const base = parts[parts.length - 1] ?? trimmed;
  return base.length > 0 ? base : "—";
}

function shortFilenameLabel(name: string, maxLen = 22) {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, Math.max(1, maxLen - 1))}…`;
}

function normalizeGraphPath(p: string): string {
  return p.trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

type RiskListItem = {
  file?: string;
  severity?: string;
  issue?: string;
  score?: number;
  whatIsThis?: string;
  whyDangerous?: string;
  howToFix?: string;
  cvss?: number | null;
};

const FONT_IBM_PLEX = 'var(--font-ibm-plex-mono), ui-monospace, monospace';
const FONT_OUTFIT = 'var(--font-outfit), system-ui, sans-serif';

function riskSeverityUiLabel(severity: string | undefined): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return "CRITICAL";
  if (s === "warning") return "HIGH";
  if (s === "info") return "MEDIUM";
  return "LOW";
}

function riskSeverityBadgeStyle(
  label: ReturnType<typeof riskSeverityUiLabel>
): { background: string; border: string; color: string } {
  if (label === "CRITICAL") {
    return {
      background: "rgba(201,107,92,0.15)",
      border: "1px solid rgba(201,107,92,0.35)",
      color: "#ff5f57",
    };
  }
  if (label === "HIGH") {
    return {
      background: "rgba(255,189,46,0.12)",
      border: "1px solid rgba(255,189,46,0.35)",
      color: "#ffbd2e",
    };
  }
  if (label === "MEDIUM") {
    return {
      background: "rgba(50,95,87,0.2)",
      border: "1px solid rgba(111,148,135,0.35)",
      color: "#6F9487",
    };
  }
  return {
    background: "rgba(40,202,65,0.1)",
    border: "1px solid rgba(40,202,65,0.28)",
    color: "#28ca41",
  };
}

function severityToRank(s: string | undefined): number {
  const x = (s || "").toLowerCase();
  if (x === "critical") return 2;
  if (x === "warning" || x === "info") return 1;
  return 0;
}

function rankToRiskLabel(rank: number): "critical" | "warning" | "healthy" {
  if (rank >= 2) return "critical";
  if (rank >= 1) return "warning";
  return "healthy";
}

/**
 * Merge mapper nodes with risk agent results so graph colors match actual findings.
 * Matches on full normalized path, basename, and path suffixes.
 */
function mergeMapperNodesWithRisks(nodes: MapperNode[], risks: RiskListItem[]): MapperNode[] {
  if (nodes.length === 0) return [];
  const fileToRank = new Map<string, number>();

  for (const r of risks) {
    const file = typeof r.file === "string" ? r.file.trim() : "";
    if (!file) continue;
    const rk = severityToRank(r.severity);
    const normFull = normalizeGraphPath(file);
    const normBase = normalizeGraphPath(fileBasename(file));
    for (const key of [normFull, normBase]) {
      if (!key) continue;
      const prev = fileToRank.get(key) ?? 0;
      if (rk > prev) fileToRank.set(key, rk);
    }
  }

  return nodes.map((n) => {
    let best = 0;
    const norm = normalizeGraphPath(n.id);
    const base = normalizeGraphPath(fileBasename(n.id));
    best = Math.max(best, fileToRank.get(norm) ?? 0, fileToRank.get(base) ?? 0);
    for (const [key, rank] of fileToRank) {
      if (!key || key.length < 2) continue;
      if (norm === key || norm.endsWith(`/${key}`) || (key.includes("/") && norm.endsWith(key))) {
        if (rank > best) best = rank;
      }
    }
    return { ...n, risk: rankToRiskLabel(best) };
  });
}

const GRAPH_VIEW_HEIGHT = 550;

function CodebaseMapGraph({
  nodes = [],
  edges = [],
  onSelectNode,
}: {
  nodes?: MapperNode[];
  edges?: MapperEdge[];
  onSelectNode: (node: MapperNode | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, undefined> | null>(null);
  const reactId = useId().replace(/:/g, "");
  const [legendOpen, setLegendOpen] = useState(false);
  const legendUiRef = useRef<HTMLDivElement>(null);
  const [layoutWidth, setLayoutWidth] = useState(0);

  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  /** Primitives only — useEffect deps stay fixed-length (no spreads / conditional slots). */
  const mapGraphDataSignature = useMemo(
    () =>
      JSON.stringify({
        rid: reactId,
        ns: nodes.map((n) => [n.id, n.risk ?? "", n.deps ?? 0] as const),
        es: edges.map((e) => [e.source, e.target] as const),
      }),
    [nodes, edges, reactId]
  );

  useEffect(() => {
    if (!legendOpen) return;
    const close = (e: MouseEvent) => {
      const el = legendUiRef.current;
      if (el && !el.contains(e.target as Node)) setLegendOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [legendOpen]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const el = containerRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      setLayoutWidth(el.clientWidth);
      return;
    }
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setLayoutWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    });
    ro.observe(el);
    setLayoutWidth(el.clientWidth);
    return () => ro.disconnect();
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: ref.current attachment as dependency slots
  [containerRef.current, svgRef.current]);

  useEffect(() => {
    if (!containerRef.current || !svgRef.current || nodes.length === 0) return;

    const container = containerRef.current;
    const svg = d3.select(svgRef.current);
    const width = Math.max(layoutWidth || container.clientWidth, 1);
    const height = GRAPH_VIEW_HEIGHT;

    svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);

    svg.selectAll("*").remove();

    const filterHoverId = `${reactId}-node-hover-glow`;
    const gridId = `${reactId}-grid`;

    const defs = svg.append("defs");

    defs
      .append("pattern")
      .attr("id", gridId)
      .attr("width", 32)
      .attr("height", 32)
      .attr("patternUnits", "userSpaceOnUse")
      .append("path")
      .attr("d", "M 32 0 L 0 0 0 32")
      .attr("fill", "none")
      .attr("stroke", "rgba(111,148,135,0.1)")
      .attr("stroke-width", 1);

    const addRiskGlow = (suffix: string, color: string, blur: number, floodOp: number) => {
      const gf = defs
        .append("filter")
        .attr("id", `${reactId}-risk-${suffix}`)
        .attr("x", "-100%")
        .attr("y", "-100%")
        .attr("width", "300%")
        .attr("height", "300%");
      gf.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", blur).attr("result", "blur");
      gf.append("feFlood").attr("flood-color", color).attr("flood-opacity", floodOp).attr("result", "col");
      gf.append("feComposite").attr("in", "col").attr("in2", "blur").attr("operator", "in").attr("result", "glow");
      const mg = gf.append("feMerge");
      mg.append("feMergeNode").attr("in", "glow");
      mg.append("feMergeNode").attr("in", "SourceGraphic");
    };
    addRiskGlow("critical", DANGER, 5.5, 0.72);
    addRiskGlow("warning", WARNING, 4.2, 0.55);
    addRiskGlow("healthy", SUCCESS, 2.2, 0.22);

    const hoverFilter = defs
      .append("filter")
      .attr("id", filterHoverId)
      .attr("x", "-100%")
      .attr("y", "-100%")
      .attr("width", "300%")
      .attr("height", "300%")
      .attr("color-interpolation-filters", "sRGB");
    hoverFilter
      .append("feGaussianBlur")
      .attr("stdDeviation", 5)
      .attr("result", "blur");
    hoverFilter
      .append("feComponentTransfer")
      .attr("in", "blur")
      .attr("result", "soft")
      .append("feFuncA")
      .attr("type", "linear")
      .attr("slope", "0.45");
    const hoverMerge = hoverFilter.append("feMerge");
    hoverMerge.append("feMergeNode").attr("in", "soft");
    hoverMerge.append("feMergeNode").attr("in", "SourceGraphic");

    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", PAGE_BG)
      .attr("pointer-events", "none");
    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", `url(#${gridId})`)
      .attr("opacity", 0.55)
      .attr("pointer-events", "none");

    const g = svg.append("g").attr("class", "zoom-layer");

    const maxDeps = d3.max(nodes, (d) => Number(d.deps) || 0) || 0;
    const radius = d3
      .scaleSqrt()
      .domain([0, Math.max(maxDeps, 1)])
      .range([22, 48]);

    const nodeById = new Map(nodes.map((n) => [n.id, { ...n }]));
    const nodeData: SimNode[] = nodes.map((n) => ({ ...n }));

    const isCriticalId = (id: string) => (nodeById.get(id)?.risk || "").toLowerCase() === "critical";

    const linkData = edges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        touchCritical: isCriticalId(e.source) || isCriticalId(e.target),
      }));

    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(linkData)
      .join("line")
      .attr("stroke-width", (d) => (d.touchCritical ? 2.25 : 1.5))
      .attr("stroke-linecap", "round")
      .attr("stroke", (d) => (d.touchCritical ? DANGER : "rgba(111,148,135,0.35)"))
      .attr("stroke-opacity", (d) => (d.touchCritical ? 0.92 : 0.5))
      .attr("stroke-dasharray", (d) => (d.touchCritical ? "7 5" : "none"));

    const nodeGroup = g
      .selectAll<SVGGElement, SimNode>("g.node")
      .data(nodeData)
      .join("g")
      .attr("class", "node")
      .style("cursor", "grab")
      .on("click", (event, d) => {
        event.stopPropagation();
        onSelectNodeRef.current({
          id: d.id,
          risk: d.risk,
          deps: d.deps,
        });
      })
      .on("mouseenter", function () {
        d3.select(this).style("cursor", "grab");
        d3.select(this).select("circle.node-core").attr("filter", `url(#${filterHoverId})`);
      })
      .on("mouseleave", function (_, d) {
        const risk = (d.risk || "healthy").toLowerCase();
        const fid =
          risk === "critical"
            ? `${reactId}-risk-critical`
            : risk === "warning"
              ? `${reactId}-risk-warning`
              : `${reactId}-risk-healthy`;
        d3.select(this).select("circle.node-core").attr("filter", `url(#${fid})`);
      });

    nodeGroup.each(function (d) {
      if ((d.risk || "").toLowerCase() !== "critical") return;
      const sel = d3.select(this);
      const r0 = radius(Number(d.deps) || 0);
      sel
        .append("circle")
        .attr("class", "critical-pulse")
        .attr("pointer-events", "none")
        .attr("fill", "rgba(201, 107, 92, 0.16)")
        .attr("stroke", DANGER)
        .attr("stroke-opacity", 0.65)
        .attr("stroke-width", 2);
      const badge = sel.append("g").attr("class", "risk-badge").attr("transform", `translate(0,${-r0 - 10})`);
      badge
        .append("circle")
        .attr("r", 10)
        .attr("fill", DANGER)
        .attr("stroke", TXT_PRIMARY)
        .attr("stroke-width", 1.5)
        .style("filter", "drop-shadow(0 0 6px rgba(201,107,92,0.85))");
      badge
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", TEXT_HEADING)
        .attr("font-size", 12)
        .attr("font-weight", 800)
        .attr("font-family", "system-ui, sans-serif")
        .text("!");
    });

    nodeGroup
      .append("circle")
      .attr("class", "node-core")
      .attr("stroke-width", 2.5)
      .attr("r", (d) => radius(Number(d.deps) || 0))
      .each(function (d) {
        const c = riskPalette(d.risk);
        const risk = (d.risk || "healthy").toLowerCase();
        const fid =
          risk === "critical"
            ? `${reactId}-risk-critical`
            : risk === "warning"
              ? `${reactId}-risk-warning`
              : `${reactId}-risk-healthy`;
        d3
          .select<SVGCircleElement, SimNode>(this)
          .attr("fill", c.fill)
          .attr("stroke", c.stroke)
          .attr("filter", `url(#${fid})`);
      });

    nodeGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "hanging")
      .attr("pointer-events", "none")
      .attr("paint-order", "stroke fill")
      .attr("stroke", PAGE_BG)
      .attr("stroke-width", 4)
      .attr("stroke-linejoin", "round")
      .attr("fill", TEXT_HEADING)
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace")
      .attr("y", (d) => radius(Number(d.deps) || 0) + 8)
      .text((d) => shortFilenameLabel(fileBasename(d.id)));

    svg.on("click", () => onSelectNodeRef.current(null));

    const simulation = d3
      .forceSimulation<SimNode>(nodeData)
      .force(
        "link",
        d3.forceLink<SimNode, (typeof linkData)[number]>(linkData)
          .id((d) => d.id)
          .distance(130)
          .strength(0.62)
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(-320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3
          .forceCollide<SimNode>()
          .radius((d) => radius(Number(d.deps) || 0) + 32)
          .strength(0.88)
      );

    simulationRef.current = simulation;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom).on("dblclick.zoom", null);

    const pulseTimer = d3.timer((elapsed) => {
      nodeGroup.each(function (d) {
        if ((d.risk || "").toLowerCase() !== "critical") return;
        const r0 = radius(Number(d.deps) || 0);
        const phase = Math.sin(elapsed / 380);
        d3.select(this)
          .select("circle.critical-pulse")
          .attr("r", r0 + 10 + phase * 7)
          .attr("opacity", 0.35 + ((phase + 1) / 2) * 0.45);
      });
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d: d3.SimulationLinkDatum<SimNode>) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d: d3.SimulationLinkDatum<SimNode>) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d: d3.SimulationLinkDatum<SimNode>) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d: d3.SimulationLinkDatum<SimNode>) => (d.target as SimNode).y ?? 0);

      nodeGroup.attr("transform", (d) => {
        const x = d.x ?? 0;
        const y = d.y ?? 0;
        return `translate(${x},${y})`;
      });
    });

    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on("start", function (event, d) {
        if (!event.active) simulation.alphaTarget(0.35).restart();
        d.fx = d.x;
        d.fy = d.y;
        d3.select(this).style("cursor", "grabbing");
        d3.select(this).select("circle.node-core").attr("filter", null);
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", function (event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        d3.select(this).style("cursor", "grab");
        const risk = (d.risk || "healthy").toLowerCase();
        const fid =
          risk === "critical"
            ? `${reactId}-risk-critical`
            : risk === "warning"
              ? `${reactId}-risk-warning`
              : `${reactId}-risk-healthy`;
        d3.select(this).select("circle.node-core").attr("filter", `url(#${fid})`);
      });

    (nodeGroup as d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>).call(drag);

    return () => {
      pulseTimer.stop();
      simulation.stop();
      simulationRef.current = null;
    };
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutWidth read inside; signature + length per dashboard contract
  [mapGraphDataSignature, nodes.length]);

  if (nodes.length === 0) {
    return (
      <p
        style={{
          color: TEXT_LABEL,
          fontSize: 15,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        No mapper graph data for this repo.
      </p>
    );
  }

  const legendItems: { emoji: string; title: string; desc: string; stroke: string; fill: string }[] = [
    {
      emoji: "🔴",
      title: "Critical",
      desc: "Security vulnerabilities",
      stroke: DANGER,
      fill: "rgba(201,107,92,0.35)",
    },
    {
      emoji: "🟡",
      title: "Warning",
      desc: "Code quality issues",
      stroke: WARNING,
      fill: "rgba(217,162,60,0.35)",
    },
    {
      emoji: "🟢",
      title: "Healthy",
      desc: "No issues found",
      stroke: SUCCESS,
      fill: "rgba(111,148,135,0.35)",
    },
  ];

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <div
        className="stacksense-glass-card"
        style={{
          overflow: "hidden",
          boxShadow: `0 24px 64px rgba(0, 0, 0, 0.35), inset 0 1px 0 ${GLASS_BORDER}`,
        }}
      >
        <svg
          ref={svgRef}
          role="img"
          aria-label="Interactive codebase dependency graph"
          style={{
            display: "block",
            width: "100%",
            height: GRAPH_VIEW_HEIGHT,
            background: "transparent",
          }}
        />
      </div>

      <div ref={legendUiRef} style={{ position: "absolute", top: 12, right: 12, zIndex: 30 }}>
        <button
          type="button"
          className="stacksense-legend-help-btn"
          aria-expanded={legendOpen}
          aria-controls="codebase-map-legend-popup"
          aria-label={legendOpen ? "Hide legend" : "Show legend"}
          id="codebase-map-legend-trigger"
          title="Legend"
          onClick={(e) => {
            e.stopPropagation();
            setLegendOpen((o) => !o);
          }}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: `1px solid ${GLASS_BORDER}`,
            background: "rgba(4,21,26,0.65)",
            color: TEXT_HEADING,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          ?
        </button>
        {legendOpen ? (
          <div
            id="codebase-map-legend-popup"
            role="tooltip"
            aria-labelledby="codebase-map-legend-trigger"
            style={{
              position: "absolute",
              right: 0,
              bottom: "calc(100% + 8px)",
              width: "min(280px, calc(100vw - 48px))",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(4, 21, 26, 0.94)",
              border: `1px solid ${GLASS_BORDER}`,
              boxShadow: `0 16px 48px rgba(0,0,0,0.55), inset 0 1px 0 ${GLASS_BORDER}`,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: TEXT_LABEL, marginBottom: 10 }}>
              Legend
            </div>
            {legendItems.map((item) => (
              <div
                key={item.title}
                style={{
                  fontSize: 12,
                  color: TEXT_DESC,
                  lineHeight: 1.55,
                  marginBottom: 8,
                }}
              >
                <span aria-hidden>{item.emoji}</span>{" "}
                <span style={{ color: TEXT_HEADING, fontWeight: 600 }}>{item.title}</span>
                <span style={{ color: TEXT_LABEL }}> — </span>
                <span style={{ color: TEXT_LABEL }}>{item.desc}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: TEXT_LABEL, lineHeight: 1.5, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${GLASS_BORDER}` }}>
              Critical nodes pulse · dashed edges touch critical file
            </div>
          </div>
        ) : null}
      </div>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: 12,
          color: TEXT_LABEL,
          textAlign: "center",
          letterSpacing: "0.02em",
          lineHeight: 1.6,
        }}
      >
        Scroll or pinch to zoom · Drag empty space to pan · Drag nodes to reposition
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [repoUrl, setRepoUrl] = useState("");
  const [agents, setAgents] = useState<AgentState>(initialAgents);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMapperNode, setSelectedMapperNode] = useState<MapperNode | null>(null);
  const [activeNavId, setActiveNavId] = useState<NavId>("overview");
  const [analysisWallMs, setAnalysisWallMs] = useState<number | null>(null);
  const [expandedRisk, setExpandedRisk] = useState<number | null>(null);
  const [quoteIndex, setQuoteIndex] = useState(0);

  const handleSelectMapperNode = useCallback((node: MapperNode | null) => {
    setSelectedMapperNode(node);
  }, []);

  const analysisStartRef = useRef(0);
  const prevAgentsRef = useRef<AgentState>(initialAgents);
  const [agentElapsedMs, setAgentElapsedMs] = useState<Partial<Record<AgentName, number>>>({});

  useEffect(() => {
    const prev = prevAgentsRef.current;
    const t0 = analysisStartRef.current;
    const updates: Partial<Record<AgentName, number>> = {};
    for (const name of AGENT_ORDER) {
      if (prev[name].status !== "done" && agents[name].status === "done" && t0 > 0) {
        updates[name] = Date.now() - t0;
      }
    }
    if (Object.keys(updates).length > 0) {
      setAgentElapsedMs((m) => ({ ...m, ...updates }));
    }
    prevAgentsRef.current = {
      mapper: { ...agents.mapper },
      risk: { ...agents.risk },
      auditor: { ...agents.auditor },
      scorer: { ...agents.scorer },
    };
  }, [agents]);

  useEffect(() => {
    setSelectedMapperNode(null);
  }, [results]);

  useEffect(() => {
    setExpandedRisk(null);
  }, [results]);

  useEffect(() => {
    if (!loading) return;
    setQuoteIndex(0);
    const id = window.setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [loading]);

  const analyze = useCallback(async (overrideUrl?: string) => {
    const urlAnalyzing = (overrideUrl ?? repoUrl).trim();
    if (!urlAnalyzing || loading) return;

    setRepoUrl(urlAnalyzing);

    setLoading(true);
    setError("");
    setResults(null);
    setAnalysisWallMs(null);
    analysisStartRef.current = Date.now();
    setAgentElapsedMs({});
    prevAgentsRef.current = { ...initialAgents };
    setAgents({
      mapper: { status: "running", msg: "Connecting to analysis pipeline…" },
      risk: { status: "waiting", msg: "Waiting for mapper…" },
      auditor: { status: "waiting", msg: "Waiting…" },
      scorer: { status: "waiting", msg: "Waiting…" },
    });

    const finalData: Record<string, unknown> = {};

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: urlAnalyzing }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed (${response.status})`);
      }

      const body = response.body;
      if (!body) throw new Error("No response stream.");

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotEvent = false;

      const applyParsed = (data: Record<string, unknown>) => {
        const agent = data.agent as string | undefined;
        if (typeof agent !== "string") return;
        gotEvent = true;
        const msg = typeof data.msg === "string" ? data.msg : "";
        const status = data.status as AgentStatus | undefined;

        if (agent === "error") {
          throw new Error(typeof data.msg === "string" ? data.msg : "Analysis failed.");
        }

        if (agent && agent !== "complete" && "data" in data && data.data !== undefined) {
          finalData[agent] = data.data;
        }

        if (
          agent &&
          (agent === "mapper" || agent === "risk" || agent === "auditor" || agent === "scorer")
        ) {
          const key = agent as AgentName;
          setAgents((prev) => ({
            ...prev,
            [key]:
              status === "done"
                ? { status: "done", msg }
                : status === "running"
                  ? { status: "running", msg }
                  : status === "error"
                    ? { status: "error", msg }
                    : { ...prev[key], msg: msg || prev[key].msg },
          }));
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const parsed = parseAgentSseBlock(chunk);
          if (!parsed) continue;
          applyParsed(parsed);
        }
      }

      if (buffer.trim()) {
        const parsed = parseAgentSseBlock(buffer.endsWith("\n") ? buffer : `${buffer}\n`);
        if (parsed) applyParsed(parsed);
      }

      if (!gotEvent) {
        throw new Error("No analysis events received.");
      }

      setAgents((prev) => ({
        mapper: prev.mapper.status === "error" ? prev.mapper : { status: "done", msg: prev.mapper.msg },
        risk: prev.risk.status === "error" ? prev.risk : { status: "done", msg: prev.risk.msg },
        auditor: prev.auditor.status === "error" ? prev.auditor : { status: "done", msg: prev.auditor.msg },
        scorer: prev.scorer.status === "error" ? prev.scorer : { status: "done", msg: prev.scorer.msg },
      }));

      setResults({ ...finalData });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setAgents({
        mapper: { status: "error", msg: "Failed" },
        risk: { status: "error", msg: "Failed" },
        auditor: { status: "error", msg: "Failed" },
        scorer: { status: "error", msg: "Failed" },
      });
    } finally {
      const t0 = analysisStartRef.current;
      if (t0) setAnalysisWallMs(Date.now() - t0);
      setLoading(false);
    }
  }, [repoUrl, loading]);

  const analyzeRef = useRef(analyze);
  useEffect(() => {
    analyzeRef.current = analyze;
  }, [analyze]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("repoUrl");
      if (!raw?.trim()) return;
      localStorage.removeItem("repoUrl");
      const trimmed = raw.trim();
      setRepoUrl(trimmed);
      void analyzeRef.current(trimmed);
    } catch {
      /* ignore quota / privacy */
    }
  }, []);

  const [analyzeUi, setAnalyzeUi] = useState<{ open: boolean; exiting: boolean }>({
    open: false,
    exiting: false,
  });

  useEffect(() => {
    if (loading) {
      setAnalyzeUi({ open: true, exiting: false });
      return;
    }
    setAnalyzeUi((prev) => {
      if (!prev.open || prev.exiting) return prev;
      return { open: true, exiting: true };
    });
  }, [loading]);

  useEffect(() => {
    if (!analyzeUi.exiting) return;
    const t = window.setTimeout(() => setAnalyzeUi({ open: false, exiting: false }), 580);
    return () => window.clearTimeout(t);
  }, [analyzeUi.exiting]);

  const codebaseGraphNodes = useMemo(() => {
    if (!results) return [];
    return mergeMapperNodesWithRisks(
      (results.mapper?.nodes as MapperNode[]) || [],
      (results.risk?.risks as RiskListItem[]) || []
    );
  }, [results]);

  const scrollToSection = useCallback((id: NavId) => {
    setActiveNavId(id);
    window.requestAnimationFrame(() => {
      document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const navTitle = NAV_ITEMS.find((n) => n.id === activeNavId)?.label ?? "Overview";
  const healthScore = results ? Number(results.scorer?.score ?? 0) : null;

  const kpiFiles = results?.mapper?.nodes?.length ?? 0;
  const kpiIssues = results?.risk?.risks?.length ?? 0;
  const kpiDeps = results?.auditor?.dependencies?.length ?? 0;
  const aiInsights = (results?.scorer?.aiInsights as
    | {
        summary?: string;
        criticalActions?: { action?: string; reason?: string; effort?: "Low" | "Medium" | "High" }[];
        recommendations?: string[];
        securityGrade?: "A" | "B" | "C" | "D" | "F";
        estimatedFixTime?: string;
      }
    | undefined) ?? {
    summary: "",
    criticalActions: [],
    recommendations: [],
    securityGrade: "C",
    estimatedFixTime: "",
  };
  const insightsRecommendations =
    Array.isArray(aiInsights.recommendations) && aiInsights.recommendations.length > 0
      ? aiInsights.recommendations.slice(0, 5)
      : Array.isArray(results?.scorer?.recommendations)
        ? (results.scorer.recommendations as string[]).slice(0, 5)
        : [];
  const insightsCriticalActions = Array.isArray(aiInsights.criticalActions)
    ? aiInsights.criticalActions.slice(0, 5)
    : [];
  const securityGrade = ["A", "B", "C", "D", "F"].includes(String(aiInsights.securityGrade))
    ? (aiInsights.securityGrade as "A" | "B" | "C" | "D" | "F")
    : "C";
  const securityGradeColor = securityGrade === "A" || securityGrade === "B" ? "#28ca41" : securityGrade === "C" ? "#ffbd2e" : "#ff5f57";
  const estimatedFixTime = typeof aiInsights.estimatedFixTime === "string" && aiInsights.estimatedFixTime.trim()
    ? aiInsights.estimatedFixTime.trim()
    : "Unknown";

  const exportPDF = useCallback(() => {
    if (!results || typeof window === "undefined") return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const analysisTimeSec =
      analysisWallMs != null && analysisWallMs > 0 ? Math.round(analysisWallMs) / 1000 : 0;

    const rawStr = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    const rawDeps = ((results.auditor as { dependencies?: unknown[] } | undefined)?.dependencies ||
      []) as unknown[];
    const rawRisks = ((results.risk as { risks?: unknown[] } | undefined)?.risks || []) as unknown[];

    const toDepRecord = (dep: unknown): Record<string, unknown> =>
      typeof dep === "object" && dep !== null ? { ...(dep as Record<string, unknown>) } : {};

    /** Package name/version fallbacks — API may use different keys. */
    function depPdfFields(d: Record<string, unknown>) {
      let nameGuess =
        rawStr(d.name) ||
        rawStr(d.packageName) ||
        rawStr(d.package) ||
        rawStr(d.dependency);
      const versionGuess =
        rawStr(d.version) ||
        rawStr(d.currentVersion) ||
        rawStr(d.declaredRange) ||
        rawStr(d.range);
      const keys = Object.keys(d);

      /* User-requested fallback: first key → value if name still empty */
      if (!nameGuess && keys.length > 0) {
        const k0 = keys[0];
        const v0 = d[k0];
        if (typeof v0 === "string" && v0.trim()) nameGuess = v0.trim();
      }
      /* Otherwise first plausible string-ish value excluding known metadata keys */
      if (!nameGuess) {
        const skip = new Set([
          "version",
          "currentVersion",
          "status",
          "severity",
          "declaredRange",
          "range",
          "notes",
          "details",
          "kind",
          "reason",
          "risk",
          "issues",
          "description",
          "summary",
          "riskScore",
        ]);
        for (const key of keys) {
          if (skip.has(key)) continue;
          const v = d[key];
          const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
          if (s.length > 0 && s.length < 200 && !s.includes("\n")) {
            nameGuess = s;
            break;
          }
        }
      }
      nameGuess ||= "Unknown";

      let stNorm = rawStr(String(d.status ?? "")).toUpperCase();
      if (!stNorm && typeof d.severity === "string") stNorm = rawStr(d.severity).toUpperCase();
      if (stNorm === "OKAY") stNorm = "OK";
      if (!stNorm) stNorm = "OK";

      /* Merge flattened fields PDF template expects alongside raw keys */
      return {
        ...d,
        name: nameGuess,
        packageName:
          rawStr(d.packageName) || rawStr(d.name) || rawStr(d.package) || "",
        version: rawStr(versionGuess),
        currentVersion:
          rawStr(d.currentVersion) || rawStr(d.version) || rawStr(versionGuess),
        status: stNorm,
      };
    }

    /** Risk rows may use alternate field names from the model JSON. */
    function riskPdfFields(r: Record<string, unknown>) {
      const descKeys = [
        "issue",
        "description",
        "finding",
        "findings",
        "message",
        "summary",
        "title",
        "detail",
        "whatIsThis",
        "what_is_this",
        "risk",
      ] as const;
      let description = "";
      for (const k of descKeys) {
        const candidate = rawStr(r[k as string]);
        if (candidate) {
          description = candidate;
          break;
        }
      }
      let fileGuess =
        rawStr(r.file) ||
        rawStr(r.filePath) ||
        rawStr(r.path) ||
        rawStr(r.source) ||
        rawStr(r.location);
      /* Value for first usable key ending in File / Path sometimes */
      if (!fileGuess) {
        const pathKeys = Object.keys(r).filter(
          (k) => /^file|^path|^source|^location|^module/i.test(k) && typeof r[k] === "string"
        );
        fileGuess = pathKeys.length ? rawStr(r[pathKeys[0]]) : "";
      }
      const severityStr = typeof r.severity === "string" ? r.severity : "";
      const rawScore =
        typeof r.score === "number"
          ? r.score
          : typeof r.score === "string"
            ? Number(r.score)
            : NaN;
      let scoreDisp = "—";
      if (Number.isFinite(rawScore)) scoreDisp = String(rawScore);
      else if (typeof r.score === "string" && r.score.trim()) scoreDisp = r.score.trim();
      else if (severityStr.trim()) scoreDisp = severityStr.trim().toUpperCase();
      else if (r.cvss != null && String(r.cvss).trim())
        scoreDisp = `CVSS ${String(r.cvss).trim()}`;

      return {
        ...r,
        file: fileGuess || "—",
        description:
          description || rawStr(r.issue) || rawStr(r.whatIsThis as string | undefined),
        summary: rawStr(r.summary),
        issue: rawStr(r.issue),
        score: scoreDisp,
      };
    }

    const dependenciesForPdf = rawDeps.map(toDepRecord).map(depPdfFields);

    const riskAnalysisForPdf = rawRisks
      .map((r) => (typeof r === "object" && r !== null ? (r as Record<string, unknown>) : {}))
      .map(riskPdfFields);

    const analysisData = {
      healthScore: Math.round(Number(results.scorer?.score ?? 0)),
      analysisTime: analysisTimeSec,
      filesScanned: results.mapper?.nodes?.length ?? 0,
      issuesFound: results.risk?.risks?.length ?? 0,
      dependencies: dependenciesForPdf,
      riskAnalysis: riskAnalysisForPdf,
      recommendations: Array.isArray(results.scorer?.recommendations)
        ? (results.scorer.recommendations as string[])
        : [],
    };

    if (analysisData.dependencies.length > 0) console.log(analysisData.dependencies[0]);
    if (analysisData.riskAnalysis.length > 0) console.log(analysisData.riskAnalysis[0]);

    const healthScoreN = analysisData.healthScore;
    const bannerAccent =
      healthScoreN >= 80 ? "#28ca41" : healthScoreN >= 60 ? "#ffbd2e" : "#ff5f57";
    const healthLabel =
      healthScoreN >= 80 ? "HEALTHY" : healthScoreN >= 60 ? "NEEDS ATTENTION" : "AT RISK";

    const riskBlocks =
      analysisData.riskAnalysis.length > 0
        ? analysisData.riskAnalysis
            .map(
              (r) => `
          <div class="finding-row">
            <div>
              <div class="finding-file">${escapeHtml(String(r.file))}</div>
              <div class="finding-desc">${escapeHtml(String(r.description))}</div>
            </div>
            <div class="score">${escapeHtml(String(r.score !== "" ? r.score : "—"))}</div>
          </div>
        `
            )
            .join("")
        : '<div style="color:#6F9487;font-size:13px;padding:12px">No risk findings.</div>';

    const depBlocks =
      analysisData.dependencies.length > 0
        ? analysisData.dependencies
            .map((entry) => {
              const d = entry as Record<string, unknown>;
              const firstKey = Object.keys(d)[0];
              const firstVal = firstKey != null ? d[firstKey] : undefined;
              const nameGuess =
                rawStr(typeof d.name === "string" ? d.name : "") ||
                rawStr(typeof d.packageName === "string" ? d.packageName : "") ||
                rawStr(typeof firstVal === "string" ? String(firstVal) : "") ||
                rawStr(firstKey ?? "");
              const nameFinal = escapeHtml(nameGuess.trim() ? nameGuess : "Unknown");

              const versionGuess =
                rawStr(typeof d.version === "string" ? d.version : "") ||
                rawStr(typeof d.currentVersion === "string" ? d.currentVersion : "");

              let stCmp = rawStr(typeof d.status === "string" ? d.status : "").toUpperCase();
              if (stCmp === "OKAY") stCmp = "OK";
              if (!stCmp) stCmp = "OK";

              const badgeClass =
                stCmp === "OUTDATED"
                  ? "badge-outdated"
                  : stCmp === "VULNERABLE"
                    ? "badge-vulnerable"
                    : "badge-ok";
              const badgeLabel = escapeHtml(stCmp);

              return `
          <div class="dep-row">
            <span class="dep-name">${nameFinal}</span>
            <div style="display:flex;align-items:center;gap:12px">
              <span class="dep-version">${escapeHtml(versionGuess)}</span>
              <span class="badge ${badgeClass}">${badgeLabel}</span>
            </div>
          </div>
        `;
            })
            .join("")
        : '<div style="color:#6F9487;font-size:13px;padding:12px">No dependencies found.</div>';

    const recBlocks =
      analysisData.recommendations.length > 0
        ? analysisData.recommendations
            .map((rec) => {
              const t = escapeHtml(String(rec));
              return `<div style="padding:10px 0;border-bottom:1px solid #163E3C;font-size:13px;color:#b8d4c8">● ${t}</div>`;
            })
            .join("")
        : '<div style="color:#6F9487;font-size:13px;padding:12px">No recommendations.</div>';

    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>StackSense Security Report</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; background: #04151A; color: #d4e8df; padding: 40px; }
        .header { border-bottom: 2px solid #325F57; padding-bottom: 24px; margin-bottom: 32px; }
        .logo { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 8px; color: #ffffff; }
        .logo .logo-teal,
        .logo > span.logo-teal,
        .logo span.logo-teal { color: #325F57 !important; }
        .meta { font-size: 11px; color: #6F9487; letter-spacing: 0.1em; }
        .repo-url { font-size: 13px; color: #325F57; margin-top: 8px; }
        .health-banner { background: #092828; border: 1px solid #163E3C; border-left: 4px solid ${bannerAccent}; border-radius: 8px; padding: 20px 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
        .health-score { font-size: 48px; font-weight: 700; color: ${bannerAccent}; }
        .health-label { font-size: 12px; color: #6F9487; letter-spacing: 0.1em; margin-top: 4px; }
        .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
        .stat-card { background: #092828; border: 1px solid #163E3C; border-radius: 8px; padding: 16px; }
        .stat-num { font-size: 28px; font-weight: 700; color: #ffffff; margin-bottom: 4px; }
        .stat-label { font-size: 11px; color: #6F9487; letter-spacing: 0.08em; }
        .section { margin-bottom: 32px; }
        .section-title { font-size: 11px; color: #325F57; letter-spacing: 0.15em; border-left: 2px solid #325F57; padding-left: 12px; margin-bottom: 16px; }
        .finding-row { background: #092828; border: 1px solid #163E3C; border-radius: 6px; padding: 14px 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; }
        .finding-file { font-size: 13px; color: #ffffff; font-weight: 600; margin-bottom: 4px; }
        .finding-desc { font-size: 12px; color: #b8d4c8; line-height: 1.5; max-width: 75%; }
        .score { font-size: 14px; font-weight: 700; color: #ffbd2e; }
        .badge { font-size: 10px; padding: 3px 8px; border-radius: 4px; font-weight: 600; letter-spacing: 0.08em; }
        .badge-outdated { background: rgba(255,189,46,0.15); color: #ffbd2e; }
        .badge-ok { background: rgba(40,202,65,0.15); color: #28ca41; }
        .badge-vulnerable { background: rgba(255,95,87,0.15); color: #ff5f57; }
        .dep-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #163E3C; font-size: 13px; }
        .dep-name { color: #ffffff; }
        .dep-version { color: #6F9487; margin-right: 12px; }
        .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #163E3C; display: flex; justify-content: space-between; font-size: 11px; color: #6F9487; letter-spacing: 0.06em; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">Stack<span class="logo-teal">Sense</span></div>
        <div class="meta">SECURITY ANALYSIS REPORT · GENERATED ${escapeHtml(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))} · ${escapeHtml(new Date().toLocaleTimeString("en-US", { hour12: true }))}</div>
        <div class="repo-url">▸ ${escapeHtml(repoUrl.trim() || "Repository Analysis")}</div>
      </div>

      <div class="health-banner">
        <div>
          <div style="font-size:12px;color:#6F9487;letter-spacing:0.1em;margin-bottom:8px">OVERALL HEALTH SCORE</div>
          <div class="health-score">${healthScoreN}<span style="font-size:24px;color:#6F9487">/100</span></div>
          <div class="health-label">${healthLabel}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#6F9487;margin-bottom:8px">SCAN COMPLETED IN</div>
          <div style="font-size:32px;color:#ffffff;font-weight:700">${analysisTimeSec}<span style="font-size:18px;color:#6F9487">s</span></div>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card"><div class="stat-num">${analysisData.filesScanned}</div><div class="stat-label">FILES SCANNED</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#ff5f57">${analysisData.issuesFound}</div><div class="stat-label">ISSUES FOUND</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#ffbd2e">${analysisData.dependencies.length}</div><div class="stat-label">DEPENDENCIES</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#325F57">${analysisData.analysisTime}<span style="font-size:16px;color:#6F9487">s</span></div><div class="stat-label">ANALYSIS TIME</div></div>
      </div>

      <div class="section">
        <div class="section-title">▸ RISK ANALYSIS</div>
        ${riskBlocks}
      </div>

      <div class="section">
        <div class="section-title">▸ DEPENDENCY AUDIT</div>
        ${depBlocks}
      </div>

      <div class="section">
        <div class="section-title">▸ AI RECOMMENDATIONS</div>
        ${recBlocks}
      </div>

      <div class="footer">
        <span>StackSense · AI-powered codebase intelligence · BeaverHacks 2026</span>
        <span>stacksense.app · Powered by Google Gemini AI</span>
      </div>
    </body>
    </html>
  `);
    printWindow.document.close();
    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }, [results, repoUrl, analysisWallMs]);

  return (
    <main
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(50, 95, 87, 0.08) 0%, transparent 60%), #04151A",
        minHeight: "100vh",
        padding: 0,
        fontFamily: "system-ui",
        position: "relative",
        color: TEXT_DESC,
        opacity: 1,
        filter: "none",
      }}
    >
      {analyzeUi.open ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "#04151A",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2rem",
            opacity: 1,
            filter: "none",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                background: "#325F57",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: "4px",
                padding: "9px 8px",
                margin: "0 auto 1.5rem",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: "100%",
                  height: "3px",
                  background: "#04151A",
                  borderRadius: "2px",
                }}
              />
              <span
                style={{
                  display: "block",
                  width: "65%",
                  height: "3px",
                  background: "#04151A",
                  borderRadius: "2px",
                  alignSelf: "flex-start",
                }}
              />
              <span
                style={{
                  display: "block",
                  width: "85%",
                  height: "3px",
                  background: "#04151A",
                  borderRadius: "2px",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: "DM Serif Display, serif",
                fontSize: "28px",
                color: "#ffffff",
                marginBottom: "8px",
              }}
            >
              Analyzing your codebase.
            </div>
            <div
              style={{
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: "12px",
                color: "#325F57",
                letterSpacing: "0.08em",
              }}
            >
              4 agents deployed · standing by
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              width: "100%",
              maxWidth: "440px",
              padding: "0 1rem",
            }}
          >
            {(["Mapper", "Risk Detector", "Auditor", "Scorer"] as const).map((agent) => (
              <div
                key={agent}
                style={{
                  background: "#092828",
                  border: "1px solid #163E3C",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#325F57",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "11px", color: "#325F57" }}>
                  {agent}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: "10px",
                    color: "#6F9487",
                  }}
                >
                  Waiting...
                </span>
              </div>
            ))}
          </div>

          <div style={{ width: "100%", maxWidth: "440px", padding: "0 1rem" }}>
            <div
              style={{
                width: "100%",
                height: "2px",
                background: "#092828",
                borderRadius: "999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "60%",
                  background: "#325F57",
                  borderRadius: "999px",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: "10px",
                color: "#6F9487",
                marginTop: "6px",
                textAlign: "center",
              }}
            >
              Scanning repository...
            </div>
          </div>

          <div
            style={{
              maxWidth: "440px",
              width: "100%",
              marginTop: "2rem",
              padding: "1.5rem",
              background: "#092828",
              border: "1px solid #163E3C",
              borderRadius: "8px",
              borderLeft: "3px solid #325F57",
              transition: "all 0.5s ease",
            }}
          >
            <div
              style={{
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: "10px",
                color: "#325F57",
                letterSpacing: "0.1em",
                marginBottom: "8px",
              }}
            >
              ▸ DID YOU KNOW
            </div>
            <div
              style={{
                fontFamily: "DM Serif Display, serif",
                fontSize: "18px",
                color: "#ffffff",
                fontStyle: "italic",
                lineHeight: 1.5,
                marginBottom: "8px",
              }}
            >
              {`"${quotes[quoteIndex].quote}"`}
            </div>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "10px", color: "#6F9487" }}>
              — {quotes[quoteIndex].source}
            </div>
          </div>

          <style>{`
      body { background: #04151A !important; }
      html { background: #04151A !important; }
    `}</style>
        </div>
      ) : null}

      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            width: SIDEBAR_WIDTH,
            zIndex: 50,
            background: SIDEBAR_BG,
            borderRight: `1px solid ${SIDEBAR_BORDER}`,
            display: "flex",
            flexDirection: "column",
            padding: "18px 12px",
            boxSizing: "border-box",
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
              <StackSenseLogo />
            </Link>
          </div>
          <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {NAV_ITEMS.map(({ id, label, icon: NavIcon }) => {
              const active = activeNavId === id;
              return (
                <button
                  key={id}
                  type="button"
                  className="dashboard-nav-btn"
                  onClick={() => scrollToSection(id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    fontSize: 15,
                    fontWeight: 600,
                    color: TEXT_NAV,
                    background: active ? ACTIVE_NAV_BG : "transparent",
                    boxShadow: active ? "inset 0 0 0 1px rgba(111,148,135,0.25)" : "none",
                  }}
                >
                  <NavIcon size={18} strokeWidth={2} />
                  {label}
                </button>
              );
            })}
          </nav>
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
            <div
              style={{
                fontSize: 11,
                color: TEXT_META,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 8,
                fontWeight: 700,
              }}
            >
              Repository
            </div>
            <div
              title={repoUrl || undefined}
              style={{
                fontSize: 14,
                color: TEXT_META,
                fontFamily: "ui-monospace, monospace",
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(22,62,60,0.35)",
                border: `1px solid ${GLASS_BORDER}`,
                marginBottom: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {repoUrl.trim() || "No URL"}
            </div>
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={loading || !repoUrl.trim()}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${GLASS_BORDER}`,
                background: loading || !repoUrl.trim() ? "rgba(22,62,60,0.25)" : BUTTON_BG,
                color: TEXT_HEADING,
                fontSize: 14,
                fontWeight: 500,
                cursor: loading || !repoUrl.trim() ? "not-allowed" : "pointer",
              }}
            >
              Re-analyze
            </button>
          </div>
        </aside>

        <div
          style={{
            marginLeft: SIDEBAR_WIDTH,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: "100vh",
          }}
        >
          <header
            style={{
              height: 56,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
              borderBottom: `1px solid ${SIDEBAR_BORDER}`,
              background: PAGE_BG,
            }}
          >
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: "-0.4px", color: TEXT_HEADING }}>
              {navTitle}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {healthScore != null && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    borderRadius: 999,
                    fontSize: 14,
                    fontWeight: 700,
                    ...healthBadgeChrome(Math.round(healthScore)),
                  }}
                >
                  Health {Math.round(healthScore)}/100
                </div>
              )}
              <button
                type="button"
                onClick={exportPDF}
                disabled={!results}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: `1px solid ${GLASS_BORDER}`,
                  background: results ? GLASS_BG : "rgba(22,62,60,0.2)",
                  color: results ? TEXT_HEADING : TXT_MUTED,
                  cursor: results ? "pointer" : "not-allowed",
                }}
              >
                <Download size={16} strokeWidth={2} />
                Export
              </button>
            </div>
          </header>

          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px 48px", boxSizing: "border-box" }}>
            {error ? (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  marginBottom: 20,
                  border: `1px solid rgba(201,107,92,0.4)`,
                  background: "rgba(201,107,92,0.1)",
                  color: DANGER,
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            ) : null}

            <section id="section-analyze" style={{ scrollMarginTop: 8 }}>
              <div
                style={{
                  background: "#092828",
                  border: "1px solid #163E3C",
                  borderRadius: "12px",
                  padding: "1.5rem 2rem",
                  marginBottom: "2rem",
                }}
              >
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: 11,
                    color: "#325F57",
                    marginBottom: 8,
                    letterSpacing: "0.06em",
                  }}
                >
                  ▸ ANALYZE A REPOSITORY
                </div>
                <div style={{ display: "flex", width: "100%", alignItems: "stretch", marginBottom: 10 }}>
                  <input
                    className="dashboard-url-input"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="github.com/owner/repo"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      boxSizing: "border-box",
                      background: "#04151A",
                      border: "1px solid #325F57",
                      borderRight: "none",
                      borderRadius: "8px 0 0 8px",
                      padding: "14px 16px",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                      fontSize: 13,
                      color: "#b8d4c8",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void analyze()}
                    disabled={loading || !repoUrl.trim()}
                    style={{
                      flexShrink: 0,
                      background: "#325F57",
                      color: "#04151A",
                      fontSize: 15,
                      fontWeight: 600,
                      border: "1px solid #325F57",
                      borderRadius: "0 8px 8px 0",
                      padding: "14px 24px",
                      cursor: loading || !repoUrl.trim() ? "not-allowed" : "pointer",
                      opacity: loading || !repoUrl.trim() ? 0.5 : 1,
                    }}
                  >
                    {loading ? "Analyzing…" : "Analyze →"}
                  </button>
                </div>
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: 11,
                    color: "#6F9487",
                    opacity: 0.5,
                    lineHeight: 1.5,
                  }}
                >
                  No account needed · Read-only access · Results in 60 seconds
                </div>
              </div>
            </section>

            <section id="section-overview" style={{ scrollMarginTop: 8, marginBottom: 32 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: TEXT_LABEL,
                  textTransform: "uppercase",
                  marginBottom: 16,
                }}
              >
                Overview
              </div>
              <div
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 50%, rgba(50, 95, 87, 0.05) 0%, transparent 50%)",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 14,
                  marginBottom: 24,
                }}
              >
                {(
                  [
                    { label: "Files scanned", value: results ? String(kpiFiles) : "—", IconCmp: Files },
                    { label: "Issues found", value: results ? String(kpiIssues) : "—", IconCmp: AlertTriangle },
                    { label: "Dependencies", value: results ? String(kpiDeps) : "—", IconCmp: Package },
                    { label: "Analysis time", value: formatWallMs(analysisWallMs), IconCmp: Timer },
                  ] as const
                ).map((k) => {
                  const IconEl = k.IconCmp;
                  return (
                    <div
                      key={k.label}
                      className="stacksense-glass-card stacksense-glass-card--interactive"
                      style={{ padding: "18px 16px" }}
                    >
                      <IconEl size={22} strokeWidth={2} style={{ color: KPI_ICON_COLOR, marginBottom: 14 }} />
                      <div
                        style={{
                          fontSize: 40,
                          fontWeight: 600,
                          letterSpacing: "-1px",
                          color: TEXT_HEADING,
                          lineHeight: 1.1,
                        }}
                      >
                        {k.value}
                      </div>
                      <div style={{ fontSize: 15, color: TEXT_LABEL, marginTop: 8 }}>{k.label}</div>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: TEXT_LABEL,
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}
              >
                Agent pipeline
              </div>

      {!loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          {AGENT_ORDER.map((name) => {
            const agent = agents[name];
            const AgentIcon = AGENT_ICONS[name];
            const running = agent.status === "running";
            const done = agent.status === "done";
            const err = agent.status === "error";
            const dotColor = agentPipelineDotColor(agent.status);
            return (
              <div
                key={name}
                className={`stacksense-glass-card stacksense-glass-card--interactive ${running ? "stacksense-agent-card-running" : ""}`}
                style={{
                  padding: "16px 14px",
                  border: `1px solid ${
                    running
                      ? "rgba(50, 95, 87, 0.55)"
                      : done
                        ? "rgba(111, 148, 135, 0.45)"
                        : err
                          ? "rgba(201, 107, 92, 0.45)"
                          : GLASS_BORDER
                  }`,
                  boxShadow: done
                    ? `0 0 20px ${SUCCESS}18`
                    : err
                      ? `0 0 20px ${DANGER}22`
                      : running
                        ? `0 0 24px ${ACCENT}20`
                        : undefined,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    className={running ? "stacksense-agent-status-dot-running" : undefined}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: dotColor,
                      boxShadow: `0 0 10px ${dotColor}66`,
                    }}
                  />
                  <AgentIcon size={18} strokeWidth={2} style={{ color: running ? ACCENT : TXT_MUTED, flexShrink: 0 }} />
                  <span
                    style={{
                      color: TEXT_HEADING,
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: "-0.5px",
                    }}
                  >
                    {AGENT_LABELS[name]}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: TEXT_LABEL,
                      padding: "3px 8px",
                      borderRadius: 8,
                      border: `1px solid ${GLASS_BORDER}`,
                      background: "rgba(22,62,60,0.35)",
                    }}
                  >
                    {formatAgentTiming(agentElapsedMs[name], agent.status)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: TEXT_LABEL,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {agent.status}
                  </span>
                </div>
                <p style={{ color: TEXT_DESC, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                  {agent.msg ||
                    (name === "mapper"
                      ? "Reads every file, builds dependency graph"
                      : name === "risk"
                        ? "Finds coupling, missing tests, circular deps"
                        : name === "auditor"
                          ? "Scans deps for CVEs and outdated packages"
                          : "Synthesizes health score and recommendations")}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

              {results ? (
                <div
                  className="stacksense-glass-card stacksense-glass-card--interactive"
                  style={{ padding: "22px", marginBottom: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: TEXT_LABEL,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      marginBottom: "12px",
                      fontWeight: 700,
                    }}
                  >
                    health score
                  </div>
                  <HealthScoreRing score={Number(results.scorer?.score ?? 67)} />
                  {[
                    { label: "coupling", value: results.scorer?.coupling || 42 },
                    { label: "coverage", value: results.scorer?.coverage || 71 },
                    { label: "dependencies", value: results.scorer?.dependencies || 58 },
                    { label: "dead code", value: results.scorer?.deadCode || 89 },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          color: TEXT_LABEL,
                          width: "100px",
                          flexShrink: 0,
                          textTransform: "capitalize",
                        }}
                      >
                        {item.label}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          background: "rgba(22,62,60,0.45)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${item.value}%`,
                            height: "100%",
                            background: healthMetricBarColor(item.label),
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 14, color: TEXT_HEADING, minWidth: 28, fontWeight: 600 }}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="stacksense-glass-card"
                  style={{ padding: 20, marginBottom: 24, color: TEXT_LABEL, fontSize: 15, lineHeight: 1.6 }}
                >
                  Run an analysis to see health scores and category breakdowns.
                </div>
              )}
            </section>

      {results && (
        <>
          <section id="section-map" style={{ scrollMarginTop: 8, marginBottom: 32 }}>
            <div
              className="stacksense-glass-card stacksense-glass-card--interactive"
              style={{ padding: "22px", boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}
            >
              <h2
                style={{
                  margin: "0 0 16px 0",
                  fontSize: 16,
                  fontWeight: 600,
                  color: TEXT_HEADING,
                  letterSpacing: "-0.5px",
                }}
              >
                Codebase Map
              </h2>
              <CodebaseMapGraph
                nodes={codebaseGraphNodes}
                edges={(results.mapper?.edges as MapperEdge[]) || []}
                onSelectNode={handleSelectMapperNode}
              />
              <div
                style={{
                  marginTop: "16px",
                  padding: "16px",
                  ...glassPanel,
                  minHeight: "72px",
                }}
              >
                {selectedMapperNode ? (
                  <>
                    <div
                      style={{
                        fontSize: 13,
                        color: TEXT_LABEL,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        marginBottom: "8px",
                        fontWeight: 700,
                      }}
                    >
                      Full path
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: TEXT_HEADING,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                        wordBreak: "break-all",
                        lineHeight: 1.6,
                        marginBottom: "6px",
                      }}
                      title={selectedMapperNode.id}
                    >
                      {selectedMapperNode.id}
                    </div>
                    <div style={{ fontSize: 13, color: TEXT_DESC, marginBottom: "10px" }}>
                      File name:{" "}
                      <span style={{ color: TEXT_DESC, fontFamily: "ui-monospace, monospace" }}>
                        {fileBasename(selectedMapperNode.id)}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: 13, lineHeight: 1.6 }}>
                      <span style={{ color: TEXT_DESC }}>
                        Risk:{" "}
                        <span
                          style={{
                            color: riskPalette(selectedMapperNode.risk).stroke,
                            fontWeight: 600,
                            textTransform: "capitalize",
                          }}
                        >
                          {selectedMapperNode.risk || "healthy"}
                        </span>
                      </span>
                      <span style={{ color: TEXT_DESC }}>
                        Deps (count):{" "}
                        <span style={{ color: TEXT_HEADING, fontWeight: 600 }}>
                          {selectedMapperNode.deps ?? 0}
                        </span>
                      </span>
                      <span style={{ color: TEXT_DESC }}>
                        Imports from:{" "}
                        <span style={{ color: TEXT_HEADING, fontWeight: 600 }}>
                          {
                            ((results.mapper?.edges as MapperEdge[]) || []).filter(
                              (e) => e.source === selectedMapperNode.id
                            ).length
                          }
                        </span>
                      </span>
                      <span style={{ color: TEXT_DESC }}>
                        Imported by:{" "}
                        <span style={{ color: TEXT_HEADING, fontWeight: 600 }}>
                          {
                            ((results.mapper?.edges as MapperEdge[]) || []).filter(
                              (e) => e.target === selectedMapperNode.id
                            ).length
                          }
                        </span>
                      </span>
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 15, color: TEXT_DESC, lineHeight: 1.6 }}>
                    Click a node to see the full file path below. Drag nodes, scroll to zoom, and drag empty space to
                    pan.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section id="section-insights" style={{ scrollMarginTop: 8, marginBottom: 32 }}>
            <div
              className="stacksense-glass-card stacksense-glass-card--interactive"
              style={{ padding: "22px", boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: TEXT_LABEL,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: "12px",
                  fontWeight: 700,
                }}
              >
                AI insights
              </div>
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: 11,
                    color: "#6F9487",
                    marginBottom: 8,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Security Grade
                </div>
                <div
                  style={{
                    fontFamily: "DM Serif Display, serif",
                    fontSize: 64,
                    lineHeight: 1,
                    color: securityGradeColor,
                  }}
                >
                  {securityGrade}
                </div>
              </div>

              <div
                style={{
                  background: "#092828",
                  border: "1px solid #163E3C",
                  borderRadius: 12,
                  padding: "24px",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: 11,
                    color: "#325F57",
                    marginBottom: 10,
                    letterSpacing: "0.08em",
                  }}
                >
                  ▸ EXECUTIVE SUMMARY
                </div>
                <p style={{ fontFamily: "Outfit, sans-serif", fontSize: 16, color: "#b8d4c8", lineHeight: 1.8, margin: 0 }}>
                  {aiInsights.summary?.trim() || "No executive summary returned yet."}
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: 11,
                    color: "#ff5f57",
                    marginBottom: 10,
                    letterSpacing: "0.08em",
                  }}
                >
                  ▸ CRITICAL ACTIONS
                </div>
                {insightsCriticalActions.length > 0 ? (
                  insightsCriticalActions.map((item, i) => {
                    const effort = item.effort === "Low" || item.effort === "Medium" || item.effort === "High" ? item.effort : "Medium";
                    const effortColor = effort === "Low" ? "#28ca41" : effort === "Medium" ? "#ffbd2e" : "#ff5f57";
                    return (
                      <div
                        key={`critical-action-${i}`}
                        style={{
                          padding: "12px 0",
                          borderBottom: i < insightsCriticalActions.length - 1 ? "1px solid #163E3C" : "none",
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 15, color: "#ffffff", fontWeight: 500, lineHeight: 1.6 }}>
                            {item.action || "Action pending"}
                          </div>
                          <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 14, color: "#b8d4c8", lineHeight: 1.7, marginTop: 2 }}>
                            {item.reason || "Reason not provided."}
                          </div>
                        </div>
                        <span
                          style={{
                            fontFamily: "IBM Plex Mono, monospace",
                            fontSize: 11,
                            color: effortColor,
                            background:
                              effort === "Low"
                                ? "rgba(40,202,65,0.15)"
                                : effort === "Medium"
                                  ? "rgba(255,189,46,0.15)"
                                  : "rgba(255,95,87,0.15)",
                            border: `1px solid ${effortColor}55`,
                            borderRadius: 999,
                            padding: "4px 10px",
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          {effort}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ margin: 0, color: "#b8d4c8", fontSize: 14 }}>No critical actions returned yet.</p>
                )}
              </div>

              <div
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: 12,
                  color: "#6F9487",
                  marginBottom: 16,
                }}
              >
                Estimated remediation time: {estimatedFixTime}
              </div>

              <div
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: 11,
                  color: "#325F57",
                  marginBottom: 10,
                  letterSpacing: "0.08em",
                }}
              >
                ▸ DETAILED RECOMMENDATIONS
              </div>
              {insightsRecommendations.length > 0 ? (
                insightsRecommendations.map((rec: string, i: number) => (
                  <div key={`insight-rec-${i}`} style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ color: "#325F57", marginTop: 1, fontSize: 14, lineHeight: 1.6 }}>▸</div>
                    <p style={{ fontFamily: "Outfit, sans-serif", fontSize: 15, color: "#b8d4c8", lineHeight: 1.6, margin: 0 }}>
                      {rec}
                    </p>
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, color: "#b8d4c8", fontSize: 14 }}>No recommendations returned yet.</p>
              )}
            </div>
          </section>

          <section id="section-risk" style={{ scrollMarginTop: 8, marginBottom: 32 }}>
            <div
              className="stacksense-glass-card stacksense-glass-card--interactive"
              style={{ padding: "22px", boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: TEXT_LABEL,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: "12px",
                  fontWeight: 700,
                }}
              >
                risk analysis
              </div>
              {results.risk?.risks?.slice(0, 6).map((risk: RiskListItem, i: number) => {
                const expanded = expandedRisk === i;
                const sevLabel = riskSeverityUiLabel(risk.severity);
                const badgeChrome = riskSeverityBadgeStyle(sevLabel);
                const cvss =
                  typeof risk.cvss === "number" && Number.isFinite(risk.cvss)
                    ? Math.round(risk.cvss * 10) / 10
                    : null;
                const whatText = (risk.whatIsThis || "").trim() || "—";
                const whyText = (risk.whyDangerous || "").trim() || "—";
                const fixText = (risk.howToFix || "").trim() || "// No fix snippet returned for this finding.";
                return (
                  <div
                    key={i}
                    style={{
                      borderRadius: 12,
                      marginBottom: 8,
                      border: `1px solid ${
                        risk.severity === "critical" ? "rgba(201,107,92,0.35)" : "rgba(217,162,60,0.28)"
                      }`,
                      background: "rgba(22,62,60,0.25)",
                      backdropFilter: "blur(8px)",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedRisk(expanded ? null : i)}
                      aria-expanded={expanded}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: 12,
                        width: "100%",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        color: "inherit",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: risk.severity === "critical" ? DANGER : WARNING,
                          marginTop: 4,
                          flexShrink: 0,
                          boxShadow: `0 0 12px ${risk.severity === "critical" ? DANGER : WARNING}66`,
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: TEXT_HEADING,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                          }}
                        >
                          {risk.file}
                        </div>
                        <div style={{ fontSize: 15, color: TEXT_DESC, marginTop: 4, lineHeight: 1.6 }}>
                          {risk.issue}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: risk.severity === "critical" ? DANGER : WARNING,
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {risk.score != null ? risk.score : "—"}
                      </span>
                      <span
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          marginTop: 2,
                          fontSize: 12,
                          color: TEXT_LABEL,
                          display: "inline-flex",
                          alignItems: "center",
                          transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                          transition: "transform 0.3s ease",
                        }}
                      >
                        ▼
                      </span>
                    </button>
                    <div
                      style={{
                        maxHeight: expanded ? 3200 : 0,
                        transition: "max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          background: "#04151A",
                          borderTop: "1px solid #163E3C",
                          padding: "1.5rem",
                        }}
                      >
                        <div style={{ marginBottom: 20 }}>
                          <div
                            style={{
                              fontFamily: FONT_IBM_PLEX,
                              fontSize: 11,
                              letterSpacing: "0.06em",
                              color: "#325F57",
                              fontWeight: 600,
                              marginBottom: 8,
                            }}
                          >
                            WHAT IS THIS?
                          </div>
                          <p
                            style={{
                              fontFamily: FONT_OUTFIT,
                              fontSize: 14,
                              color: "#b8d4c8",
                              lineHeight: 1.65,
                              margin: 0,
                            }}
                          >
                            {whatText}
                          </p>
                        </div>
                        <div style={{ marginBottom: 20 }}>
                          <div
                            style={{
                              fontFamily: FONT_IBM_PLEX,
                              fontSize: 11,
                              letterSpacing: "0.06em",
                              color: "#ff5f57",
                              fontWeight: 600,
                              marginBottom: 8,
                            }}
                          >
                            WHY IT&apos;S DANGEROUS
                          </div>
                          <p
                            style={{
                              fontFamily: FONT_OUTFIT,
                              fontSize: 14,
                              color: "#b8d4c8",
                              lineHeight: 1.65,
                              margin: 0,
                            }}
                          >
                            {whyText}
                          </p>
                        </div>
                        <div style={{ marginBottom: 20 }}>
                          <div
                            style={{
                              fontFamily: FONT_IBM_PLEX,
                              fontSize: 11,
                              letterSpacing: "0.06em",
                              color: "#28ca41",
                              fontWeight: 600,
                              marginBottom: 8,
                            }}
                          >
                            HOW TO FIX IT
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              padding: "0.75rem",
                              borderRadius: 8,
                              background: "#04151A",
                              border: "1px solid #163E3C",
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                              fontSize: 13,
                              color: "#b8d4c8",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              lineHeight: 1.5,
                            }}
                          >
                            {fixText}
                          </pre>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              padding: "4px 12px",
                              borderRadius: 20,
                              ...badgeChrome,
                            }}
                          >
                            {sevLabel}
                          </span>
                          {cvss != null ? (
                            <span
                              style={{
                                fontFamily: FONT_IBM_PLEX,
                                fontSize: 12,
                                color: TEXT_META,
                              }}
                            >
                              CVSS {cvss.toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="section-deps" style={{ scrollMarginTop: 8, marginBottom: 32 }}>
            <div
              className="stacksense-glass-card stacksense-glass-card--interactive"
              style={{ padding: "22px", boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: TEXT_LABEL,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: "12px",
                  fontWeight: 700,
                }}
              >
                dependency audit
              </div>
              {(() => {
                const auditDeps = (results.auditor?.dependencies ?? []) as Array<{
                  name?: string;
                  version?: string;
                  status?: string;
                  issue?: string;
                }>;
                if (auditDeps.length === 0) {
                  return (
                    <p style={{ margin: 0, color: TEXT_DESC, fontSize: 15, lineHeight: 1.6 }}>
                      No dependency issues found.
                    </p>
                  );
                }
                return auditDeps.slice(0, 8).map((dep, i) => {
                  const rawSt = String(dep.status ?? "ok").toLowerCase().replace(/-/g, "");
                  const statusNorm =
                    rawSt === "vulnerable" ? "vulnerable" : rawSt === "outdated" ? "outdated" : "ok";
                  const name = dep.name?.trim() || "unknown package";
                  const version = dep.version?.trim() || "—";
                  const issue = dep.issue?.trim() || "—";
                  return (
                    <div
                      key={`${name}-${i}`}
                      style={{
                        padding: "12px 0",
                        borderBottom: `1px solid ${GLASS_BORDER}`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: TEXT_HEADING,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                            flex: "1 1 160px",
                            minWidth: 0,
                          }}
                        >
                          {name}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            color: TEXT_LABEL,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                          }}
                        >
                          {version}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "4px 10px",
                            borderRadius: 20,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            flexShrink: 0,
                            background:
                              statusNorm === "vulnerable"
                                ? "rgba(201,107,92,0.15)"
                                : statusNorm === "outdated"
                                  ? "rgba(217,162,60,0.12)"
                                  : "rgba(111,148,135,0.15)",
                            color:
                              statusNorm === "vulnerable"
                                ? DANGER
                                : statusNorm === "outdated"
                                  ? WARNING
                                  : SUCCESS,
                          }}
                        >
                          {statusNorm}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: 13,
                          color: TEXT_DESC,
                          lineHeight: 1.65,
                          fontFamily: "Outfit, sans-serif",
                        }}
                      >
                        {issue}
                      </p>
                    </div>
                  );
                });
              })()}
            </div>
          </section>
        </>
      )}

          </div>
        </div>
      </div>
    </main>
  );
}