// Solmar Bay — the entry program (Node 22, standard library only).
//
// It hands the game in: copies this repository's game/ and screenshots/
// beside it into the output directory and writes /output/dossier.json,
// the summary the judge reads, using the vendored make.fun library.
//
// Run locally to check the output before entering:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader the output directory is /output (MAKEFUN_OUTPUT_DIR unset).

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  console.error(`solmar-bay main.ts: ${message}`);
  process.exit(1);
}

if (!existsSync(join(repoRoot, 'game', 'index.html'))) {
  fail('game/index.html is missing — nothing to hand in.');
}

// The scorer's own caps, mirrored here so a bad entry fails loudly at
// build time instead of silently at the gate: at most 4 screenshots of
// 256 KiB, at most 993 game files totalling 48 MiB, paths under 1000 bytes.
const shotDir = join(repoRoot, 'screenshots');
const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((n) => !n.startsWith('.')) : [];
if (shots.length < 3 || shots.length > 4) {
  fail(`expected 3 or 4 screenshots, found ${shots.length}.`);
}

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) {
  cpSync(shotDir, join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`solmar-bay: wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes, ${shots.length} screenshots).`);
