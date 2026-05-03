import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const SCORER_SYSTEM_INSTRUCTION = `You are a security scoring engine. Score this codebase on a scale of 0-100 based on these strict rules:
- Start at 100
- Subtract 15 points for each CRITICAL vulnerability
- Subtract 8 points for each HIGH vulnerability  
- Subtract 3 points for each outdated dependency
- Subtract 5 points for high coupling
- Subtract 5 points for high dead code
- Never go below 10
- Never give above 85 for a repo with known CVEs
- Be consistent — same inputs should give similar outputs

Return only the JSON score object, no explanation.`;

const FETCH_TIMEOUT_MS = 30_000;

const ANALYSIS_SOURCE_FILE_CAP = 50;
const RISK_TOP_FILES_BY_SIZE = 20;

/** Non-stream REST fetch with 30s abort (explicit timeout + clearTimer). */
async function fetchWithAbortTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function geminiGenerateContentUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
}

type GeminiRESTResult = { ok: boolean; status: number; text: string };

/**
 * Gemini REST `generateContent` — same payload for mapper, risk, auditor, scorer, insights.
 */
async function geminiREST(
  prompt: string,
  options?: { systemInstruction?: string }
): Promise<GeminiRESTResult> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
  };
  if (options?.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }
  const response = await fetchWithAbortTimeout(geminiGenerateContentUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  console.log("Gemini status:", response.status);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return { ok: response.ok, status: response.status, text };
}

async function geminiGenerateContent(
  prompt: string,
  options?: { systemInstruction?: string }
): Promise<string> {
  const r = await geminiREST(prompt, options);
  return r.text;
}

async function octokitWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function countRiskSeverities(risks: readonly { severity: string }[]): {
  critical: number;
  high: number;
  warning: number;
  other: number;
} {
  const out = { critical: 0, high: 0, warning: 0, other: 0 };
  for (const r of risks) {
    const s = String(r.severity || "").toLowerCase();
    if (s.includes("critical")) out.critical++;
    else if (s.includes("high")) out.high++;
    else if (s.includes("warning") || s === "medium") out.warning++;
    else out.other++;
  }
  return out;
}

