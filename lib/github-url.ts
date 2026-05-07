/**
 * Validates and parses GitHub repository URLs before calling the GitHub API.
 * Accepts HTTPS/HTTP host github.com or www.github.com, and SSH git@github.com:owner/repo.
 */

export type ParsedGitHubRepo = {
  owner: string;
  repo: string;
  /** Normalized HTTPS URL without trailing slashes or fragments */
  displayUrl: string;
};

const RESERVED_OWNER_SEGMENTS = new Set([
  "settings",
  "orgs",
  "enterprise",
  "pricing",
  "topics",
  "readme",
  "collections",
  "sponsors",
  "signup",
  "login",
]);

function strip_git_suffix(segment: string): string {
  return segment.replace(/\.git$/i, "");
}

export function validGitHubSlugOwner(segment: string): boolean {
  if (segment.length < 1 || segment.length > 39) return false;
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9]|[-](?=[a-zA-Z0-9]))*$/.test(segment);
}

export function validGitHubRepoName(segment: string): boolean {
  if (segment.length < 1 || segment.length > 100) return false;
  return /^[a-zA-Z0-9._-]+$/.test(segment);
}

/** Returns null unless input is a well-formed github.com OWNER/REPO reference. */
export function parseValidatedGitHubRepositoryUrl(input: unknown): ParsedGitHubRepo | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/[\u200b-\u200d\ufeff]/g, "");
  if (!raw || raw.length > 2048) return null;

  let owner = "";
  let repo = "";

  const sshMatch = raw.match(/^git@github\.com:([^/\s]+)\/([^#\s]+\.git|[^#\s]+)(?:#|$)/i);
  if (sshMatch) {
    owner = sshMatch[1];
    repo = strip_git_suffix(sshMatch[2]);
  } else {
    let urlStr = raw.trim().replace(/[\u200b-\u200d\ufeff]/g, "");
    if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;

    let u: URL;
    try {
      u = new URL(urlStr);
    } catch {
      return null;
    }

    const host = u.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return null;

    const parts = u.pathname
      .split("/")
      .filter(Boolean)
      .map((p) => {
        try {
          return decodeURIComponent(p);
        } catch {
          return p;
        }
      });

    if (parts.length < 2) return null;
    if (RESERVED_OWNER_SEGMENTS.has(parts[0].toLowerCase())) return null;

    owner = parts[0];
    repo = strip_git_suffix(parts[1]);
  }

  if (!validGitHubSlugOwner(owner) || !validGitHubRepoName(repo)) return null;

  const displayUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return { owner, repo, displayUrl };
}
