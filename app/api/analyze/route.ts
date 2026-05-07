import { Octokit } from "@octokit/rest";

import { parseValidatedGitHubRepositoryUrl } from "@/lib/github-url";
import {
  isDependencyManifestPath,
  parseManifestByPath,
  type ManifestDepEntry,
} from "@/lib/manifest-parsers";

function createGithubClient(): Octokit {
  const auth = process.env.GITHUB_TOKEN?.trim();
  return auth ? new Octokit({ auth }) : new Octokit();
}

function requireGroqConfigured(): string | null {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return "Set GROQ_API_KEY in your environment (e.g. .env.local for local development).";
  return null;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const MAX_GRAPH_PATHS = 220;
const MAX_BLOB_CONTENT_FETCHES = 72;
const MAX_MANIFEST_PATHS_FETCH = 42;

const EXCLUDED_PATH_SEGMENTS = new Set([
  "node_modules",
  "vendor",
  ".git",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
  "build",
  "target",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  "pods",
  "deriveddata",
]);

function shouldExcludeRepoPath(path: string): boolean {
  const norm = path.replace(/\\/g, "/").toLowerCase();
  const segments = norm.split("/");
  for (const seg of segments) {
    if (EXCLUDED_PATH_SEGMENTS.has(seg)) return true;
  }
  return false;
}

function mapperBasename(p: string): string {
  const t = p.trim().replace(/\\/g, "/");
  const parts = t.split("/");
  return parts[parts.length - 1] || t;
}

function languageBucketForPath(path: string): string {
  const pl = path.replace(/\\/g, "/").toLowerCase();
  const base = mapperBasename(pl);
  if (pl.includes(".github/workflows/") && (base.endsWith(".yml") || base.endsWith(".yaml")))
    return "workflow";
  if (base === "dockerfile" || pl.endsWith("/dockerfile")) return "docker";
  if (
    pl.endsWith("docker-compose.yml") ||
    pl.endsWith("docker-compose.yaml")
  )
    return "docker";
  if (
    pl.endsWith(".ts") ||
    pl.endsWith(".tsx") ||
    pl.endsWith(".js") ||
    pl.endsWith(".jsx") ||
    pl.endsWith(".mjs") ||
    pl.endsWith(".cjs")
  )
    return "js";
  if (pl.endsWith(".py")) return "py";
  if (pl.endsWith(".java")) return "java";
  if (pl.endsWith(".go")) return "go";
  if (pl.endsWith(".rs")) return "rust";
  if (pl.endsWith(".rb")) return "ruby";
  if (pl.endsWith(".php")) return "php";
  if (pl.endsWith(".swift")) return "swift";
  if (pl.endsWith(".kt") || pl.endsWith(".kts")) return "kotlin";
  if (pl.endsWith(".sh") || pl.endsWith(".bash")) return "shell";
  if (pl.endsWith(".cpp") || pl.endsWith(".cc") || pl.endsWith(".cxx") || pl.endsWith(".hpp"))
    return "cpp";
  if (pl.endsWith(".c") || pl.endsWith(".h")) return "c";
  if (pl.endsWith(".yaml") || pl.endsWith(".yml") || pl.endsWith(".toml") || pl.endsWith(".ini"))
    return "config";
  if (base.startsWith(".env")) return "env";
  return "other";
}

function manifestPriority(path: string): number {
  const b = mapperBasename(path).toLowerCase();
  const order = [
    "package.json",
    "cargo.toml",
    "go.mod",
    "requirements.txt",
    "pipfile",
    "pyproject.toml",
    "gemfile",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
  ];
  const i = order.indexOf(b);
  if (i >= 0) return i;
  if (path.replace(/\\/g, "/").includes(".github/workflows/")) return order.length;
  return 100;
}

/** All source/config blobs we analyze (full tree walk; no extension cap). */
function isAnalyzableBlobPath(path: string | undefined): boolean {
  if (!path || shouldExcludeRepoPath(path)) return false;
  const pl = path.replace(/\\/g, "/");
  const lower = pl.toLowerCase();
  const base = mapperBasename(lower);

  if (base === "dockerfile" || lower.endsWith("/dockerfile")) return true;
  if (lower.endsWith("docker-compose.yml") || lower.endsWith("docker-compose.yaml")) return true;
  if (
    base === "requirements.txt" ||
    base === "pipfile" ||
    base === "pyproject.toml" ||
    base === "cargo.toml" ||
    base === "go.mod" ||
    base === "gemfile" ||
    base === "composer.json" ||
    base === "pom.xml" ||
    base === "build.gradle" ||
    base === "build.gradle.kts"
  )
    return true;
  if (base === "package.json" || lower.endsWith("/package.json")) return true;
  if (lower.includes(".github/workflows/") && (base.endsWith(".yml") || base.endsWith(".yaml")))
    return true;
  if (base.startsWith(".env")) return true;

  const suffixes = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".java",
    ".go",
    ".rb",
    ".php",
    ".rs",
    ".swift",
    ".kt",
    ".kts",
    ".cpp",
    ".cc",
    ".cxx",
    ".hpp",
    ".h",
    ".sh",
    ".bash",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".c",
  ];
  if (suffixes.some((s) => lower.endsWith(s))) return true;

  return false;
}

