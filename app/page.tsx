"use client"

import * as d3 from "d3"
import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react"
import Link from "next/link"
import { MarketingLogoLink, MarketingNavbar } from "@/components/marketing-navbar"

// ============================================================================
// TYPES
// ============================================================================
interface Node {
  x: number
  y: number
  vx: number
  vy: number
  originX: number
  originY: number
}

// ============================================================================
// CANVAS BACKGROUND - Neural mesh with mouse interaction
// ============================================================================
function CanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<Node[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const hubPulseRef = useRef(0)
  const animationRef = useRef<number>(0)

  const initNodes = useCallback((width: number, height: number) => {
    const nodes: Node[] = []
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * width
      const y = Math.random() * height
      nodes.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        originX: x,
        originY: y,
      })
    }
    return nodes
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      nodesRef.current = initNodes(canvas.width, canvas.height)
    }

    resize()
    window.addEventListener("resize", resize)

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", handleMouseMove)

    const animate = () => {
      if (!ctx || !canvas) return

      ctx.fillStyle = "#04151A"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const nodes = nodesRef.current
      const mouse = mouseRef.current
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2

      hubPulseRef.current += 0.02

      nodes.forEach((node, i) => {
        node.x += node.vx
        node.y += node.vy

        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1

        const dxMouse = mouse.x - node.x
        const dyMouse = mouse.y - node.y
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse)
        if (distMouse < 180 && distMouse > 0) {
          const force = ((180 - distMouse) / 180) * 0.02
          node.x += dxMouse * force
          node.y += dyMouse * force
        }

        for (let j = i + 1; j < nodes.length; j++) {
          const other = nodes[j]
          const dx = other.x - node.x
          const dy = other.y - node.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 140) {
            const opacity = (1 - dist / 140) * 0.5
            ctx.strokeStyle = `rgba(50, 95, 87, ${opacity})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(node.x, node.y)
            ctx.lineTo(other.x, other.y)
            ctx.stroke()
          }
        }

        ctx.fillStyle = "#7ab8a4"
        ctx.beginPath()
        ctx.arc(node.x, node.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      })

      const pulsePhase = hubPulseRef.current
      for (let r = 0; r < 3; r++) {
        const radius = 20 + r * 15 + Math.sin(pulsePhase - r * 0.5) * 5
        const opacity = 0.3 - r * 0.1
        ctx.strokeStyle = `rgba(50, 95, 87, ${opacity})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.fillStyle = "#325F57"
      ctx.beginPath()
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2)
      ctx.fill()

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouseMove)
      cancelAnimationFrame(animationRef.current)
    }
  }, [initNodes])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ background: "#04151A" }}
    />
  )
}

