/** Declared dependency row for cross-ecosystem auditing (mirrors route.ts PkgDepEntry). */
export type ManifestDepEntry = {
  name: string;
  range: string;
  kind: string;
  fromPath: string;
};

const DEP_MANIFEST_BASENAMES = new Set([
  "package.json",
  "requirements.txt",
  "pipfile",
  "pyproject.toml",
  "cargo.toml",
  "go.mod",
  "gemfile",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "docker-compose.yml",
  "docker-compose.yaml",
]);

export function isDependencyManifestPath(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  const base = p.split("/").pop()?.toLowerCase() ?? "";
  if (DEP_MANIFEST_BASENAMES.has(base)) return true;
  if (base === "dockerfile" || p.toLowerCase().endsWith("/dockerfile")) return true;
  if (
    p.includes(".github/workflows/") &&
    (base.endsWith(".yml") || base.endsWith(".yaml"))
  ) {
    return true;
  }
  return false;
}

function pushUnique(
  out: ManifestDepEntry[],
  seen: Set<string>,
  name: string,
  range: string,
  kind: string,
  fromPath: string
) {
  const key = `${fromPath}\0${name}\0${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ name: name.trim(), range: range.trim() || "—", kind, fromPath });
}

/** requirements.txt — pip */
export function parseRequirementsTxt(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-")) continue;
    const m = t.match(/^([a-zA-Z0-9][a-zA-Z0-9._\-]*)\s*([=<>!~].*)?$/);
    if (m) pushUnique(out, seen, m[1], (m[2] || "").trim() || "*", "requirements.txt", fromPath);
  }
  return out;
}

/** Pipfile (subset: [packages] / [dev-packages]) */
export function parsePipfile(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  let section: "packages" | "dev-packages" | null = null;
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (/^\[packages\]\s*$/i.test(t)) {
      section = "packages";
      continue;
    }
    if (/^\[dev-packages\]\s*$/i.test(t)) {
      section = "dev-packages";
      continue;
    }
    if (t.startsWith("[") && t.endsWith("]")) {
      section = null;
      continue;
    }
    if (!section || !t) continue;
    const m = t.match(/^([a-zA-Z0-9._\-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const kind = section === "dev-packages" ? "pipfile-dev" : "pipfile";
    let range = m[2].trim();
    const ver = range.match(/version\s*=\s*["']([^"']+)["']/i);
    if (ver) range = ver[1];
    else if (range.startsWith("{")) range = range;
    else range = range.replace(/^["']|["']$/g, "");
    pushUnique(out, seen, m[1], range, kind, fromPath);
  }
  return out;
}

/** pyproject.toml — PEP 621 dependencies array + Poetry (best-effort) */
export function parsePyprojectToml(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  const poetry = content.match(
    /\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\n\[[^\]]+\]|$)/i
  );
  if (poetry) {
    for (const line of poetry[1].split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([a-zA-Z0-9._\-]+)\s*=\s*(.+)$/);
      if (!m || m[1].toLowerCase() === "python") continue;
      let range = m[2].trim();
      const ver = range.match(/version\s*=\s*["']([^"']+)["']/);
      if (ver) range = ver[1];
      else range = range.replace(/^["']|["']$/g, "");
      pushUnique(out, seen, m[1], range, "poetry", fromPath);
    }
  }
  const pep = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/i);
  if (pep) {
    for (const m of pep[1].matchAll(/["']([^"']+)["']/g)) {
      const spec = m[1];
      const pm = spec.match(/^([a-zA-Z0-9._\-]+)\s*([<>=!~].*)$/);
      if (pm) pushUnique(out, seen, pm[1], pm[2].trim(), "pyproject-dependencies", fromPath);
      else {
        const name = spec.split(/[~=<>![\]]/)[0].trim();
        if (name) pushUnique(out, seen, name, "*", "pyproject-dependencies", fromPath);
      }
    }
  }
  return out;
}

/** Cargo.toml [dependencies] */
export function parseCargoToml(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  let inDeps = false;
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (/^\[dependencies\]\s*$/i.test(t)) {
      inDeps = true;
      continue;
    }
    if (t.startsWith("[") && t.endsWith("]")) {
      inDeps = false;
      continue;
    }
    if (!inDeps || !t || t.startsWith("#")) continue;
    const m = t.match(/^([a-zA-Z0-9._\-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    let range = m[2].trim();
    if (range.startsWith("{")) {
      const v = range.match(/version\s*=\s*["']([^"']+)["']/);
      range = v ? v[1] : range;
    } else range = range.replace(/^["']|["']$/g, "");
    pushUnique(out, seen, m[1], range, "cargo", fromPath);
  }
  return out;
}

/** go.mod require lines */
export function parseGoMod(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  let inBlock = false;
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("require (")) {
      inBlock = true;
      continue;
    }
    if (inBlock && t.startsWith(")")) {
      inBlock = false;
      continue;
    }
    if (!inBlock) {
      const one = t.match(/^require\s+([^\s]+)\s+([^\s]+)\s*$/);
      if (one && !one[1].startsWith("(")) {
        pushUnique(out, seen, one[1], one[2], "go-mod", fromPath);
        continue;
      }
    }
    if (inBlock) {
      const m = t.match(/^([^\s]+)\s+([^\s]+)\s*$/);
      if (m && !m[1].startsWith("//")) pushUnique(out, seen, m[1], m[2], "go-mod", fromPath);
    }
  }
  return out;
}

/** Gemfile gem declarations */
export function parseGemfile(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("gem ") && !t.startsWith("github ")) continue;
    const gm = t.match(/gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']*)["'])?/);
    if (gm) pushUnique(out, seen, gm[1], gm[2] || "—", "gemfile", fromPath);
  }
  return out;
}

/** composer.json (PHP) */
export function parseComposerJson(
  content: string,
  fromPath: string
): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  try {
    const j = JSON.parse(content) as {
      require?: Record<string, string>;
      "require-dev"?: Record<string, string>;
    };
    const rec = (rec: Record<string, string> | undefined, kind: string) => {
      if (!rec) return;
      for (const [name, range] of Object.entries(rec)) {
        if (name === "php") continue;
        pushUnique(out, seen, name, range, kind, fromPath);
      }
    };
    rec(j.require, "composer-require");
    rec(j["require-dev"], "composer-require-dev");
  } catch {
    /* ignore */
  }
  return out;
}

/** Maven pom.xml */
export function parsePomXml(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  const depBlocks = content.match(/<dependency>[\s\S]*?<\/dependency>/gi) || [];
  for (const block of depBlocks) {
    const g = block.match(/<groupId>([^<]+)<\/groupId>/i);
    const a = block.match(/<artifactId>([^<]+)<\/artifactId>/i);
    const v = block.match(/<version>([^<]+)<\/version>/i);
    if (g && a) {
      const name = `${g[1].trim()}:${a[1].trim()}`;
      pushUnique(out, seen, name, v ? v[1].trim() : "—", "maven", fromPath);
    }
  }
  return out;
}

/** Gradle (Groovy / Kotlin DSL subset) */
export function parseGradleDeps(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  const patterns = [
    /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|classpath)\s*\(\s*["']([^"']+)["']\s*\)/g,
    /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|classpath)\s+["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const spec = m[1];
      const parts = spec.split(":");
      const name =
        parts.length >= 2 ? `${parts[parts.length - 2]}:${parts[parts.length - 1]}` : spec;
      const ver = parts.length >= 3 ? parts[parts.length - 1] : "—";
      pushUnique(out, seen, name, ver, "gradle", fromPath);
    }
  }
  return out;
}

/** docker-compose image: lines */
export function parseDockerComposeImages(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*image:\s*["']?([^\s"'#]+)/i);
    if (m) pushUnique(out, seen, `compose:${m[1]}`, m[1], "docker-compose", fromPath);
  }
  return out;
}

/** Dockerfile FROM lines */
export function parseDockerfileImages(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    const m = t.match(/^FROM\s+([^\s]+)/i);
    if (m) pushUnique(out, seen, `container:${m[1]}`, m[1], "dockerfile-from", fromPath);
  }
  return out;
}

/** GitHub Actions uses: */
export function parseGithubWorkflowUses(content: string, fromPath: string): ManifestDepEntry[] {
  const out: ManifestDepEntry[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*uses:\s*([^\s#]+)/);
    if (m) pushUnique(out, seen, m[1], m[1], "github-actions", fromPath);
  }
  return out;
}

export function parseManifestByPath(path: string, content: string): ManifestDepEntry[] {
  const p = path.replace(/\\/g, "/");
  const base = p.split("/").pop()?.toLowerCase() ?? "";
  if (base === "package.json") return []; // handled by JSON.parse in route
  if (base === "requirements.txt") return parseRequirementsTxt(content, path);
  if (base === "pipfile") return parsePipfile(content, path);
  if (base === "pyproject.toml") return parsePyprojectToml(content, path);
  if (base === "cargo.toml") return parseCargoToml(content, path);
  if (base === "go.mod") return parseGoMod(content, path);
  if (base === "gemfile") return parseGemfile(content, path);
  if (base === "composer.json") return parseComposerJson(content, path);
  if (base === "pom.xml") return parsePomXml(content, path);
  if (base === "build.gradle" || base === "build.gradle.kts")
    return parseGradleDeps(content, path);
  if (base === "dockerfile" || p.toLowerCase().endsWith("/dockerfile"))
    return parseDockerfileImages(content, path);
  if (base === "docker-compose.yml" || base === "docker-compose.yaml")
    return parseDockerComposeImages(content, path);
  if (p.includes(".github/workflows/") && (base.endsWith(".yml") || base.endsWith(".yaml")))
    return parseGithubWorkflowUses(content, path);
  return [];
}
