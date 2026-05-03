import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

type GroqOptions = { max_tokens?: number; temperature?: number };

async function groqChatCompletion(prompt: string, options?: GroqOptions): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: options?.max_tokens ?? 500,
      temperature: options?.temperature ?? 0.2,
    }),
  });
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || "{}";
}

function strTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Map model risk rows to dashboard RiskListItem (whatIsThis / whyDangerous / howToFix). */
function normalizeRiskRow(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const title = strTrim(r.title);
  const issue = strTrim(r.issue) || title;
  const whatIsThis =
    strTrim(r.whatIsThis) || strTrim(r.what_is_this) || issue || title;
  const whyDangerous =
    strTrim(r.whyDangerous) ||
    strTrim(r.whyItsDangerous) ||
    strTrim(r.why_its_dangerous);
  const howToFix =
    strTrim(r.howToFix) || strTrim(r.howToFixIt) || strTrim(r.how_to_fix_it);

  let score: number | string | undefined;
  if (typeof r.score === "number" && Number.isFinite(r.score)) score = r.score;
  else if (typeof r.score === "string" && r.score.trim()) {
    const n = Number(r.score);
    score = Number.isFinite(n) ? n : r.score.trim();
  }

  return {
    ...r,
    title,
    issue,
    file: strTrim(r.file) || "—",
    severity: typeof r.severity === "string" ? r.severity : "info",
    score,
    whatIsThis,
    whyDangerous,
    howToFix,
  };
}

function parseRiskPayload(text: string): { risks: Record<string, unknown>[]; summary: string } {
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed !== "object") {
    return { risks: [], summary: "Analysis complete" };
  }
  const o = parsed as Record<string, unknown>;
  const risksRaw = o.risks;
  const risks = Array.isArray(risksRaw)
    ? risksRaw.map(normalizeRiskRow)
    : [];
  const summary = typeof o.summary === "string" ? o.summary : "Analysis complete";
  return { risks, summary };
}

type AiInsightsShape = {
  summary: string;
  securityGrade: "A" | "B" | "C" | "D" | "F";
  criticalActions: { action: string; reason: string; effort: "Low" | "Medium" | "High" }[];
  recommendations: string[];
  estimatedFixTime: string;
};

const SECURITY_GRADES = new Set(["A", "B", "C", "D", "F"]);

function clampEffort(v: unknown): "Low" | "Medium" | "High" {
  const s = String(v || "").toLowerCase();
  if (s === "low") return "Low";
  if (s === "high") return "High";
  return "Medium";
}

function normalizeAiInsights(raw: unknown, fallback: AiInsightsShape): AiInsightsShape {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const summary =
    strTrim(o.summary) ||
    strTrim(o.executiveSummary) ||
    strTrim(o.executive_summary) ||
    fallback.summary;

  let securityGrade = strTrim(o.securityGrade || o.security_grade).toUpperCase();
  if (!SECURITY_GRADES.has(securityGrade)) securityGrade = fallback.securityGrade;

  const rawActions = o.criticalActions ?? o.critical_actions;
  let criticalActions = fallback.criticalActions;
  if (Array.isArray(rawActions)) {
    const mapped = rawActions
      .slice(0, 8)
      .map((item) => {
        if (!item || typeof item !== "object") {
          return { action: "", reason: "", effort: "Medium" as const };
        }
        const a = item as Record<string, unknown>;
        return {
          action: strTrim(a.action) || strTrim(a.title) || "",
          reason: strTrim(a.reason) || strTrim(a.rationale) || strTrim(a.why) || "",
          effort: clampEffort(a.effort),
        };
      })
      .filter((x) => x.action || x.reason);
    if (mapped.length > 0) criticalActions = mapped;
  }

  const recs = o.recommendations;
  const recommendations = Array.isArray(recs)
    ? recs.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 8)
    : fallback.recommendations;

  const estimatedFixTime =
    strTrim(o.estimatedFixTime) ||
    strTrim(o.estimated_fix_time) ||
    fallback.estimatedFixTime;

  return {
    summary,
    securityGrade: securityGrade as AiInsightsShape["securityGrade"],
    criticalActions,
    recommendations: recommendations.length > 0 ? recommendations : fallback.recommendations,
    estimatedFixTime,
  };
}