function countDepStatuses(deps: unknown[]): {
  vulnerable: number;
  outdated: number;
  ok: number;
  other: number;
} {
  const out = { vulnerable: 0, outdated: 0, ok: 0, other: 0 };
  for (const d of deps) {
    const o = (d ?? {}) as Record<string, unknown>;
    const st = String(o.status ?? "").toLowerCase();
    if (st === "vulnerable") out.vulnerable++;
    else if (st === "outdated") out.outdated++;
    else if (st === "ok") out.ok++;
    else out.other++;
  }
  return out;
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

/** Strip ```json fences often wrapping Gemma output */
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

function parseRecommendationsArray(text: string): string[] {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

type GeminiInsightsShape = {
  summary: string;
  criticalActions: { action: string; reason: string; effort: "Low" | "Medium" | "High" }[];
  recommendations: string[];
  securityGrade: "A" | "B" | "C" | "D" | "F";
  estimatedFixTime: string;
};

function normalizeGeminiInsights(raw: unknown): GeminiInsightsShape | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const estimatedFixTime =
    typeof o.estimatedFixTime === "string" ? o.estimatedFixTime.trim() : "";
  const securityGradeRaw =
    typeof o.securityGrade === "string" ? o.securityGrade.trim().toUpperCase() : "";
  const securityGrade = ["A", "B", "C", "D", "F"].includes(securityGradeRaw)
    ? (securityGradeRaw as GeminiInsightsShape["securityGrade"])
    : "C";

  const recommendations = Array.isArray(o.recommendations)
    ? o.recommendations
        .filter((item): item is string => typeof item === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const criticalActions = Array.isArray(o.criticalActions)
    ? o.criticalActions
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const a = item as Record<string, unknown>;
          const action = typeof a.action === "string" ? a.action.trim() : "";
          const reason = typeof a.reason === "string" ? a.reason.trim() : "";
          const effortRaw = typeof a.effort === "string" ? a.effort.trim() : "";
          const effort = ["Low", "Medium", "High"].includes(effortRaw)
            ? (effortRaw as "Low" | "Medium" | "High")
            : "Medium";
          if (!action || !reason) return null;
          return { action, reason, effort };
        })
        .filter((x): x is { action: string; reason: string; effort: "Low" | "Medium" | "High" } => x !== null)
        .slice(0, 5)
    : [];

  if (!summary) return null;
  return {
    summary,
    criticalActions,
    recommendations,
    securityGrade,
    estimatedFixTime: estimatedFixTime || "Unknown",
  };
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

type NormalizedRisk = {
  file: string;
  severity: string;
  issue: string;
  score: number;
  whatIsThis: string;
  whyDangerous: string;
  howToFix: string;
  cvss: number | null;
};

type RiskAgentPayload = { risks: NormalizedRisk[]; summary: string };

function coerceRiskCvss(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
}

function coerceRiskScore(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Ensures Gemini risk rows always include explanatory fields for the dashboard expander UI.
 */
function normalizeRiskItems(risks: unknown): NormalizedRisk[] {
  if (!Array.isArray(risks)) return [];
  const out: NormalizedRisk[] = [];
  for (const r of risks) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const file = typeof o.file === "string" ? o.file : "";
    const issue = typeof o.issue === "string" ? o.issue : "";
    const severity = typeof o.severity === "string" ? o.severity : "info";
    const whatIsThis =
      typeof o.whatIsThis === "string"
        ? o.whatIsThis
        : typeof o.what_is_this === "string"
          ? o.what_is_this
          : "";
    const whyDangerous =
      typeof o.whyDangerous === "string"
        ? o.whyDangerous
        : typeof o.why_dangerous === "string"
          ? o.why_dangerous
          : "";
    const howToFix =
      typeof o.howToFix === "string"
        ? o.howToFix
        : typeof o.how_to_fix === "string"
          ? o.how_to_fix
          : "";
    out.push({
      file,
      severity,
      issue,
      score: coerceRiskScore(o.score),
      whatIsThis,
      whyDangerous,
      howToFix,
      cvss: coerceRiskCvss(o.cvss),
    });
  }
  return out;
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

        const tree = (
          await octokitWithTimeout((signal) =>
            octokit.git.getTree({
              owner,
              repo,
              tree_sha: "HEAD",
              recursive: "true",
              request: { signal },
            })
          )
        ).data;

        type MappedBlob = { path: string; size: number };

        const allSourceBlobs: MappedBlob[] = tree.tree
          .filter((f) => f.type === "blob" && isAllowedSourceBlobPath(f.path))
          .map((f) => ({
            path: f.path!,
            size: typeof f.size === "number" ? f.size : 0,
          }));

        const mappedFilePool = allSourceBlobs.slice(0, ANALYSIS_SOURCE_FILE_CAP);
        const mapperPaths = mappedFilePool.map((f) => f.path);

        const riskSourceFiles: MappedBlob[] = [...allSourceBlobs]
          .sort((a, b) => b.size - a.size)
          .slice(0, RISK_TOP_FILES_BY_SIZE);

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
        const pomXmlBlobPaths = tree.tree
          .filter(
            (f) =>
              f.type === "blob" &&
              f.path &&
              !f.path.includes("node_modules") &&
              (f.path === "pom.xml" || f.path.endsWith("/pom.xml"))
          )
          .map((f) => f.path!)
          .sort((a, b) => a.split("/").length - b.split("/").length);
        const gradleBlobPaths = tree.tree
          .filter(
            (f) =>
              f.type === "blob" &&
              f.path &&
              !f.path.includes("node_modules") &&
              (f.path === "build.gradle" ||
                f.path === "build.gradle.kts" ||
                f.path.endsWith("/build.gradle") ||
                f.path.endsWith("/build.gradle.kts"))
          )
          .map((f) => f.path!)
          .sort((a, b) => a.split("/").length - b.split("/").length);
        const projectType =
          packageJsonBlobPaths.length > 0
            ? "nodejs"
            : pomXmlBlobPaths.length > 0
              ? "java-maven"
              : gradleBlobPaths.length > 0
                ? "java-gradle"
                : "unknown";

        const mapperPrompt = `You are a codebase mapper. Infer module relationships from file paths and names only (no file bodies). Return ONLY valid JSON.
Project type: ${projectType}
File paths (first ${ANALYSIS_SOURCE_FILE_CAP} source files from tree):
${JSON.stringify(mapperPaths)}

Return this exact JSON structure:
{
  "nodes": [{"id": "filename", "risk": "critical|warning|healthy", "deps": 0}],
  "edges": [{"source": "file1", "target": "file2"}],
  "summary": "brief summary"
}`;

        const mapperText = await geminiGenerateContent(mapperPrompt);
        
        let mapperData = {
          nodes: [],
          edges: [],
          summary: `Mapped ${mapperPaths.length} files`,
        };
        try {
          const jsonMatch = mapperText.match(/\{[\s\S]*\}/);
          if (jsonMatch) mapperData = JSON.parse(jsonMatch[0]);
        } catch {}

        send({
          agent: "mapper",
          status: "done",
          data: mapperData,
          msg: `Mapped ${mapperPaths.length} files successfully`,
        });

        type PkgDepEntry = { name: string; range: string; kind: string; fromPath: string };
        const auditorPackageJsonPaths: string[] = [];
        const auditorPomPaths: string[] = [];
        const auditorGradlePaths: string[] = [];
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

        for (const pkgPath of packageJsonBlobPaths.slice(0, 1)) {
          try {
            const { data: blob } = await octokitWithTimeout((signal) =>
              octokit.repos.getContent({
                owner,
                repo,
                path: pkgPath,
                request: { signal },
              })
            );
            if (!("content" in blob)) continue;

            const raw = Buffer.from(blob.content, "base64").toString("utf-8");
            const pkg = JSON.parse(raw) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
              peerDependencies?: Record<string, string>;
              optionalDependencies?: Record<string, string>;
            };

            auditorPackageJsonPaths.push(pkgPath);
            auditorManifestSnippets.push({ path: pkgPath, preview: raw.slice(0, 3200) });
            recordDeps(pkg.dependencies, "dependencies", pkgPath);
            recordDeps(pkg.devDependencies, "devDependencies", pkgPath);
            recordDeps(pkg.peerDependencies, "peerDependencies", pkgPath);
            recordDeps(pkg.optionalDependencies, "optionalDependencies", pkgPath);
          } catch {
            /* invalid JSON or fetch error — skip */
          }
        }

        if (auditorPackageJsonPaths.length === 0 && pomXmlBlobPaths.length > 0) {
          const parsePomDependencies = (pomContent: string, fromPath: string) => {
            const depBlocks = pomContent.match(/<dependency>[\s\S]*?<\/dependency>/g) || [];
            for (const block of depBlocks) {
              const artifact = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.trim();
              const version = block.match(/<version>([^<]+)<\/version>/)?.[1]?.trim() || "unknown";
              if (!artifact || seenDepNames.has(artifact)) continue;
              seenDepNames.add(artifact);
              auditorDependencyEntries.push({
                name: artifact,
                range: version,
                kind: "maven",
                fromPath,
              });
            }
          };

          // Single primary pom.xml (root API first, else first path in tree).
          let loadedPom = false;
          try {
            const pomResponse = await fetchWithAbortTimeout(
              `https://api.github.com/repos/${owner}/${repo}/contents/pom.xml`,
              {
                headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
              }
            );

            if (pomResponse.ok) {
              const pomData = (await pomResponse.json()) as { content?: string };
              if (typeof pomData.content === "string") {
                const pomContent = Buffer.from(pomData.content, "base64").toString("utf-8");
                const depMatches = pomContent.matchAll(/<artifactId>([^<]+)<\/artifactId>/g);
                const versionMatches = pomContent.matchAll(/<version>([^<]+)<\/version>/g);
                const depNames = Array.from(depMatches, (m) => m[1]?.trim()).filter(
                  (x): x is string => typeof x === "string" && x.length > 0
                );
                const depVersions = Array.from(versionMatches, (m) => m[1]?.trim());
                for (let i = 0; i < depNames.length; i++) {
                  const depName = depNames[i];
                  if (seenDepNames.has(depName)) continue;
                  seenDepNames.add(depName);
                  auditorDependencyEntries.push({
                    name: depName,
                    range: depVersions[i] || "unknown",
                    kind: "maven",
                    fromPath: "pom.xml",
                  });
                }
                parsePomDependencies(pomContent, "pom.xml");
                auditorPomPaths.push("pom.xml");
                auditorManifestSnippets.push({
                  path: "pom.xml",
                  preview: pomContent.slice(0, 3200),
                });
                loadedPom = true;
              }
            }
          } catch {
            /* fallback to tree path below */
          }

          if (
            !loadedPom &&
            pomXmlBlobPaths[0] &&
            auditorPomPaths.length === 0
          ) {
            const pomPath = pomXmlBlobPaths[0];
            try {
              const { data: blob } = await octokitWithTimeout((signal) =>
                octokit.repos.getContent({
                  owner,
                  repo,
                  path: pomPath,
                  request: { signal },
                })
              );
              if ("content" in blob) {
                const pomContent = Buffer.from(blob.content, "base64").toString("utf-8");
                parsePomDependencies(pomContent, pomPath);
                auditorPomPaths.push(pomPath);
                auditorManifestSnippets.push({
                  path: pomPath,
                  preview: pomContent.slice(0, 3200),
                });
              }
            } catch {
              /* skip unreadable pom.xml */
            }
          }
        }

        if (auditorPackageJsonPaths.length === 0 && gradleBlobPaths.length > 0) {
          const gradlePattern =
            /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(?\s*["']([^:"'\s]+):([^:"'\s]+):([^"'\s)]+)["']\s*\)?/g;
          for (const gradlePath of gradleBlobPaths.slice(0, 1)) {
            try {
              const { data: blob } = await octokitWithTimeout((signal) =>
                octokit.repos.getContent({
                  owner,
                  repo,
                  path: gradlePath,
                  request: { signal },
                })
              );
              if (!("content" in blob)) continue;
              const gradleContent = Buffer.from(blob.content, "base64").toString("utf-8");
              const matches = gradleContent.matchAll(gradlePattern);
              for (const m of matches) {
                const artifact = m[2]?.trim();
                const version = m[3]?.trim() || "unknown";
                if (!artifact || seenDepNames.has(artifact)) continue;
                seenDepNames.add(artifact);
                auditorDependencyEntries.push({
                  name: artifact,
                  range: version,
                  kind: "gradle",
                  fromPath: gradlePath,
                });
              }
              auditorGradlePaths.push(gradlePath);
              auditorManifestSnippets.push({
                path: gradlePath,
                preview: gradleContent.slice(0, 3200),
              });
            } catch {
              /* skip unreadable build.gradle */
            }
          }
        }

        const riskFileContents: { path: string; content: string }[] = [];
        for (const file of riskSourceFiles) {
          try {
            const { data: blob } = await octokitWithTimeout((signal) =>
              octokit.repos.getContent({
                owner,
                repo,
                path: file.path,
                request: { signal },
              })
            );
            if ("content" in blob) {
              const content = Buffer.from(blob.content, "base64").toString("utf-8");
              riskFileContents.push({
                path: file.path,
                content: content.slice(0, 420),
              });
            }
          } catch {
            /* skip unreadable file */
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
              : auditorPomPaths.length > 0
                ? `Loaded ${auditorPomPaths.length} pom.xml file(s): ${auditorPomPaths.join(", ")}`
                : auditorGradlePaths.length > 0
                  ? `Loaded ${auditorGradlePaths.length} build.gradle file(s): ${auditorGradlePaths.join(", ")}`
              : "No package.json in tree — inferring dependencies from codebase files...",
        });

        const riskPrompt = `You are a risk detector. Analyze this codebase for issues. Return ONLY valid JSON.
Project type: ${projectType}
Top ${RISK_TOP_FILES_BY_SIZE} files by size (path + short preview only):
${JSON.stringify(
          riskFileContents.map((f) => ({
            path: f.path,
            preview: f.content.slice(0, 200),
          }))
        )}

If project type is Java (Maven or Gradle), prioritize checking for:
- SQL injection in JDBC calls
- Deserialization vulnerabilities
- XXE vulnerabilities in XML parsing
- Insecure random number generation
- Hardcoded credentials

For EVERY risk in "risks", you MUST fill these fields using plain English tailored to that specific finding (derive from "issue" and file context):
- "whatIsThis": 1–3 sentences explaining the vulnerability/issue type for a non-specialist reader.
- "whyDangerous": 1–3 sentences describing real-world impact for users, data, or operations.
- "howToFix": a concrete code snippet (or shell/config snippet when code is not applicable) that fixes or mitigates the issue — use the project's apparent language/stack. No markdown fences inside the string; escape quotes as needed in JSON.

Also optionally set "cvss" to an estimated CVSS 3.x base score number from 0.0–10.0 when the issue resembles a CVE-class vulnerability; omit or null for pure code smells.

Example for issue "Use of md5 for hashing passwords":
whatIsThis should explain that MD5 is broken for password storage and that passwords need slow adaptive hashing.
whyDangerous should describe fast offline cracking and account takeover risk.
howToFix should show bcrypt/scrypt/argon2 replacing MD5 calls (realistic code for the stack).

Return this exact JSON shape (field names camelCase):
{
  "risks": [
    {
      "file": "filename",
      "severity": "critical|warning|info",
      "issue": "short title or description",
      "score": 85,
      "whatIsThis": "plain English explanation",
      "whyDangerous": "impact explanation",
      "howToFix": "single fix snippet as a string (can include newlines)",
      "cvss": 7.5
    }
  ],
  "summary": "brief summary"
}`;

        const auditorPrompt = `You are a dependency auditor for a GitHub repository.
Project type: ${projectType}

Manifest scope: only the primary manifest file was loaded (Node: root/first package.json; Java: one pom.xml or one Gradle file).

Manifest paths actually loaded (≤1 each):
- package.json: ${JSON.stringify(auditorPackageJsonPaths.slice(0, 1))}
- pom.xml: ${JSON.stringify(auditorPomPaths.slice(0, 1))}
- build.gradle: ${JSON.stringify(auditorGradlePaths.slice(0, 1))}

Declared dependency entries (deduplicated; max 80 shown). Fields: name, range, kind, fromPath:
${JSON.stringify(auditorDependencyEntries.slice(0, 80))}

Truncated manifest excerpt(s) only:
${JSON.stringify(auditorManifestSnippets)}

Instructions:
1. Prefer analyzing the real manifest dependencies above. Reference package names and version ranges exactly as declared.
2. If no manifest was found, infer dependencies cautiously and note that in the summary.
3. Assess whether entries look outdated, loosely specified, or plausibly vulnerable from general ecosystem knowledge — return conservative severity unless clearly critical.

Return ONLY valid JSON:
{
  "dependencies": [
    {"name": "package", "version": "range or inferred", "status": "vulnerable|outdated|ok", "severity": "critical|warning|ok"}
  ],
  "summary": "brief summary referencing which manifest type was used"
}`;

        const [riskText, auditText] = await Promise.all([
          geminiGenerateContent(riskPrompt),
          geminiGenerateContent(auditorPrompt),
        ]);

        let riskData: RiskAgentPayload = { risks: [], summary: "Analysis complete" };
        let auditData = { dependencies: [], summary: "Audit complete" };

        try {
          const riskMatch = riskText.match(/\{[\s\S]*\}/);
          if (riskMatch) {
            const raw = JSON.parse(riskMatch[0]) as Record<string, unknown>;
            riskData = {
              risks: normalizeRiskItems(raw.risks),
              summary: typeof raw.summary === "string" ? raw.summary : "Analysis complete",
            };
          }
        } catch {}

        try {
          const auditMatch = auditText.match(/\{[\s\S]*\}/);
          if (auditMatch) auditData = JSON.parse(auditMatch[0]);
        } catch {}

        send({ agent: "risk", status: "done", data: riskData, msg: `Found ${riskData.risks?.length || 0} issues` });
        send({ agent: "auditor", status: "done", data: auditData, msg: `Scanned ${auditData.dependencies?.length || 0} dependencies` });

        // ── AGENT 4: SCORER ──────────────────────────────
        send({ agent: "scorer", status: "running", msg: "Calculating health score..." });

        const scorerNodes = Array.isArray(mapperData.nodes) ? mapperData.nodes : [];
        const scorerRisks = Array.isArray(riskData.risks) ? riskData.risks : [];
        const scorerDeps = Array.isArray((auditData as { dependencies?: unknown }).dependencies)
          ? ((auditData as { dependencies: unknown[] }).dependencies)
          : [];
        const filesMappedCount = scorerNodes.length || mappedFilePool.length;
        const sev = countRiskSeverities(scorerRisks);
        const depStats = countDepStatuses(scorerDeps);

        const mapperSummary =
          typeof mapperData.summary === "string" ? mapperData.summary : "";

        const scorerPrompt = `Use SCORING RULES from system instruction — only summarized inputs below (no raw source files).

Mapper summary:
${mapperSummary}
Nodes count (from mapper JSON): ~${Array.isArray(mapperData.nodes) ? mapperData.nodes.length : 0}; edges: ~${Array.isArray(mapperData.edges) ? mapperData.edges.length : 0}

Risk agent summary:
${riskData.summary}
Risk count: ${scorerRisks.length}. Severity roll-up: ${JSON.stringify(sev)}

Auditor summary:
${typeof auditData.summary === "string" ? auditData.summary : ""}
Dependency count: ${scorerDeps.length}. Status roll-up: ${JSON.stringify(depStats)}
Known CVE / vulnerable-style signals: vulnerable=${depStats.vulnerable}, outdated=${depStats.outdated}

Each numeric field must be an integer from 0 through 100. recommendations must be exactly 3 short strings. Output raw JSON only — no markdown, no prose, no angle brackets in the final answer.

Return exactly this JSON shape:
{
  "score": <number 0-100>,
  "coupling": <number 0-100>,
  "coverage": <number 0-100>,
  "dependencies": <number 0-100>,
  "deadCode": <number 0-100>,
  "recommendations": ["rec1", "rec2", "rec3"]
}`;

        const scorerRawText = await geminiGenerateContent(scorerPrompt, {
          systemInstruction: SCORER_SYSTEM_INSTRUCTION,
        });

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

        const healthScore = scorerData.score;
        const filesScanned = filesMappedCount;
        const issuesFound = scorerRisks.length;
        const riskAnalysis = scorerRisks;
        const dependencies = scorerDeps;

        let aiInsights: GeminiInsightsShape = {
          summary:
            "Analysis complete. Review the findings below for detailed security recommendations.",
          criticalActions: [],
          recommendations: [],
          securityGrade: "C",
          estimatedFixTime: "2-4 hours",
        };

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            // Wait to reduce rate-limit risk before each attempt.
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const insightsPrompt = `Security analysis results:
Health: ${healthScore}/100
Issues: ${issuesFound}
Top risks: ${riskAnalysis
              ?.slice(0, 3)
              .map((r) => `${r.file}: ${r.issue}`)
              .join(", ")}
Vulnerable deps: ${dependencies
              ?.filter(
                (d) =>
                  String((d as { status?: unknown })?.status ?? "").toUpperCase() ===
                  "VULNERABLE"
              )
              .map((d) => String((d as { name?: unknown })?.name ?? "unknown"))
              .join(", ")}

Return ONLY this JSON, no other text:
{"summary":"2 sentence summary","criticalActions":[{"action":"action 1","reason":"why","effort":"High"},{"action":"action 2","reason":"why","effort":"Medium"}],"recommendations":["rec 1","rec 2","rec 3","rec 4","rec 5"],"securityGrade":"C","estimatedFixTime":"3-5 hours"}`;

            const geminiApi = await geminiREST(insightsPrompt);

            if (geminiApi.ok) {
              try {
                const rawText = geminiApi.text || "";
                console.log("Raw Gemini text:", rawText.substring(0, 200));

                // Extract JSON between first { and last }
                const start = rawText.indexOf("{");
                const end = rawText.lastIndexOf("}");

                if (start !== -1 && end !== -1) {
                  let jsonStr = rawText.substring(start, end + 1);

                  // Fix common JSON issues
                  jsonStr = jsonStr
                    .replace(/[\x00-\x1F\x7F]/g, " ")
                    .replace(/\n/g, " ")
                    .replace(/\r/g, " ")
                    .replace(/\t/g, " ")
                    .replace(/\\/g, "\\\\")
                    .replace(/"{/g, '"{')
                    .replace(/}"/g, '}"');

                  aiInsights = JSON.parse(jsonStr);
                  console.log("Gemini parsed successfully");
                  break;
                }
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error("Parse failed:", msg);
                aiInsights = {
                  summary:
                    "Analysis complete. Review findings below.",
                  criticalActions: [
                    {
                      action: "Fix critical vulnerabilities immediately",
                      reason: "High security risk",
                      effort: "High",
                    },
                    {
                      action: "Update outdated dependencies",
                      reason: "Known CVEs present",
                      effort: "Medium",
                    },
                  ],
                  recommendations: [
                    "Review and fix all critical findings",
                    "Update all outdated packages",
                    "Implement input validation",
                    "Add security headers",
                    "Review authentication logic",
                  ],
                  securityGrade: "C",
                  estimatedFixTime: "2-4 hours",
                };
              }
            } else {
              console.log("Gemini failed, using fallback. Status:", geminiApi.status);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("Gemini insights error:", msg);
          }
        }

        (scorerData as ScorerShape & { aiInsights?: GeminiInsightsShape }).aiInsights =
          aiInsights;
        if (aiInsights.recommendations.length > 0) {
          scorerData.recommendations = aiInsights.recommendations;
        }

        send({ agent: "scorer", status: "done", data: scorerData, msg: `Health score: ${scorerData.score}/100` });
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