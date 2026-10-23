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

for (const required of ["index.html", "memoire.js", "math-render.js", "style.css"]) {
  if (!fs.existsSync(path.join(webRoot, required))) {
    throw new Error("Ressource web obligatoire absente : " + required);
  }
}
console.log("Ressources web copiées : " + copied);
console.log("KaTeX et Supabase embarqués dans www/vendor.");