function heuristicAiInsightsFallback(params: {
  score: number;
  risks: Record<string, unknown>[];
  recommendations: string[];
}): AiInsightsShape {
  const { score, risks, recommendations } = params;
  const securityGrade: AiInsightsShape["securityGrade"] =
    score >= 85 ? "A" : score >= 72 ? "B" : score >= 58 ? "C" : score >= 42 ? "D" : "F";
  const summary = `Overall health score is ${score}/100 from the automated scan of mapped files, risk findings, and declared dependencies. ${
    risks.length > 0
      ? `${risks.length} issue(s) are listed under risk analysis and should be triaged.`
      : "No major risks were flagged in this pass; still validate against your security and compliance requirements."
  }`;
  const criticalActions = risks.slice(0, 5).map((r) => ({
    action: `Triage and remediate: ${strTrim(r.file) || "finding"}`,
    reason: strTrim(r.issue) || strTrim(r.title) || strTrim(r.whatIsThis) || "See the risk card for details.",
    effort: "Medium" as const,
  }));
  return {
    summary,
    securityGrade,
    criticalActions,
    recommendations: recommendations.slice(0, 5),
    estimatedFixTime:
      risks.length >= 5 ? "3–6 weeks" : risks.length >= 1 ? "1–3 weeks" : "< 1 week",
  };
}

/** Source files pulled from the repo tree for mapper/risk. Note: `*.cpp` also ends with `.c`, so `.c` is handled separately. */
function isAllowedSourceBlobPath(path: string | undefined): boolean {
  if (!path) return false;
  const p = path.toLowerCase();
  if (p.includes("node_modules")) return false;
  const extensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".go",
    ".rb",
    ".php",
    ".cpp",
    ".rs",
  ];
  if (extensions.some((ext) => p.endsWith(ext))) return true;
  return p.endsWith(".c") && !p.endsWith(".cpp");
}

/** Strip ```json fences often wrapping model output */
function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/i, "")
    .trim();
}

/**
 * Extract first balanced `{ ... }` object from text (handles nested braces and strings).
 * Greedy regex `\{[\s\S]*\}` often breaks on nested objects or multiple blocks.
 */
function extractBalancedJsonObject(text: string): string | null {
  const s = stripJsonFences(text);
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseJsonLoose(text: string): unknown | null {
  const balanced = extractBalancedJsonObject(text);
  if (balanced) {
    try {
      return JSON.parse(balanced);
    } catch {
      /* try fallbacks below */
    }
  }
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch {
    /* ignore */
  }
  return null;
}

function mapperBasename(p: string): string {
  const t = p.trim().replace(/\\/g, "/");
  const parts = t.split("/");
  return parts[parts.length - 1] || t;
}

type MapperNodeNorm = {
  id: string;
  risk: string;
  deps: number;
  name?: string;
  path?: string;
  size?: number;
};

type MapperEdgeNorm = { source: string; target: string };

function normalizeMapperNode(raw: unknown, knownPaths: string[]): MapperNodeNorm | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pathGuess =
    strTrim(r.path) || strTrim(r.id) || strTrim(r.file) || strTrim(r.name);
  if (!pathGuess) return null;

  const lowerPaths = new Map(knownPaths.map((p) => [p.toLowerCase(), p]));
  let id = lowerPaths.get(pathGuess.toLowerCase()) ?? null;
  if (!id) {
    const base = mapperBasename(pathGuess).toLowerCase();
    const matches = knownPaths.filter((p) => mapperBasename(p).toLowerCase() === base);
    if (matches.length === 1) id = matches[0];
  }
  if (!id && knownPaths.includes(pathGuess)) id = pathGuess;
  if (!id) {
    const suffix = pathGuess.replace(/^\.\//, "").toLowerCase();
    const bySuffix = knownPaths.find((p) => p.toLowerCase().endsWith(suffix) || suffix.endsWith(p.toLowerCase()));
    if (bySuffix) id = bySuffix;
  }
  if (!id) return null;

  const depsRaw = r.deps ?? r.degree ?? r.links;
  let deps = typeof depsRaw === "number" && Number.isFinite(depsRaw) ? Math.round(depsRaw) : Number(depsRaw);
  if (!Number.isFinite(deps)) deps = 0;
  deps = Math.min(50, Math.max(0, deps));

  let risk = strTrim(r.risk).toLowerCase();
  if (!["critical", "warning", "healthy"].includes(risk)) risk = "healthy";

  const name = strTrim(r.name) || mapperBasename(id);
  const sizeRaw = r.size;
  const size =
    typeof sizeRaw === "number" && Number.isFinite(sizeRaw)
      ? Math.round(sizeRaw)
      : Number.isFinite(Number(sizeRaw))
        ? Math.round(Number(sizeRaw))
        : undefined;

  return { id, risk, deps, name, path: id, ...(size !== undefined ? { size } : {}) };
}

function syntheticMapperFromPaths(paths: string[]): { nodes: MapperNodeNorm[]; edges: MapperEdgeNorm[] } {
  const nodes: MapperNodeNorm[] = paths.slice(0, 24).map((p) => ({
    id: p,
    risk: "healthy",
    deps: 0,
    name: mapperBasename(p),
    path: p,
    size: 0,
  }));
  const edges: MapperEdgeNorm[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ source: nodes[i].id, target: nodes[i + 1].id });
  }
  return { nodes, edges };
}

