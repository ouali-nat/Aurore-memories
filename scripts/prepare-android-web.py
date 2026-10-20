#!/usr/bin/env python3
"""Stage the tracked static site into Capacitor's local web bundle."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "android-app"
DEST = ANDROID / "www"
KATEX = ANDROID / "node_modules" / "katex" / "dist"

tracked = subprocess.check_output(
    ["git", "ls-files", "-z"], cwd=ROOT
).decode("utf-8").split("\0")

if DEST.exists():
    shutil.rmtree(DEST)
DEST.mkdir(parents=True)

copied = 0
for entry in tracked:
    if not entry or entry.startswith(("android-app/", ".github/", ".git/")):
        continue
    source = ROOT / entry
    if not source.is_file():
        continue
    target = DEST / entry
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    copied += 1

if not (DEST / "index.html").is_file():
    raise SystemExit("Préparation Android impossible : index.html absent du bundle.")

if not KATEX.is_dir():
    raise SystemExit("KaTeX local introuvable. Exécuter npm install dans android-app.")

katex_dest = DEST / "vendor" / "katex"
if katex_dest.exists():
    shutil.rmtree(katex_dest)
shutil.copytree(KATEX, katex_dest)

# Keep math rendering functional without a network connection.
replacements = {
    "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js": "/vendor/katex/katex.min.js",
    "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js": "/vendor/katex/contrib/auto-render.min.js",
    "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css": "/vendor/katex/katex.min.css",
    "https://unpkg.com/katex@0.16.22/dist/katex.min.js": "/vendor/katex/katex.min.js",
    "https://unpkg.com/katex@0.16.22/dist/contrib/auto-render.min.js": "/vendor/katex/contrib/auto-render.min.js",
    "https://unpkg.com/katex@0.16.22/dist/katex.min.css": "/vendor/katex/katex.min.css",
}
text_extensions = {".html", ".js", ".css", ".json", ".webmanifest"}
for file in DEST.rglob("*"):
    if not file.is_file() or file.suffix.lower() not in text_extensions:
        continue
    try:
        original = file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    updated = original
    for remote, local in replacements.items():
        updated = updated.replace(remote, local)
    if updated != original:
        file.write_text(updated, encoding="utf-8")

print(f"Bundle Android préparé : {copied} fichiers du dépôt + KaTeX local.")