function diversePathSample(allPaths: string[], max: number): string[] {
  if (allPaths.length <= max) return [...allPaths];

  const manifestPaths = allPaths.filter(isDependencyManifestPath);
  const chosen = new Set<string>();
  const sortedManifests = [...manifestPaths].sort(
    (a, b) => manifestPriority(a) - manifestPriority(b) || a.localeCompare(b)
  );
  for (const p of sortedManifests) {
    if (chosen.size >= max) break;
    chosen.add(p);
  }

  const buckets = new Map<string, string[]>();
  for (const p of allPaths) {
    if (chosen.has(p)) continue;
    const bucket = languageBucketForPath(p);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(p);
  }
  const keys = [...buckets.keys()].sort();

  for (;;) {
    let added = false;
    for (const k of keys) {
      const arr = buckets.get(k);
      if (!arr || arr.length === 0) continue;
      chosen.add(arr.shift()!);
      added = true;
      if (chosen.size >= max) break;
    }
    if (!added || chosen.size >= max) break;
  }

  return [...chosen];
}

function buildContentFetchOrder(graphPaths: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const manifests = graphPaths
    .filter(isDependencyManifestPath)
    .sort((a, b) => manifestPriority(a) - manifestPriority(b) || a.localeCompare(b));
  for (const p of manifests) {
    if (out.length >= max) break;
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (const p of graphPaths) {
    if (out.length >= max) break;
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

type GroqOptions = { max_tokens?: number; temperature?: number };

/**
 * Credentials and endpoint are read only from env (typically `.env.local` in dev).
 * See: GROQ_API_KEY (required), GROQ_CHAT_COMPLETIONS_URL, GROQ_MODEL.
 */
async function groqChatCompletion(prompt: string, options?: GroqOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }
  const url =
    process.env.GROQ_CHAT_COMPLETIONS_URL?.trim() ||
    "https://api.groq.com/openai/v1/chat/completions";
  const model =
    process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: options?.max_tokens ?? 500,
        temperature: options?.temperature ?? 0.2,
      }),
    });
  } catch (cause) {
    throw new Error(`Groq network error: ${stringifyError(cause)}`);
  }

  const rawText = await response.text().catch(() => "");

  try {
    const data = JSON.parse(rawText) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      const groqDetail = data?.error?.message || rawText.slice(0, 400);
      throw new Error(
        `Groq API returned ${response.status}${groqDetail ? `: ${groqDetail}` : ""}`
      );
    }
    return data.choices?.[0]?.message?.content || "{}";
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Groq API returned")) throw e;
    throw new Error(
      `Groq API returned unreadable JSON (HTTP ${response.status}): ${rawText.slice(0, 280)}`
    );
  }
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
  const nodes = [...uniqueById.values()];

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
      summary: `${summary} Showing ${fallback.length} declared package(s) from detected manifests (npm, pip, cargo, Go, Maven/Gradle, Composer, RubyGems, Docker, Actions, etc.).`,
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
        : "Keep dependencies updated across all declared manifests.",
      "Add or extend automated tests for critical paths.",
    ],
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body", detail: "The request body must be valid JSON with a repoUrl field." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request body", detail: "Expected a JSON object." }, { status: 400 });
  }

  const repoUrlRaw = (body as Record<string, unknown>).repoUrl;
  const parsedRepo = parseValidatedGitHubRepositoryUrl(repoUrlRaw);
  if (!parsedRepo) {
    return Response.json(
      {
        error: "Invalid GitHub repository URL",
        detail:
          'Provide an HTTPS repository URL such as https://github.com/<owner>/<repo>, or SSH git@github.com:owner/repo.git',
      },
      { status: 400 }
    );
  }

  const groqMissing = requireGroqConfigured();
  if (groqMissing) {
    return Response.json(
      { error: "Server configuration incomplete", detail: groqMissing },
      { status: 503 }
    );
  }

  const { owner, repo } = parsedRepo;
  const octokit = createGithubClient();
  const encoder = new TextEncoder();

  try {
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

        let tree: Awaited<ReturnType<Octokit["git"]["getTree"]>>["data"];
        try {
          const res = await octokit.git.getTree({
            owner,
            repo,
            tree_sha: "HEAD",
            recursive: "true",
          });
          tree = res.data;
        } catch (e) {
          throw new Error(`Could not fetch repository tree for ${parsedRepo.displayUrl}: ${stringifyError(e)}`);
        }

        const allAnalyzablePaths = tree.tree
          .filter((f) => f.type === "blob" && isAnalyzableBlobPath(f.path))
          .map((f) => f.path!)
          .sort((a, b) => a.localeCompare(b));

        const graphPaths = diversePathSample(allAnalyzablePaths, MAX_GRAPH_PATHS);
        const fetchTargets = buildContentFetchOrder(graphPaths, MAX_BLOB_CONTENT_FETCHES);

        const fileContents: { path: string; content: string }[] = [];
        const contentByPath = new Map<string, string>();

        for (const filePath of fetchTargets) {
          try {
            const { data: blob } = await octokit.repos.getContent({
              owner,
              repo,
              path: filePath,
            });
            if ("content" in blob) {
              const content = Buffer.from(blob.content, "base64").toString("utf-8");
              const slice = content.slice(0, 800);
              fileContents.push({ path: filePath, content: slice });
              contentByPath.set(filePath, slice);
            }
          } catch {
            /* skip missing/binary */
          }
        }

        const mapperInputFiles = graphPaths.map((path) => ({
          path,
          name: mapperBasename(path),
          size: contentByPath.get(path)?.length ?? path.length,
          previewHint: (contentByPath.get(path) ?? "").slice(0, 140),
        }));

        const mapperKnownPaths = graphPaths;
        const mapperPrompt = `You are a multi-language codebase architecture agent. Build a file-level dependency/module graph across any mix of: JavaScript/TypeScript, Python, Java, Go, Rust, Ruby, PHP, C/C++, Swift, Kotlin, shell, Docker, GitHub Actions, and config (.env, YAML, TOML, INI).

Infer edges using language-appropriate relationships: ES import/require, Python import/from, Java import/package, Go import, Rust mod/use, Ruby require/load, PHP include/use/require, C/C++ #include, Swift/Kotlin imports, Dockerfile COPY/FROM, docker-compose services, workflow needs/uses, etc.

Return ONLY valid JSON (no markdown, no code fences).

Input files (every "path" is a real repo path — use these exact strings for node ids and edge endpoints):
${JSON.stringify(mapperInputFiles)}

Rules:
- Every node "id" and every edge "source"/"target" MUST match a "path" from the input list exactly.
- Use folder structure, naming, and previewHint text to infer likely links. Do not invent paths outside the list.

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
  "summary": "brief multi-language summary"
}`;

        const mapperText = await groqChatCompletion(mapperPrompt, { max_tokens: 1536 });
        const mapperBuilt = buildMapperOutput(
          mapperText,
          mapperKnownPaths,
          `Mapped ${graphPaths.length} of ${allAnalyzablePaths.length} analyzable files`
        );
        const mapperData = {
          nodes: mapperBuilt.nodes,
          edges: mapperBuilt.edges,
          summary: mapperBuilt.summary,
          stats: {
            repoFilesMatched: allAnalyzablePaths.length,
            graphPathsUsed: graphPaths.length,
            filesContentSampled: fileContents.length,
          },
        };

        send({
          agent: "mapper",
          status: "done",
          data: mapperData,
          msg: `Mapped ${graphPaths.length} of ${allAnalyzablePaths.length} analyzable files`,
        });

        type PkgDepEntry = ManifestDepEntry;
        const auditorPackageJsonPaths: string[] = [];
        const auditorDependencyEntries: PkgDepEntry[] = [];
        const auditorManifestSnippets: { path: string; preview: string }[] = [];
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

        const auditorManifestPaths = [...new Set(allAnalyzablePaths.filter(isDependencyManifestPath))].sort(
          (a, b) => manifestPriority(a) - manifestPriority(b) || a.localeCompare(b)
        );

        for (const manifestPath of auditorManifestPaths.slice(0, MAX_MANIFEST_PATHS_FETCH)) {
          try {
            const { data: blob } = await octokit.repos.getContent({
              owner,
              repo,
              path: manifestPath,
            });
            if (!("content" in blob)) continue;
            const raw = Buffer.from(blob.content, "base64").toString("utf-8");
            const base = mapperBasename(manifestPath).toLowerCase();

            if (base === "package.json") {
              try {
                const pkg = JSON.parse(raw) as {
                  dependencies?: Record<string, string>;
                  devDependencies?: Record<string, string>;
                  peerDependencies?: Record<string, string>;
                  optionalDependencies?: Record<string, string>;
                };
                auditorPackageJsonPaths.push(manifestPath);
                auditorManifestSnippets.push({ path: manifestPath, preview: raw.slice(0, 4000) });
                recordDeps(pkg.dependencies, "dependencies", manifestPath);
                recordDeps(pkg.devDependencies, "devDependencies", manifestPath);
                recordDeps(pkg.peerDependencies, "peerDependencies", manifestPath);
                recordDeps(pkg.optionalDependencies, "optionalDependencies", manifestPath);
              } catch {
                auditorManifestSnippets.push({ path: manifestPath, preview: raw.slice(0, 2000) });
              }
              continue;
            }

            auditorManifestSnippets.push({ path: manifestPath, preview: raw.slice(0, 4000) });
            for (const e of parseManifestByPath(manifestPath, raw)) {
              if (seenDepNames.has(e.name)) continue;
              seenDepNames.add(e.name);
              auditorDependencyEntries.push(e);
            }
          } catch {
            /* skip */
          }
        }

        const manifestSummary =
          auditorManifestPaths.length > 0
            ? `Loaded ${auditorManifestPaths.length} dependency manifest(s): ${auditorManifestPaths.slice(0, 12).join(", ")}${auditorManifestPaths.length > 12 ? "…" : ""}`
            : "No dependency manifests detected — inferring from file paths only.";

        // ── AGENT 2 & 3: PARALLEL ────────────────────────
        send({ agent: "risk", status: "running", msg: "Analyzing risks and dependencies..." });
        send({
          agent: "auditor",
          status: "running",
          msg: manifestSummary,
        });

        const riskFilesForModel = fileContents.slice(0, 48).map((f) => ({
          path: f.path,
          preview: f.content.slice(0, 220),
        }));

        const riskPrompt = `You are a security and code-quality risk detector for a MULTI-LANGUAGE repository. Analyze the file previews below.

Cover language-specific issues when relevant:
- JS/TS: dangerous eval, hardcoded secrets, prototype pollution patterns, missing input validation.
- Python: shell=True subprocess, pickle on untrusted data, DEBUG=True, weak crypto, SQL string formatting.
- Java: unsafe deserialization, JNDI, weak TLS, native command execution.
- Go: ignoring errors, weak rand, command injection via exec.
- Rust: unsafe blocks, unwrap on external input, command args injection.
- Ruby: open-uri + user URL, eval, mass assignment, command injection.
- PHP: include/require on user paths, weak typing around system calls, dangerous functions (exec/shell_exec/system).
- C/C++: strcpy/sprintf overflows, unchecked mallocs, format strings, command injection.
- Swift/Kotlin: weak keychain usage patterns, WebView risks, JNI/native bridges.
- Shell: unquoted vars, curl|bash, secrets in env exports.
- Docker/CI: privileged containers, credential leakage, unpinned third-party actions, overly broad secrets.
- Config (.env, yaml, toml): live API keys, weak defaults, debug flags in production paths.

Return ONLY valid JSON (no markdown, no code fences).
Files analyzed: ${JSON.stringify(riskFilesForModel)}

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
  "summary": "brief summary covering security and code-quality findings"
}

Also include code-quality / maintainability risks when visible: excessive complexity, dead patterns, poor separation of concerns, missing error handling, and language-specific smells (e.g. long methods in Java, unwrap chains in Rust, global state in PHP, etc.).`;

        const auditorPrompt = `You are a cross-ecosystem dependency auditor. The repository may use npm (package.json), pip (requirements.txt / Pipfile / pyproject.toml), Cargo, Go modules, RubyGems (Gemfile), Composer (composer.json), Maven (pom.xml), Gradle, Docker base images, docker-compose images, and GitHub Actions (uses:).

PRIMARY SOURCE: Declared dependencies parsed from real manifest files in the Git tree — not guesses from paths alone.

npm package.json paths (may be empty):
${JSON.stringify(auditorPackageJsonPaths.length ? auditorPackageJsonPaths : ["(none)"])}

All manifest paths inspected:
${JSON.stringify(auditorManifestPaths.length ? auditorManifestPaths : ["(none)"])}

Declared dependency entries (deduplicated by name — first occurrence wins). Fields: name, declared range/version, kind (npm / pip / cargo / go-mod / maven / gradle / composer / docker / actions / etc.), originating manifest path:
${JSON.stringify(auditorDependencyEntries.slice(0, 220))}

Truncated manifest excerpts for context:
${JSON.stringify(auditorManifestSnippets.slice(0, 24))}

Sampled source/config paths (secondary context):
${JSON.stringify(fileContents.map((f) => f.path))}

Instructions:
1. Prefer the manifests above. Reference names and declared versions exactly.
2. If no manifests were found, infer cautiously from paths and say so in the summary.
3. Flag outdated ranges, missing pins, or well-known vulnerable lines conservatively (PyPI, crates.io, Maven Central, npm, RubyGems, Packagist, Go proxy, Docker hub tags, unpinned GitHub Actions).
4. For composite Maven coordinates "group:artifact", treat as a single dependency name.

Return ONLY valid JSON:
{
  "dependencies": [
    {
      "name": "package or coordinate",
      "version": "declared range or tag from manifest",
      "status": "vulnerable|outdated|ok",
      "issue": "one or two sentences"
    }
  ],
  "summary": "brief summary naming which ecosystems were audited"
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
        const filesMappedCount =
          scorerNodes.length || mapperData.stats?.graphPathsUsed || graphPaths.length;

        const scorerPrompt = `Analyze this multi-language codebase health data and return ONLY a JSON object. No markdown, no explanation.
Just raw JSON.

Data:
- Files in dependency graph: ${filesMappedCount}
- Total analyzable files in repo: ${mapperData.stats?.repoFilesMatched ?? allAnalyzablePaths.length}
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
        } catch (error: unknown) {
          const msg = stringifyError(error) || "Analysis failed unexpectedly.";
          try {
            send({ agent: "error", status: "error", msg });
          } catch {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ agent: "error", status: "error", msg })}\n\n`)
            );
          }
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    return Response.json(
      {
        error: "Failed to start analysis stream",
        detail: stringifyError(error),
      },
      { status: 500 }
    );
  }
}