function normalizeMapperEdge(
  raw: unknown,
  idSet: Set<string>,
  basenameToId: Map<string, string>
): MapperEdgeNorm | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const s = strTrim(e.source) || strTrim(e.from);
  const t = strTrim(e.target) || strTrim(e.to);
  if (!s || !t) return null;

  const resolve = (x: string): string | null => {
    if (idSet.has(x)) return x;
    const b = mapperBasename(x).toLowerCase();
    if (basenameToId.has(b)) return basenameToId.get(b)!;
    const xl = x.toLowerCase();
    for (const id of idSet) {
      if (id.toLowerCase() === xl) return id;
      if (mapperBasename(id).toLowerCase() === b) return id;
      if (id.toLowerCase().endsWith(xl) || xl.endsWith(id.toLowerCase())) return id;
    }
    return null;
  };

  const rs = resolve(s);
  const rt = resolve(t);
  if (!rs || !rt || rs === rt) return null;
  return { source: rs, target: rt };
}

function buildMapperOutput(
  mapperText: string,
  knownPaths: string[],
  summaryFallback: string
): { nodes: MapperNodeNorm[]; edges: MapperEdgeNorm[]; summary: string } {
  const parsed = parseJsonLoose(mapperText);
  let summary = summaryFallback;
  let rawNodes: unknown[] = [];
  let rawEdges: unknown[] = [];

  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (typeof o.summary === "string" && o.summary.trim()) summary = o.summary.trim();
    if (Array.isArray(o.nodes)) rawNodes = o.nodes;
    else {
      const alt = o.node;
      if (Array.isArray(alt)) rawNodes = alt;
    }
    if (Array.isArray(o.edges)) rawEdges = o.edges;
    else {
      const links = o.links;
      if (Array.isArray(links)) rawEdges = links;
    }
  }

  const normalizedNodes = rawNodes
    .map((n) => normalizeMapperNode(n, knownPaths))
    .filter((x): x is MapperNodeNorm => x !== null);

  const uniqueById = new Map<string, MapperNodeNorm>();
  for (const n of normalizedNodes) {
    if (!uniqueById.has(n.id)) uniqueById.set(n.id, n);
  }
  let nodes = [...uniqueById.values()];

  const idSet = new Set(nodes.map((n) => n.id));
  const basenameToId = new Map<string, string>();
  for (const n of nodes) {
    basenameToId.set(mapperBasename(n.id).toLowerCase(), n.id);
  }

  const edgeSet = new Set<string>();
  const edges: MapperEdgeNorm[] = [];
  for (const e of rawEdges) {
    const ne = normalizeMapperEdge(e, idSet, basenameToId);
    if (!ne) continue;
    const key = `${ne.source}\0${ne.target}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push(ne);
  }

  if (nodes.length === 0 && knownPaths.length > 0) {
    const syn = syntheticMapperFromPaths(knownPaths);
    return {
      nodes: syn.nodes,
      edges: syn.edges,
      summary: `${summaryFallback} (Graph built from sampled paths — model returned no matching nodes.)`,
    };
  }

  return { nodes, edges, summary };
}

type PkgDepEntryNorm = { name: string; range: string; kind: string; fromPath: string };

function normalizeAuditorDep(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const name =
    strTrim(d.name) || strTrim(d.packageName) || strTrim(d.package) || strTrim(d.dependency);
  if (!name) return null;

  const version =
    strTrim(d.version) ||
    strTrim(d.currentVersion) ||
    strTrim(d.declaredRange) ||
    strTrim(d.range) ||
    "—";

  let status = strTrim(d.status).toLowerCase().replace(/-/g, "");
  if (status === "okay") status = "ok";
  if (!["vulnerable", "outdated", "ok"].includes(status)) {
    const sev = strTrim(d.severity).toLowerCase();
    if (sev === "critical" || sev === "warning") status = "vulnerable";
    else status = "ok";
  }

  const issue =
    strTrim(d.issue) ||
    strTrim(d.description) ||
    strTrim(d.detail) ||
    strTrim(d.notes) ||
    (status === "ok"
      ? "No specific issue flagged; keep versions pinned and monitor advisories."
      : "Review for known CVEs, outdated releases, and supply-chain risk.");

  return { name, version, status, issue };
}

function finalizeAuditDependencies(
  auditText: string,
  manifestEntries: PkgDepEntryNorm[]
): { dependencies: Record<string, unknown>[]; summary: string } {
  const auditParsed = parseJsonLoose(auditText);
  let summary = "Audit complete";
  let depsRaw: unknown[] = [];

  if (auditParsed && typeof auditParsed === "object") {
    const ao = auditParsed as Record<string, unknown>;
    if (typeof ao.summary === "string" && ao.summary.trim()) summary = ao.summary.trim();
    if (Array.isArray(ao.dependencies)) depsRaw = ao.dependencies;
  }

  const normalized = depsRaw
    .map(normalizeAuditorDep)
    .filter((x): x is Record<string, unknown> => x !== null);

  if (normalized.length === 0 && manifestEntries.length > 0) {
    const fallback = manifestEntries.slice(0, 80).map((e) => ({
      name: e.name,
      version: e.range,
      status: "ok",
      issue: `Declared in ${e.kind} in ${e.fromPath}. No LLM audit row returned; verify with npm audit / OSV.`,
    }));
    return {
      dependencies: fallback,
      summary: `${summary} Showing ${fallback.length} declared package(s) from package.json.`,
    };
  }

  return { dependencies: normalized, summary };
}

type ScorerShape = {
  score: number;
  coupling: number;
  coverage: number;
  dependencies: number;
  deadCode: number;
  recommendations: string[];
};

function clampPct(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(100, Math.max(0, Math.round(x)));
}

function normalizeScorerPayload(raw: unknown, fallback: ScorerShape): ScorerShape {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const recs = o.recommendations;
  const recommendations = Array.isArray(recs)
    ? recs.filter((x): x is string => typeof x === "string").slice(0, 12)
    : fallback.recommendations;

  return {
    score: clampPct(o.score, fallback.score),
    coupling: clampPct(o.coupling, fallback.coupling),
    coverage: clampPct(o.coverage, fallback.coverage),
    dependencies: clampPct(o.dependencies, fallback.dependencies),
    deadCode: clampPct(o.deadCode, fallback.deadCode),
    recommendations:
      recommendations.length > 0 ? recommendations : fallback.recommendations,
  };
}

function heuristicScorerFallback(params: {
  filesMapped: number;
  risksCount: number;
  depsCount: number;
}): ScorerShape {
  const { filesMapped, risksCount, depsCount } = params;
  const riskPenalty = Math.min(45, risksCount * 6);
  const couplingHint = Math.max(15, 100 - Math.min(80, filesMapped * 3));
  const score = Math.max(
    18,
    Math.min(100, Math.round(88 - riskPenalty - Math.min(15, depsCount)))
  );
  return {
    score,
    coupling: clampPct(couplingHint, 50),
    coverage: clampPct(55 + Math.min(30, filesMapped * 2), 55),
    dependencies: clampPct(72 - Math.min(40, depsCount * 2), 55),
    deadCode: clampPct(70 - Math.min(25, risksCount * 3), 60),
    recommendations: [
      risksCount > 0
        ? `Address ${risksCount} reported risk(s), prioritizing critical items.`
        : "Maintain current structure — no major risks reported.",
      depsCount > 12
        ? "Review dependency surface area and consolidate where possible."
        : "Keep dependencies updated from package manifests.",
      "Add or extend automated tests for critical paths.",
    ],
  };
}

export async function POST(req: Request) {
  const { repoUrl } = await req.json();

  // Parse GitHub URL
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    return Response.json({ error: "Invalid GitHub URL" }, { status: 400 });
  }

  const [, owner, repo] = match;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // ── AGENT 1: MAPPER ──────────────────────────────
        send({ agent: "mapper", status: "running", msg: "Reading repository files..." });

        const { data: tree } = await octokit.git.getTree({
          owner,
          repo,
          tree_sha: "HEAD",
          recursive: "true",
        });

        const files = tree.tree
          .filter((f) => f.type === "blob" && isAllowedSourceBlobPath(f.path))
          .slice(0, 30);

        const fileContents: { path: string; content: string }[] = [];
        
        for (const file of files.slice(0, 15)) {
          try {
            const { data: blob } = await octokit.repos.getContent({
              owner,
              repo,
              path: file.path!,
            });
            if ("content" in blob) {
              const content = Buffer.from(blob.content, "base64").toString("utf-8");
              fileContents.push({ path: file.path!, content: content.slice(0, 500) });
            }
          } catch {}
        }

        const mapperKnownPaths = fileContents.map((f) => f.path);
        const mapperPrompt = `You are a codebase mapper. Build a file-level dependency graph. Return ONLY valid JSON (no markdown, no code fences).

Input files (use these exact "path" strings for every node id and for edge source/target):
${JSON.stringify(
          fileContents.map((f) => ({
            path: f.path,
            name: mapperBasename(f.path),
            size: f.content.length,
          }))
        )}

Rules:
- Every node "id" and every edge "source"/"target" MUST be copied exactly from a "path" in the input (full repo path).
- Infer plausible links between files (same feature folder, likely imports, shared prefixes). Omit edges if unsure; do not invent paths.

Return this exact JSON shape:
{
  "nodes": [
    {
      "id": "<exact path from input>",
      "name": "<basename>",
      "path": "<same as id>",
      "size": <number, use input size as scale or 0>,
      "risk": "critical|warning|healthy",
      "deps": <0-20 approximate out-degree for visualization>
    }
  ],
  "edges": [ { "source": "<path>", "target": "<path>" } ],
  "summary": "brief summary"
}`;

        const mapperText = await groqChatCompletion(mapperPrompt, { max_tokens: 1536 });
        const mapperBuilt = buildMapperOutput(
          mapperText,
          mapperKnownPaths,
          `Mapped ${files.length} files`
        );
        const mapperData = {
          nodes: mapperBuilt.nodes,
          edges: mapperBuilt.edges,
          summary: mapperBuilt.summary,
        };

        send({ agent: "mapper", status: "done", data: mapperData, msg: `Mapped ${files.length} files successfully` });

        // ── Fetch package.json for Auditor ─────────────────
        const packageJsonBlobPaths = tree.tree
          .filter(
            (f) =>
              f.type === "blob" &&
              f.path &&
              !f.path.includes("node_modules") &&
              (f.path === "package.json" || f.path.endsWith("/package.json"))
          )
          .map((f) => f.path!)
          .sort((a, b) => {
            if (a === "package.json") return -1;
            if (b === "package.json") return 1;
            return a.split("/").length - b.split("/").length;
          });

        type PkgDepEntry = { name: string; range: string; kind: string; fromPath: string };
        const auditorPackageJsonPaths: string[] = [];
        const auditorDependencyEntries: PkgDepEntry[] = [];
        const auditorPackageJsonSnippets: { path: string; preview: string }[] = [];
        const seenDepNames = new Set<string>();

        const recordDeps = (
          rec: Record<string, string> | undefined,
          kind: string,
          pkgPath: string
        ) => {
          if (!rec) return;
          for (const [name, range] of Object.entries(rec)) {
            if (typeof range !== "string" || seenDepNames.has(name)) continue;
            seenDepNames.add(name);
            auditorDependencyEntries.push({ name, range, kind, fromPath: pkgPath });
          }
        };

        for (const pkgPath of packageJsonBlobPaths.slice(0, 6)) {
          try {
            const { data: blob } = await octokit.repos.getContent({
              owner,
              repo,
              path: pkgPath,
            });
            if (!("content" in blob)) continue;

            const raw = Buffer.from(blob.content, "base64").toString("utf-8");
            const pkg = JSON.parse(raw) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
              peerDependencies?: Record<string, string>;
              optionalDependencies?: Record<string, string>;
            };

            auditorPackageJsonPaths.push(pkgPath);
            auditorPackageJsonSnippets.push({ path: pkgPath, preview: raw.slice(0, 4000) });
            recordDeps(pkg.dependencies, "dependencies", pkgPath);
            recordDeps(pkg.devDependencies, "devDependencies", pkgPath);
            recordDeps(pkg.peerDependencies, "peerDependencies", pkgPath);
            recordDeps(pkg.optionalDependencies, "optionalDependencies", pkgPath);
          } catch {
            /* invalid JSON or fetch error — skip */
          }
        }

        // ── AGENT 2 & 3: PARALLEL ────────────────────────
        send({ agent: "risk", status: "running", msg: "Analyzing risks and dependencies..." });
        send({
          agent: "auditor",
          status: "running",
          msg:
            auditorPackageJsonPaths.length > 0
              ? `Loaded ${auditorPackageJsonPaths.length} package.json file(s): ${auditorPackageJsonPaths.join(", ")}`
              : "No package.json in tree — inferring dependencies from codebase files...",
        });

        const riskPrompt = `You are a risk detector. Analyze this codebase for issues. Return ONLY valid JSON (no markdown, no code fences).
Files analyzed: ${JSON.stringify(fileContents.map(f => ({ path: f.path, preview: f.content.slice(0, 200) })))}

Return this exact JSON shape. Every object in "risks" MUST include all of these keys: title, file, score, severity, whatIsThis, whyItsDangerous, howToFixIt.
- title: short label for the finding
- file: affected path or filename from the data above
- score: number 0-100 (severity weight)
- severity: one of critical | warning | info
- whatIsThis: plain-language explanation of the issue
- whyItsDangerous: why it matters for security/maintainability/reliability
- howToFixIt: concrete remediation steps

{
  "risks": [
    {
      "title": "string",
      "file": "string",
      "score": 85,
      "severity": "critical|warning|info",
      "whatIsThis": "string",
      "whyItsDangerous": "string",
      "howToFixIt": "string"
    }
  ],
  "summary": "brief summary"
}`;

        const auditorPrompt = `You are a dependency auditor for a GitHub repository.

PRIMARY SOURCE (use this when provided): Declared npm dependencies fetched from actual package.json file(s) in the repo Git tree — not guesses from source paths alone.

Package.json blob paths fetched from repo (excluding node_modules):
${JSON.stringify(auditorPackageJsonPaths.length ? auditorPackageJsonPaths : ["(none found)"])}

Declared dependency entries (deduplicated by package name — first occurrence wins when multiple package.json files exist). Fields: name, semver range declared in manifest, dependency kind (dependencies / devDependencies / etc.), originating package.json path:
${JSON.stringify(auditorDependencyEntries.slice(0, 200))}

Truncated raw package.json excerpts for context:
${JSON.stringify(auditorPackageJsonSnippets)}

Code file paths sampled from the codebase (secondary context):
${JSON.stringify(fileContents.map((f) => f.path))}

Instructions:
1. Prefer analyzing the real manifests above. Reference package names and version ranges exactly as declared.
2. If no package.json was found, infer dependencies cautiously from file paths only and note that in the summary.
3. Assess whether entries look outdated, loosely specified, or plausibly vulnerable from general ecosystem knowledge — return conservative severity unless clearly critical.

Return ONLY valid JSON:
{
  "dependencies": [
    {
      "name": "package",
      "version": "exact semver range from manifest or best inference",
      "status": "vulnerable|outdated|ok",
      "issue": "one or two sentences: what is wrong or why it is ok"
    }
  ],
  "summary": "brief summary referencing whether package.json was used"
}

Each dependency object MUST include all four keys: name, version, status, issue. Use status "ok" with a short positive issue line when no problem is found.`;

        const [riskText, auditText] = await Promise.all([
          groqChatCompletion(riskPrompt, { max_tokens: 2048 }),
          groqChatCompletion(auditorPrompt, { max_tokens: 1536 }),
        ]);

        const riskData = parseRiskPayload(riskText);
        const auditData = finalizeAuditDependencies(auditText, auditorDependencyEntries);

        send({ agent: "risk", status: "done", data: riskData, msg: `Found ${riskData.risks?.length || 0} issues` });
        send({ agent: "auditor", status: "done", data: auditData, msg: `Scanned ${auditData.dependencies?.length || 0} dependencies` });

        // ── AGENT 4: SCORER ──────────────────────────────
        send({ agent: "scorer", status: "running", msg: "Calculating health score..." });

        const scorerNodes = Array.isArray(mapperData.nodes) ? mapperData.nodes : [];
        const scorerRisks = Array.isArray(riskData.risks) ? riskData.risks : [];
        const scorerDeps = Array.isArray(auditData.dependencies) ? auditData.dependencies : [];
        const filesMappedCount = scorerNodes.length || files.length;

        const scorerPrompt = `Analyze this codebase health data and return ONLY a JSON object. No markdown, no explanation.
Just raw JSON.

Data:
- Files mapped: ${filesMappedCount}
- Risks found: ${scorerRisks.length}
- Risk details: ${JSON.stringify(scorerRisks.slice(0, 50))}
- Dependencies: ${scorerDeps.length}

Each numeric field must be an integer from 0 through 100. recommendations must be exactly 3 short strings. Output raw JSON only — no angle brackets in the final answer.

Return exactly this JSON shape:
{
  "score": <number 0-100>,
  "coupling": <number 0-100>,
  "coverage": <number 0-100>,
  "dependencies": <number 0-100>,
  "deadCode": <number 0-100>,
  "recommendations": ["rec1", "rec2", "rec3"]
}`;

        const scorerRawText = await groqChatCompletion(scorerPrompt, { max_tokens: 768 });

        console.log("[scorer] raw model response:\n", scorerRawText);

        const fallback = heuristicScorerFallback({
          filesMapped: filesMappedCount,
          risksCount: scorerRisks.length,
          depsCount: scorerDeps.length,
        });

        const parsed = parseJsonLoose(scorerRawText);
        if (parsed === null) {
          console.warn("[scorer] Could not parse JSON from response; using heuristic fallback.");
        }
        const scorerData = normalizeScorerPayload(parsed, fallback);

        const insightsFallback = heuristicAiInsightsFallback({
          score: scorerData.score,
          risks: riskData.risks,
          recommendations: scorerData.recommendations,
        });

        const insightsPrompt = `You are an executive insights agent for a software codebase health report. Return ONLY valid JSON — no markdown, no code fences.

Repository analysis snapshot:
- Health score (0-100): ${scorerData.score}
- Coupling: ${scorerData.coupling}; Coverage: ${scorerData.coverage}; Dependency hygiene: ${scorerData.dependencies}; Dead code proxy: ${scorerData.deadCode}
- Recommendations: ${JSON.stringify(scorerData.recommendations)}
- Risk findings (abbreviated): ${JSON.stringify(
          riskData.risks.slice(0, 12).map((x) => ({
            file: x.file,
            severity: x.severity,
            title: x.title,
            issue: x.issue,
          }))
        )}
- Dependency entries: ${scorerDeps.length}; sample: ${JSON.stringify(scorerDeps.slice(0, 10))}

Return exactly this JSON shape (all top-level keys required):
{
  "executiveSummary": "2-4 sentences for engineering leadership",
  "securityGrade": "A",
  "criticalActions": [
    { "action": "short imperative", "reason": "one sentence why it matters", "effort": "Low" }
  ],
  "recommendations": ["up to 5 concise bullets — may align with or extend the recommendations above"],
  "estimatedFixTime": "e.g. 2-4 weeks"
}

Rules:
- securityGrade must be exactly one of: A, B, C, D, F (uppercase single letter).
- criticalActions: 3 to 5 objects; effort must be exactly Low, Medium, or High.
- Be specific; reference risks or dependencies when relevant.`;

        const insightsRawText = await groqChatCompletion(insightsPrompt, { max_tokens: 1024 });
        const insightsParsed = parseJsonLoose(insightsRawText);
        if (insightsParsed === null) {
          console.warn("[insights] Could not parse JSON from Groq response; using heuristic aiInsights.");
        }
        const aiInsights = normalizeAiInsights(insightsParsed, insightsFallback);

        const scorerPayload = { ...scorerData, aiInsights };

        send({
          agent: "scorer",
          status: "done",
          data: scorerPayload,
          msg: `Health score: ${scorerData.score}/100`,
        });
        send({ agent: "complete", status: "done", msg: "Analysis complete!" });

      } catch (error: any) {
        send({ agent: "error", status: "error", msg: error.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}