// ============================================================================
// STATUS BAR
// ============================================================================
function StatusBar() {
  const [clock, setClock] = useState("")

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const timeStr = now.toLocaleTimeString("en-US", {
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      const tzShort =
        new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(now).find((p) => p.type === "timeZoneName")
          ?.value ?? ""
      setClock(`${timeStr} ${tzShort}`.trim())
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed left-0 right-0 top-16 z-40 border-b border-[#163E3C] bg-[#092828]">
      <div className="mx-auto flex h-7 max-w-7xl items-center justify-between px-8">
        <span className="font-mono text-[11px] tracking-wider text-[#7ab8a4]">
          SYS:STACKSENSE-OS / BUILD 2026.05
        </span>
        <span className="flex items-center font-mono text-[11px] tracking-wider text-[#7ab8a4]">
          <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#7ab8a4]" />
          ALL_SYSTEMS_NOMINAL · {clock}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// DEMO MODAL — Dependency graph (D3)
// ============================================================================
type DepGraphNodeType = "root" | "core" | "vulnerable" | "critical" | "normal"

interface DepGraphSimNode extends d3.SimulationNodeDatum {
  id: string
  type: DepGraphNodeType
}

function DependencyGraph() {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return

    const svg = d3.select(el)
    svg.selectAll("*").remove()

    const width = el.clientWidth || 800
    const height = 280

    const nodes: DepGraphSimNode[] = [
      { id: "acme-api", type: "root" },
      { id: "express", type: "core" },
      { id: "lodash", type: "vulnerable" },
      { id: "cross-spawn", type: "critical" },
      { id: "react", type: "core" },
      { id: "axios", type: "normal" },
      { id: "webpack", type: "core" },
      { id: "babel", type: "normal" },
      { id: "jest", type: "normal" },
      { id: "typescript", type: "core" },
      { id: "dotenv", type: "vulnerable" },
      { id: "cors", type: "normal" },
      { id: "helmet", type: "normal" },
      { id: "morgan", type: "normal" },
      { id: "jsonwebtoken", type: "vulnerable" },
    ]

    const links: { source: string; target: string }[] = [
      { source: "acme-api", target: "express" },
      { source: "acme-api", target: "react" },
      { source: "acme-api", target: "webpack" },
      { source: "acme-api", target: "typescript" },
      { source: "acme-api", target: "dotenv" },
      { source: "express", target: "cors" },
      { source: "express", target: "helmet" },
      { source: "express", target: "morgan" },
      { source: "express", target: "cross-spawn" },
      { source: "react", target: "lodash" },
      { source: "webpack", target: "babel" },
      { source: "webpack", target: "lodash" },
      { source: "acme-api", target: "jsonwebtoken" },
      { source: "acme-api", target: "axios" },
      { source: "babel", target: "cross-spawn" },
      { source: "jest", target: "cross-spawn" },
      { source: "acme-api", target: "jest" },
    ]

    const colorMap: Record<DepGraphNodeType, string> = {
      root: "#325F57",
      core: "#6F9487",
      vulnerable: "#ffbd2e",
      critical: "#ff5f57",
      normal: "#163E3C",
    }

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<DepGraphSimNode, { source: string; target: string }>(links)
          .id((d) => d.id)
          .distance(70)
      )
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<DepGraphSimNode>().radius(28))

    const g = svg.append("g")

    const linkSel = g.append("g").attr("class", "links")

    const link = linkSel
      .selectAll<SVGLineElement, d3.SimulationLinkDatum<DepGraphSimNode>>("line")
      .data(links as d3.SimulationLinkDatum<DepGraphSimNode>[])
      .join("line")
      .attr("stroke", "#163E3C")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.8)

    const node = g
      .append("g")
      .selectAll<SVGGElement, DepGraphSimNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")

    node
      .append("circle")
      .attr("r", (d) => (d.type === "root" ? 14 : d.type === "core" ? 10 : 7))
      .attr("fill", (d) => colorMap[d.type])
      .attr("fill-opacity", (d) => (d.type === "normal" ? 0.6 : 1))
      .attr("stroke", (d) => colorMap[d.type])
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.8)

    node
      .append("text")
      .text((d) => d.id)
      .attr("x", 0)
      .attr("y", (d) => (d.type === "root" ? 24 : 18))
      .attr("text-anchor", "middle")
      .attr("fill", "#6F9487")
      .attr("font-size", "9px")
      .attr("font-family", "IBM Plex Mono, monospace")

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as DepGraphSimNode).x ?? 0)
        .attr("y1", (d) => (d.source as DepGraphSimNode).y ?? 0)
        .attr("x2", (d) => (d.target as DepGraphSimNode).x ?? 0)
        .attr("y2", (d) => (d.target as DepGraphSimNode).y ?? 0)
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    node.call(
      d3
        .drag<SVGGElement, DepGraphSimNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on("drag", (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
    )

    return () => {
      simulation.stop()
    }
  }, [])

  const legendItems = [
    { color: "#325F57", label: "Root" },
    { color: "#6F9487", label: "Core dep" },
    { color: "#ffbd2e", label: "Vulnerable" },
    { color: "#ff5f57", label: "Critical" },
  ]

  return (
    <div>
      <svg ref={svgRef} style={{ width: "100%", height: "280px", background: "#04151A", borderRadius: "6px" }} />
      <div style={{ display: "flex", gap: "16px", marginTop: "8px", justifyContent: "center" }}>
        {legendItems.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
            <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "10px", color: "#6F9487" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// HERO SECTION
// ============================================================================
function Hero({
  showDemo,
  setShowDemo,
}: {
  showDemo: boolean
  setShowDemo: Dispatch<SetStateAction<boolean>>
}) {
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null)

  const findings = [
    {
      id: "CVE-2024-21538",
      desc: "cross-spawn vulnerability in node_modules",
      severity: "CRITICAL",
      color: "#ff5f57",
      what: "CVE-2024-21538 is a known vulnerability in the cross-spawn package - a utility used to spawn child processes. It allows attackers to execute arbitrary commands.",
      why: "If exploited, an attacker can run malicious commands on your server. This is a Remote Code Execution risk that can completely compromise your application.",
      fix: 'npm install cross-spawn@latest\n// or update in package.json:\n"cross-spawn": "^7.0.6"',
    },
    {
      id: "Exposed API Key",
      desc: "Hardcoded secret found in config/database.js line 23",
      severity: "HIGH",
      color: "#ffbd2e",
      what: "A hardcoded API key or password was found directly in your source code. Anyone with access to your repository can see and use this credential.",
      why: "Exposed secrets are one of the most common causes of data breaches. Attackers scan GitHub for hardcoded credentials automatically within minutes of a push.",
      fix: '// Remove hardcoded secret:\n// const API_KEY = "sk-abc123..." X\n\n// Use environment variables instead:\nconst API_KEY = process.env.API_KEY\n\n// Add to .env file (never commit this):\nAPI_KEY=sk-abc123...',
    },
    {
      id: "Outdated lodash@4.17.15",
      desc: "Critical security patches available in v4.17.21",
      severity: "HIGH",
      color: "#ffbd2e",
      what: "lodash version 4.17.15 has known security vulnerabilities including prototype pollution attacks that were fixed in version 4.17.21.",
      why: "Prototype pollution can allow attackers to modify JavaScript object behavior globally, potentially leading to denial of service or remote code execution.",
      fix: 'npm install lodash@latest\n// or update package.json:\n"lodash": "^4.17.21"',
    },
  ] as const

  return (
    <section className="relative flex min-h-screen items-center justify-center pt-24">
      <div className="relative z-10 mx-auto w-full max-w-7xl px-8">
        <div className="flex flex-col items-center text-center">
          {/* Headlines */}
          <h1 className="font-serif text-[clamp(56px,10vw,88px)] font-normal leading-[1.0] tracking-tight text-[#ffffff]">
            Your codebase
          </h1>
          <h1 className="font-serif text-[clamp(56px,10vw,88px)] font-normal italic leading-[1.0] tracking-tight text-[#ffffff]">
            has secrets.
          </h1>
          <p className="mt-4 font-serif text-[clamp(28px,5vw,36px)] italic text-[#5ca68a]">
            StackSense finds them.
          </p>

          {/* Body */}
          <p className="mx-auto mt-6 max-w-[520px] font-sans text-[18px] leading-[1.8] text-[#b8d4c8]">
            Four specialized AI agents scan any GitHub repository and surface
            critical security vulnerabilities, outdated dependencies,
            architectural risks, and code quality issues — all in under 60
            seconds.
          </p>

          {/* Keyword pills */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              "CVE Detection",
              "Dependency Audit",
              "Code Quality",
              "AI Analysis",
              "< 60 seconds",
              "Free forever",
            ].map((pill) => (
              <span
                key={pill}
                className="rounded-full border border-[rgba(94,180,154,0.4)] bg-[#092828] px-3 py-1 font-mono text-[11px] text-[#8ecfba]"
              >
                {pill}
              </span>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-md bg-[#325F57] px-8 py-4 font-sans text-[15px] font-semibold text-[#04151A] transition-colors hover:bg-[#7ab8a4]"
            >
              Get Started Free &rarr;
            </Link>
          </div>

          {/* Micro text */}
          <p className="mt-4 font-mono text-[11px] text-[#6a9e8e]">
            No credit card · Read-only GitHub access · Results in 60 seconds
          </p>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="h-8 w-[1px] animate-pulse bg-gradient-to-b from-transparent via-[#325F57] to-transparent" />
      </div>

      {showDemo && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(4,21,26,0.92)",
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            backdropFilter: "blur(8px)",
            animation: "demoBackdropIn 220ms ease-out",
          }}
          onClick={() => setShowDemo(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "900px",
              maxHeight: "85vh",
              overflowY: "auto",
              borderRadius: "12px",
              border: "1px solid #163E3C",
              boxShadow: "0 0 80px rgba(50,95,87,0.2)",
              animation: "demoModalIn 220ms ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Browser chrome bar */}
            <div
              style={{
                background: "#092828",
                borderRadius: "12px 12px 0 0",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                borderBottom: "1px solid #163E3C",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28ca41" }} />
              <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                <span
                  style={{
                    background: "#04151A",
                    borderRadius: "4px",
                    padding: "3px 12px",
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: "11px",
                    color: "#b8d4c8",
                  }}
                >
                  stacksense.app/report/acme-api
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDemo(false)}
                aria-label="Close demo modal"
                style={{
                  background: "#04151A",
                  border: "1px solid #325F57",
                  borderRadius: "6px",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "18px",
                  lineHeight: 1,
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Dashboard content */}
            <div style={{ background: "#04151A", borderRadius: "0 0 12px 12px", padding: "1.5rem" }}>
              {/* Stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "1rem" }}>
                {[
                  { label: "Health Score", value: "72/100", tag: "Needs attention", tagColor: "#ffbd2e" },
                  { label: "Critical Issues", value: "3", tag: "Immediate action required", tagColor: "#ff5f57" },
                  { label: "Dependencies", value: "147", tag: "23 outdated", tagColor: "#ffbd2e" },
                  { label: "Files Scanned", value: "1,247", tag: "Completed in 54s", tagColor: "#325F57" },
                ].map((card, i) => (
                  <div key={i} style={{ background: "#092828", border: "1px solid #163E3C", borderRadius: "8px", padding: "1rem" }}>
                    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "10px", color: "#b8d4c8", marginBottom: "8px" }}>{card.label}</div>
                    <div
                      style={{
                        fontFamily: "DM Serif Display, serif",
                        fontSize: "32px",
                        color: i === 1 ? "#ff5f57" : "#ffffff",
                        marginBottom: "4px",
                      }}
                    >
                      {card.value}
                    </div>
                    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "10px", color: card.tagColor }}>{card.tag}</div>
                  </div>
                ))}
              </div>

              {/* Agent results */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "1rem" }}>
                {[
                  { name: "Mapper", finding: "Repository map generated successfully." },
                  { name: "Risk Detector", finding: "Security risk scan completed." },
                  { name: "Auditor", finding: "Dependency and CVE audit completed." },
                  { name: "Scorer", finding: "Health scoring analysis completed." },
                ].map((agent, i) => (
                  <div key={i} style={{ background: "#092828", border: "1px solid #163E3C", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "11px", color: "#ffffff" }}>{agent.name}</span>
                      <span
                        style={{
                          fontFamily: "IBM Plex Mono, monospace",
                          fontSize: "9px",
                          color: "#7ab8a4",
                          background: "rgba(50,95,87,0.25)",
                          borderRadius: "999px",
                          padding: "2px 6px",
                        }}
                      >
                        Complete
                      </span>
                    </div>
                    <div style={{ fontFamily: "Outfit, sans-serif", fontSize: "11px", color: "#b8d4c8", lineHeight: 1.5 }}>{agent.finding}</div>
                  </div>
                ))}
              </div>

              {/* Critical findings */}
              <div style={{ background: "#092828", border: "1px solid #163E3C", borderRadius: "8px", padding: "1rem" }}>
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: "11px",
                    color: "#ffffff",
                    borderBottom: "1px solid #163E3C",
                    paddingBottom: "8px",
                    marginBottom: "12px",
                  }}
                >
                  Critical Findings
                </div>
                {findings.map((finding, i) => (
                  <div
                    key={i}
                    onClick={() => setExpandedFinding(expandedFinding === i ? null : i)}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        padding: "8px 0",
                        borderBottom: i < findings.length - 1 && expandedFinding !== i ? "1px solid rgba(22,62,60,0.5)" : "none",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: finding.color, marginTop: "4px", flexShrink: 0 }} />
                        <div>
                          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "11px", color: finding.color }}>{finding.id}</div>
                          <div style={{ fontFamily: "Outfit, sans-serif", fontSize: "12px", color: "#b8d4c8", marginTop: "2px" }}>{finding.desc}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <span
                          style={{
                            fontFamily: "IBM Plex Mono, monospace",
                            fontSize: "9px",
                            color: finding.color,
                            background: `rgba(${finding.color === "#ff5f57" ? "255,95,87" : "255,189,46"},0.1)`,
                            borderRadius: "4px",
                            padding: "2px 6px",
                          }}
                        >
                          {finding.severity}
                        </span>
                        <span style={{ color: "#b8d4c8", fontSize: "10px", lineHeight: 1 }}>
                          {expandedFinding === i ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>
                    {expandedFinding === i && (
                      <div
                        style={{
                          background: "#04151A",
                          border: "1px solid #163E3C",
                          borderRadius: "0 0 8px 8px",
                          padding: "1rem 1.5rem",
                          marginTop: "-4px",
                          marginBottom: i < findings.length - 1 ? "8px" : "0",
                        }}
                      >
                        <div style={{ marginBottom: "12px" }}>
                          <div
                            style={{
                              fontFamily: "IBM Plex Mono, monospace",
                              fontSize: "10px",
                              color: "#325F57",
                              letterSpacing: "0.1em",
                              marginBottom: "6px",
                            }}
                          >
                            ▸ WHAT IS THIS?
                          </div>
                          <div style={{ fontFamily: "Outfit, sans-serif", fontSize: "13px", color: "#b8d4c8", lineHeight: 1.6 }}>{finding.what}</div>
                        </div>

                        <div style={{ marginBottom: "12px" }}>
                          <div
                            style={{
                              fontFamily: "IBM Plex Mono, monospace",
                              fontSize: "10px",
                              color: "#ff5f57",
                              letterSpacing: "0.1em",
                              marginBottom: "6px",
                            }}
                          >
                            ▸ WHY IT IS DANGEROUS
                          </div>
                          <div style={{ fontFamily: "Outfit, sans-serif", fontSize: "13px", color: "#b8d4c8", lineHeight: 1.6 }}>{finding.why}</div>
                        </div>

                        <div>
                          <div
                            style={{
                              fontFamily: "IBM Plex Mono, monospace",
                              fontSize: "10px",
                              color: "#28ca41",
                              letterSpacing: "0.1em",
                              marginBottom: "6px",
                            }}
                          >
                            ▸ HOW TO FIX IT
                          </div>
                          <div
                            style={{
                              background: "#092828",
                              border: "1px solid #163E3C",
                              borderRadius: "6px",
                              padding: "10px 14px",
                              fontFamily: "IBM Plex Mono, monospace",
                              fontSize: "12px",
                              color: "#28ca41",
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {finding.fix}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Dependency Graph */}
              <div
                style={{
                  background: "#092828",
                  border: "1px solid #163E3C",
                  borderRadius: "8px",
                  padding: "1rem",
                  marginTop: "12px",
                }}
              >
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: "11px",
                    color: "#ffffff",
                    borderBottom: "1px solid #163E3C",
                    paddingBottom: "8px",
                    marginBottom: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Dependency Graph</span>
                  <span style={{ color: "#b8d4c8" }}>89 modules · 12 circular deps detected</span>
                </div>
                <DependencyGraph />
              </div>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        @keyframes demoModalIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes demoBackdropIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </section>
  )
}

// ============================================================================
// SOCIAL PROOF BAR
// ============================================================================
function SocialProofBar() {
  const techs = [
    "Next.js",
    "React",
    "Node.js",
    "TypeScript",
    "Python",
    "Go",
    "Rust",
    "Express",
    "FastAPI",
    "Django",
  ]

  return (
    <section className="relative z-10 border-y border-[#163E3C] bg-[#092828] py-5">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-8 md:flex-row">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[#7ab8a4]">
          Trusted by developers building with
        </span>
        <div className="flex flex-wrap items-center gap-4">
          {techs.map((tech) => (
            <span
              key={tech}
              className="font-mono text-[12px] text-[#7ab8a4]"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// THE PROBLEM SECTION
// ============================================================================
function ProblemSection() {
  const stats = [
    { value: "158", label: "avg vulnerabilities per codebase" },
    { value: "73%", label: "devs lack time for manual audits" },
    { value: "60s", label: "StackSense scans your entire repo" },
  ]

  return (
    <section className="relative z-10 py-32">
      <div className="mx-auto max-w-7xl px-8">
        <div className="mx-auto max-w-[800px] text-center">
          {/* Section label */}
          <div className="mb-6 flex justify-center">
            <span className="inline-flex rounded-full border border-[rgba(94,180,154,0.4)] bg-[rgba(50,95,87,0.15)] px-3 py-1 font-mono text-[12px] text-[#5ca68a]">
              THE PROBLEM
            </span>
          </div>

          <h2 className="mx-auto max-w-[700px] text-center font-serif text-[clamp(36px,6vw,56px)] font-normal leading-[1.1] text-[#ffffff]">
            Most security issues are invisible until it&apos;s too late.
          </h2>

          <p className="mx-auto mt-4 max-w-[640px] text-center font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
            The average codebase contains 158 known vulnerabilities. 73% of
            developers say they don&apos;t have time to audit dependencies
            manually. Technical debt compounds silently. One overlooked CVE can
            bring down production. StackSense automates the entire security and
            quality audit — so your team can ship with confidence.
          </p>

          {/* Stats */}
          <div className="mt-12 flex flex-wrap justify-center gap-16">
            {stats.map((stat) => (
              <div key={stat.value} className="flex flex-col items-center">
                <span className="font-serif text-[56px] leading-none text-[#ffffff]">
                  {stat.value}
                </span>
                <span className="mt-2 max-w-[180px] text-center font-mono text-[11px] leading-relaxed text-[#7ab8a4]">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// AGENTS SECTION
// ============================================================================
function AgentsSection() {
  const agents = [
    {
      icon: (
        <svg
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#325F57"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      ),
      name: "Security Scanner",
      tag: "CVE Detection · Secret Scanning",
      desc: "Detects known CVEs from NVD and OSV databases, exposed API keys and secrets, insecure coding patterns, and SQL injection risks across every file in your repository.",
    },
    {
      icon: (
        <svg
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#325F57"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
      ),
      name: "Dependency Auditor",
      tag: "Outdated Packages · License Risks",
      desc: "Maps your entire dependency tree, flags packages with known vulnerabilities, identifies outdated versions with breaking changes, and detects license conflicts that could create legal exposure.",
    },
    {
      icon: (
        <svg
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#325F57"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
          />
        </svg>
      ),
      name: "Code Quality Inspector",
      tag: "Tech Debt · Anti-patterns · Complexity",
      desc: "Measures cyclomatic complexity, detects dead code and duplicate logic, identifies architectural anti-patterns, and generates a prioritized list of tech debt by severity and impact.",
    },
    {
      icon: (
        <svg
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#325F57"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
          />
        </svg>
      ),
      name: "AI Insight Engine",
      tag: "Plain English · Fix Suggestions · Scoring",
      desc: "Synthesizes findings from all three agents into a plain-English executive report with severity scores, estimated fix effort, code snippets showing exactly what to change, and an overall codebase health score.",
    },
  ]

  return (
    <section id="agents" className="relative z-10 scroll-mt-24 py-32">
      <div className="mx-auto max-w-7xl px-8">
        {/* Section label */}
        <div className="text-center">
          <span className="mb-6 inline-flex rounded-full border border-[rgba(94,180,154,0.4)] bg-[rgba(50,95,87,0.15)] px-3 py-1 font-mono text-[12px] text-[#5ca68a]">
            HOW IT WORKS
          </span>
        </div>

        <h2 className="mx-auto max-w-[600px] text-center font-serif text-[clamp(36px,6vw,56px)] font-normal leading-[1.1] text-[#ffffff]">
          Four agents. One scan. Complete picture.
        </h2>
        <p className="mx-auto mt-3 max-w-[560px] text-center font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
          Each agent runs in parallel, specializing in a different layer of your
          codebase.
        </p>

        {/* 2x2 Grid */}
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {agents.map((agent, i) => (
            <div
              key={agent.name}
              className="group cursor-default rounded-xl border border-[#163E3C] bg-[#092828] p-8 transition-all duration-300 hover:border-[#325F57] hover:bg-[rgba(50,95,87,0.05)]"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 rounded-lg border border-[#163E3C] bg-[#04151A] p-2">
                  {agent.icon}
                </div>
                <div>
                  <span className="font-mono text-[10px] text-[#7ab8a4]">
                    Agent 0{i + 1}
                  </span>
                  <h3 className="mt-1 font-serif text-[26px] text-[#ffffff]">
                    {agent.name}
                  </h3>
                  <span className="font-mono text-[11px] text-[#7ab8a4]">
                    {agent.tag}
                  </span>
                  <p className="mt-3 font-sans text-[15px] leading-[1.7] text-[#b8d4c8]">
                    {agent.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// HOW IT WORKS SECTION
// ============================================================================
function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      icon: (
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#325F57"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
          />
        </svg>
      ),
      title: "Connect GitHub",
      desc: "Authorize StackSense with read-only access. We request the minimum permissions required and never store your source code — only the analysis metadata.",
    },
    {
      num: "02",
      icon: (
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#325F57"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
          />
        </svg>
      ),
      title: "Select a Repository",
      desc: "Choose any public or private repository from your GitHub account. StackSense supports all languages and frameworks — Next.js, Python, Go, Rust, Java, and more.",
    },
    {
      num: "03",
      icon: (
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#325F57"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
      ),
      title: "Get Your Report",
      desc: "In under 60 seconds, receive a comprehensive health report with severity-ranked findings, fix suggestions written in plain English, and an interactive codebase dependency map.",
    },
  ]

  return (
    <section id="how-it-works" className="relative z-10 scroll-mt-24 py-32">
      <div className="mx-auto max-w-7xl px-8">
        {/* Section label */}
        <div className="text-center">
          <span className="mb-6 inline-flex rounded-full border border-[rgba(50,95,87,0.4)] bg-[rgba(50,95,87,0.15)] px-3 py-1 font-mono text-[12px] text-[#7ab8a4]">
            GET STARTED
          </span>
        </div>

        <h2 className="text-center font-serif text-[clamp(36px,6vw,56px)] font-normal leading-[1.1] text-[#ffffff]">
          From zero to insights in three steps.
        </h2>

        {/* Steps */}
        <div className="mt-12 grid gap-8 border-t border-[#163E3C] pt-12 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="relative">
              <span className="absolute -top-2 left-0 font-serif text-[80px] leading-none text-[#325F57] opacity-100">
                {step.num}
              </span>
              <div className="relative z-10 pt-16">
                <div className="mb-4 inline-flex rounded-lg border border-[#163E3C] bg-[#092828] p-2">
                  {step.icon}
                </div>
                <h3 className="font-serif text-[24px] text-[#ffffff]">
                  {step.title}
                </h3>
                <p className="mt-2 font-sans text-[15px] leading-[1.7] text-[#b8d4c8]">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// FEATURES GRID SECTION
// ============================================================================
function FeaturesSection() {
  return (
    <section id="features" className="relative z-10 scroll-mt-24 py-32">
      <div className="mx-auto max-w-7xl px-8">
        <h2 className="text-center font-serif text-[clamp(36px,6vw,52px)] font-normal leading-[1.1] text-[#ffffff]">
          Everything you need to ship secure code.
        </h2>

        {/* Bento Grid */}
        <div className="mt-10 grid gap-3 md:grid-cols-2">
          {/* Wide card */}
          <div className="rounded-xl border border-[#163E3C] bg-[#092828] p-8 md:col-span-2">
            <h3 className="font-serif text-[28px] text-[#ffffff]">
              Live Agent Streaming
            </h3>
            <p className="mt-2 max-w-[600px] font-sans text-[15px] leading-[1.7] text-[#b8d4c8]">
              Watch all four agents work in real time via server-sent events.
              See exactly which files are being analyzed, which vulnerabilities
              are found, and how your score changes — live.
            </p>
            {/* Fake terminal */}
            <div className="mt-6 overflow-hidden rounded-lg border border-[#163E3C] bg-[#04151A] p-4">
              <div className="space-y-2 font-mono text-[12px]">
                <div className="text-[#7ab8a4]">
                  <span className="text-[#325F57]">[Agent 01]</span> Scanning
                  /src/api/auth.ts...
                </div>
                <div className="text-[#7ab8a4]">
                  <span className="text-[#325F57]">[Agent 02]</span> Found 3
                  outdated dependencies in package.json
                </div>
                <div className="text-[#7ab8a4]">
                  <span className="text-[#325F57]">[Agent 03]</span> Cyclomatic
                  complexity: 12 in utils/parser.ts
                </div>
                <div className="text-[#7ab8a4]">
                  <span className="text-[#325F57]">[Agent 04]</span> Generating
                  executive summary...
                </div>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-[#163E3C] bg-[#092828] p-8">
            <h3 className="font-serif text-[24px] text-[#ffffff]">
              Interactive Codebase Map
            </h3>
            <p className="mt-2 font-sans text-[15px] leading-[1.7] text-[#b8d4c8]">
              D3.js force-directed graph of every file and dependency
              relationship. Zoom in, click nodes, and understand your
              architecture visually.
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-[#163E3C] bg-[#092828] p-8">
            <h3 className="font-serif text-[24px] text-[#ffffff]">
              Severity Scoring
            </h3>
            <p className="mt-2 font-sans text-[15px] leading-[1.7] text-[#b8d4c8]">
              Every finding is ranked by severity (Critical / High / Medium /
              Low) with CVSS scores where applicable. Know what to fix first.
            </p>
          </div>

          {/* Card 4 - Full width */}
          <div className="rounded-xl border border-[#163E3C] bg-[#092828] p-8 md:col-span-2">
            <h3 className="font-serif text-[28px] text-[#ffffff]">
              Plain English Fix Suggestions
            </h3>
            <p className="mt-2 max-w-[600px] font-sans text-[15px] leading-[1.7] text-[#b8d4c8]">
              No cryptic error codes. Every finding includes a human-readable
              explanation and copy-paste fix written by the AI Insight Engine.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// STATS BAR
// ============================================================================
function StatsBar() {
  const stats = [
    { value: "4", label: "AI agents running in parallel" },
    { value: "< 60s", label: "average full repo scan time" },
    { value: "158", label: "avg CVEs found per scan" },
    { value: "$0", label: "always free, no limits" },
  ]

  return (
    <section className="relative z-10 border-y border-[#163E3C] bg-[#092828] py-16">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-16 px-8">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <span className="font-serif text-[64px] leading-none text-[#ffffff]">
              {stat.value}
            </span>
            <p className="mt-2 font-mono text-[12px] text-[#7ab8a4]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================================================
// FINAL CTA SECTION
// ============================================================================
function FinalCTA({
  setShowDemo,
}: {
  setShowDemo: Dispatch<SetStateAction<boolean>>
}) {
  return (
    <section
      id="cta"
      className="relative z-10 overflow-hidden py-32"
    >
      {/* Subtle glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-[400px] w-[600px] rounded-full bg-[rgba(50,95,87,0.08)] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-8 text-center">
        <h2 className="font-serif text-[clamp(44px,8vw,72px)] font-normal leading-[1.0] text-[#ffffff]">
          Your codebase has been waiting.
        </h2>
        <p className="mt-2 font-serif text-[clamp(28px,5vw,40px)] italic text-[#325F57]">
          Find out what&apos;s hiding in yours.
        </p>
        <p className="mx-auto mt-4 max-w-[480px] font-sans text-[17px] leading-[1.8] text-[#b8d4c8]">
          Join developers who&apos;ve already scanned their repositories. Free
          forever. No credit card. No code changes required.
        </p>

        {/* Buttons */}
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-md bg-[#325F57] px-10 py-5 font-sans text-[16px] font-semibold text-[#04151A] transition-colors hover:bg-[#7ab8a4]"
          >
            Get Started Free &rarr;
          </Link>
          <button
            type="button"
            onClick={() => setShowDemo(true)}
            className="rounded-md border border-[#325F57] px-10 py-5 font-sans text-[16px] font-semibold text-[#7ab8a4] transition-colors hover:bg-[rgba(50,95,87,0.1)]"
          >
            Watch Demo
          </button>
        </div>

        {/* Micro */}
        <p className="mt-4 font-mono text-[11px] text-[rgba(111,148,135,0.6)]">
          No credit card · Read-only access · 60-second results
        </p>
      </div>
    </section>
  )
}

// ============================================================================
// FOOTER
// ============================================================================
const FOOTER_NAV = [
  { label: "Features", href: "/#features" },
  { label: "Agents", href: "/#agents" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const

function Footer() {
  return (
    <footer className="relative z-10 border-t border-[#163E3C] bg-[#092828] px-8 py-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-4">
            <MarketingLogoLink />
            <span className="font-mono text-[11px] text-[#7ab8a4]">
              AI-powered codebase intelligence
            </span>
          </div>

          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-6"
          >
            {FOOTER_NAV.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="font-sans text-[14px] text-[#7ab8a4] transition-colors hover:text-[#ffffff]"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-[#163E3C] pt-4 md:flex-row">
          <span className="font-mono text-[11px] text-[#7ab8a4]">
            &copy; 2026 StackSense
          </span>
          <span className="font-mono text-[11px] text-[#7ab8a4]">
            Made with Meta Llama · Groq API
          </span>
        </div>
      </div>
    </footer>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================
export default function Home() {
  const [showDemo, setShowDemo] = useState(false)

  return (
    <main className="relative min-h-screen bg-[#04151A]">
      <CanvasBackground />
      <MarketingNavbar />
      <StatusBar />
      <Hero showDemo={showDemo} setShowDemo={setShowDemo} />
      <SocialProofBar />
      <ProblemSection />
      <AgentsSection />
      <HowItWorksSection />
      <FeaturesSection />
      <StatsBar />
      <FinalCTA setShowDemo={setShowDemo} />
      <Footer />
    </main>
  )
}
