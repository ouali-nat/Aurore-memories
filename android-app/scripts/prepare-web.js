const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../..");
const androidRoot = path.resolve(__dirname, "..");
const webRoot = path.join(androidRoot, "www");
const allowed = new Set([
  ".html", ".css", ".js", ".json", ".webmanifest", ".svg", ".png", ".jpg",
  ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf",
  ".pdf", ".mp3", ".mp4", ".webm", ".txt"
]);

function removeIfExists(target) {
  fs.rmSync(target, { recursive: true, force: true });
}
removeIfExists(webRoot);
fs.mkdirSync(webRoot, { recursive: true });

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
  .split("\0").filter(Boolean);
let copied = 0;
for (const relative of tracked) {
  if (relative.startsWith(".github/") || relative.startsWith("android-app/") ||
      relative.startsWith("api/") || relative.startsWith("tests/") ||
      relative.startsWith(".git/") || /^(README|LICENSE|CHANGELOG|CONTRIBUTING)(\.|$)/i.test(relative)) continue;
  if (!allowed.has(path.extname(relative).toLowerCase())) continue;
  const source = path.join(repoRoot, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
  const destination = path.join(webRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  copied += 1;
}

// Embed the exact, pinned math renderer and Supabase browser client.
// This makes formulas and the local visitor mode independent of CDN availability.
const vendor = path.join(webRoot, "vendor");
fs.mkdirSync(vendor, { recursive: true });
fs.cpSync(path.join(androidRoot, "node_modules/katex/dist"), path.join(vendor, "katex"), { recursive: true });
const supabaseUmd = path.join(androidRoot, "node_modules/@supabase/supabase-js/dist/umd/supabase.js");
if (!fs.existsSync(supabaseUmd)) {
  throw new Error("Bundle UMD de Supabase introuvable : " + supabaseUmd);
}
fs.copyFileSync(supabaseUmd, path.join(vendor, "supabase.js"));

// Keep card PDF/image export functional without a network connection in the APK.
fs.copyFileSync(path.join(androidRoot, "node_modules/html2pdf.js/dist/html2pdf.bundle.min.js"), path.join(vendor, "html2pdf.bundle.min.js"));
fs.copyFileSync(path.join(androidRoot, "node_modules/html2canvas/dist/html2canvas.min.js"), path.join(vendor, "html2canvas.min.js"));


// Stamp this bundle with the exact source commit. The runtime updater uses the
// source revision and publication timestamp to reject stale manifests.
const buildCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot, encoding: "utf8"
}).trim();
const buildCommitDate = execFileSync("git", ["show", "-s", "--format=%cI", "HEAD"], {
  cwd: repoRoot, encoding: "utf8"
}).trim();
const compatibility = JSON.parse(fs.readFileSync(
  path.join(androidRoot, "live-update-compatibility.json"), "utf8"
));
if (!Number.isSafeInteger(compatibility.nativeApiVersion) || compatibility.nativeApiVersion < 1) {
  throw new Error("Version de compatibilité Android invalide.");
}
fs.writeFileSync(path.join(webRoot, "aurore-build-info.json"), JSON.stringify({
  schemaVersion: 1,
  commitSha: buildCommit,
  commitDate: buildCommitDate,
  builtAt: new Date().toISOString(),
  nativeApiVersion: compatibility.nativeApiVersion
}, null, 2) + "\n");

const buildStamp = buildCommit.slice(0, 12);
function appendBuildStamp(value) {
  const trimmed = value.trim();
  if (!trimmed ||
      /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed) ||
      /(?:^|[?&])auroreBuild=/i.test(trimmed)) return value;

  const hashAt = trimmed.indexOf("#");
  const beforeHash = hashAt >= 0 ? trimmed.slice(0, hashAt) : trimmed;
  const hash = hashAt >= 0 ? trimmed.slice(hashAt) : "";
  const separator = beforeHash.includes("?") ? "&" : "?";
  const updated = beforeHash + separator + "auroreBuild=" + buildStamp + hash;
  return value.replace(trimmed, updated);
}

// Capacitor's local server keeps the same URL between bundles. Query-stamp all
// local HTML references and CSS url() assets so WebView HTTP caches cannot pin
// JavaScript, stylesheets, icons, fonts, or internal navigation to an old bundle.
function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

for (const file of walkFiles(webRoot)) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".css") {
    const css = fs.readFileSync(file, "utf8").replace(
      /url\((\s*)(["']?)([^"')]+)(["']?)(\s*)\)/gi,
      (whole, before, openingQuote, value, closingQuote, after) =>
        "url(" + before + openingQuote + appendBuildStamp(value) + closingQuote + after + ")"
    );
    fs.writeFileSync(file, css);
  }
  if (extension !== ".html") continue;

  let html = fs.readFileSync(file, "utf8");
  if (!html.includes("live-update-client.js")) {
    const bootstrap = '\n<script src="/vendor/capacitor-app-bridge.js?auroreBuild=' + buildStamp + '"></script>' +
      '\n<script defer src="/live-update-client.js?auroreBuild=' + buildStamp + '"></script>\n';
    if (/<\/head\s*>/i.test(html)) {
      html = html.replace(/<\/head\s*>/i, bootstrap + "</head>");
    } else if (/<\/body\s*>/i.test(html)) {
      html = html.replace(/<\/body\s*>/i, bootstrap + "</body>");
    } else {
      html += bootstrap;
    }
  }

  html = html.replace(/\b(src|href)=(["'])(.*?)\2/gi, (whole, attribute, quote, value) =>
    attribute + "=" + quote + appendBuildStamp(value) + quote
  );
  fs.writeFileSync(file, html);
}

for (const required of ["index.html", "memoire.js", "math-render.js", "style.css"]) {
  if (!fs.existsSync(path.join(webRoot, required))) {
    throw new Error("Ressource web obligatoire absente : " + required);
  }
}
console.log("Ressources web copiées : " + copied);
console.log("KaTeX et Supabase embarqués dans www/vendor.");
