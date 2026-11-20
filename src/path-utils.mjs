export function normalizeArchivePath(value) {
  if (typeof value !== "string") return null;
  const raw = value.replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || /^[a-z]:\//i.test(raw) || raw.includes("\0")) return null;
  const pieces = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") return null;
    pieces.push(part);
  }
  return pieces.length ? pieces.join("/") : null;
}
export const isHtmlFile = (path) => /\.(?:html?|xhtml)$/i.test(path);
export function chooseStartPage(paths) {
  const pages = [...paths].filter(isHtmlFile);
  pages.sort((a, b) => {
    const rank = (p) => ((/\/?index\.html?$/i.test(p) ? 0 : 100) + p.split("/").length * 10);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return pages[0] || null;
}
export function deriveRootPrefix(paths) {
  const names = new Set([...paths].map((p) => p.split("/")[0]));
  if (names.size !== 1) return "";
  const part = [...names][0];
  return part.includes(".") && !/\.(?:html?|css|js)$/i.test(part) ? part + "/" : "";
}
function normalizeLinkPath(value) {
  const parts = [];
  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.join("/");
}
function variants(p) {
  const trimmed = p.replace(/\/+$/, "");
  if (!trimmed) return ["index.html", "index.htm"];
  return p.endsWith("/")
    ? [trimmed + "/index.html", trimmed + "/index.htm", trimmed]
    : [trimmed, trimmed + ".html", trimmed + "/index.html", trimmed + "/index.htm"];
}
function decoded(s) { try { return decodeURIComponent(s); } catch { return s; } }
export function resolveLocalPath(href, from, available, opts = {}) {
  if (typeof href !== "string" || !href.trim()) return null;
  const value = href.trim();
  if (/^(javascript|data|blob|mailto|tel|sms):/i.test(value)) return null;
  if (value.startsWith("#")) return { path: from, hash: decoded(value.slice(1)) };
  const rootPrefix = opts.rootPrefix || "";
  let siteHost = rootPrefix && rootPrefix.slice(0, -1).includes(".") ? rootPrefix.slice(0, -1).toLowerCase() : "";
  if (opts.origin) { try { siteHost = new URL(opts.origin).hostname.toLowerCase(); } catch {} }
  let rawPath = value, hash = "", absolute = false;
  if (/^(https?:)?\/\//i.test(value)) {
    try {
      const url = new URL(value.startsWith("//") ? "https:" + value : value);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      if (siteHost && siteHost !== url.hostname.toLowerCase()) return null;
      rawPath = url.pathname; hash = decoded(url.hash.slice(1)); absolute = true;
    } catch { return null; }
  } else {
    const hashAt = rawPath.indexOf("#");
    if (hashAt >= 0) { hash = decoded(rawPath.slice(hashAt + 1)); rawPath = rawPath.slice(0, hashAt); }
    const queryAt = rawPath.indexOf("?");
    if (queryAt >= 0) rawPath = rawPath.slice(0, queryAt);
    absolute = rawPath.startsWith("/");
  }
  try { rawPath = decodeURIComponent(rawPath); } catch { return null; }
  if (!rawPath) return { path: from, hash };
  if (/[\u0000-\u001f]/.test(rawPath)) return null;
  const base = absolute ? "" : from.slice(0, from.lastIndexOf("/") + 1);
  const p = normalizeLinkPath(base + rawPath.replace(/^\/+/, ""));
  if (p === null) return null;
  const attempts = [p];
  if (rootPrefix && !p.startsWith(rootPrefix)) attempts.push(rootPrefix + p);
  for (const attempt of attempts) {
    for (const test of variants(attempt)) if (available.has(test)) return { path: test, hash };
  }
  // Handle ZIPs that wrap the site in an extra top-level folder.
  for (const test of variants(p)) {
    const matches = [...available].filter((candidate) => candidate.endsWith("/" + test));
    if (matches.length === 1) return { path: matches[0], hash };
  }
  return null;
}
export function readableName(path) {
  const parts = path.split("/");
  let name = parts.pop() || "";
  if (/^index\.html?$/i.test(name)) name = parts.pop() || "Home";
  else name = name.replace(/\.(?:html?|xhtml)$/i, "");
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (v) => v.toUpperCase()) || "Home";
}
