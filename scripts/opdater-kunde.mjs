#!/usr/bin/env node
// Rul skabelonen ud til én kunde som et FORSLAG (pull request). Intet går live, før forslaget er godkendt og flettet.
//
// Brug (fra skabelonens repo, med alt committet):
//   npm run opdater-kunde -- patrickleth/kundens-repo
//   npm run opdater-kunde -- patrickleth/kundens-repo --tørt     (vis hvad der ville ske, intet pushes)
//
// Sådan virker det:
//   1. Kundens repo hentes, og der laves en gren: skabelon/v<version>.
//   2. Skabelonens filer udskiftes. Kundens filer (sites/<kunde>/, wrangler.jsonc, vaekster.json) røres ikke.
//      Filer, der ikke hører til hverken kunden eller skabelonen (fx en anden kundes mappe), fjernes.
//   3. vaekster.json får den nye version. Tests og en bygning af kundens side køres.
//   4. Grenen pushes, og der oprettes en pull request med ændringslog og testresultat.
//      Cloudflare bygger et preview af grenen, så siden kan ses, før den flettes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { erKundensFil, SKABELON_PATHSPEC, EKSEMPEL_PATHSPEC } from './lib/ejerskab.mjs';

const args = process.argv.slice(2);
const repo = args.find(a => !a.startsWith('--'));
const dry = args.includes('--tørt') || args.includes('--dry-run');
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) { console.error('Brug: npm run opdater-kunde -- <ejer/repo> [--tørt]'); process.exit(1); }

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const tpl = process.cwd();
if (sh('git', ['status', '--porcelain'])) { console.error('Skabelonen har ændringer, der ikke er committet. Commit dem først.'); process.exit(1); }
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const tplCommit = sh('git', ['rev-parse', '--short', 'HEAD']);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opdater-'));
console.log(`Henter ${repo} ...`);
sh('git', ['clone', '--quiet', `https://github.com/${repo}`, dir]);
const inRepo = (cmd, a, opts = {}) => sh(cmd, a, { cwd: dir, ...opts });

// Hvilken kunde tilhører repoet? vaekster.json, ellers SITE_ID i wrangler.jsonc (første opdatering).
const manifestPath = path.join(dir, 'vaekster.json');
let manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
const kunde = manifest?.kunde || (fs.readFileSync(path.join(dir, 'wrangler.jsonc'), 'utf8').match(/"SITE_ID"\s*:\s*"([^"]+)"/) || [])[1];
if (!kunde || !fs.existsSync(path.join(dir, 'sites', kunde, 'site.json'))) { console.error('Kunne ikke finde kunden i repoet (vaekster.json eller SITE_ID i wrangler.jsonc).'); process.exit(1); }
const fra = manifest?.skabelon?.version || 'ukendt';
console.log(`Kunde: ${kunde}. Skabelon ${fra} -> ${version}.`);

const branch = `skabelon/v${version}`;
inRepo('git', ['checkout', '--quiet', '-B', branch]);

// Fjern alt, der ikke er kundens, og læg skabelonens filer ind.
const tracked = inRepo('git', ['ls-files', '-z']).split('\0').filter(Boolean);
const fjern = tracked.filter(p => !erKundensFil(p, kunde));
for (let i = 0; i < fjern.length; i += 200) inRepo('git', ['rm', '--quiet', '-r', '--cached', '--', ...fjern.slice(i, i + 200)]);
for (const p of fjern) fs.rmSync(path.join(dir, p), { force: true });
for (const spec of [SKABELON_PATHSPEC, EKSEMPEL_PATHSPEC]) {
  const tar = execFileSync('git', ['archive', 'HEAD', '--', ...spec], { cwd: tpl, maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
}
manifest = { ...(manifest || {}), kunde, skabelon: { version, opdateret: new Date().toISOString().slice(0, 10), commit: tplCommit } };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
inRepo('git', ['add', '-A']);
const stat = inRepo('git', ['diff', '--cached', '--stat', '--stat-width=100']);
if (!stat) { console.log('Kunden kører allerede denne version. Intet at gøre.'); process.exit(0); }
const leaked = fjern.filter(p => p.startsWith('sites/') && !p.startsWith('sites/eksempel/'));
if (leaked.length) console.log(`Fjerner ${leaked.length} filer fra andre kunders mapper: ${[...new Set(leaked.map(p => p.split('/')[1]))].join(', ')}`);

// Tests og bygning af kundens side, før noget pushes.
const results = [];
const run = (navn, cmd, a, env = {}) => {
  try { inRepo(cmd, a, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }); results.push(`- [x] ${navn}`); return true; }
  catch (e) { results.push(`- [ ] ${navn} FEJLEDE`); console.error(String(e.stdout || '') + String(e.stderr || '')); return false; }
};
console.log('Installerer og tester ...');
const ok = run('npm ci', 'npm', ['ci', '--no-audit', '--no-fund'])
  && run('Unit-tests (formular, CRM, samtykke)', 'node', ['--test', 'tests/lead.test.mjs', 'tests/crm.test.mjs', 'tests/consent.test.mjs'])
  && run(`Bygning af ${kunde}`, 'npx', ['astro', 'build'], { KUNDE: kunde, MODE: 'test', WORKERS_CI: '' });
let rapport = '';
try { rapport = fs.readFileSync(path.join(dir, 'rapport', `${kunde}.txt`), 'utf8').split('\n').filter(l => l.startsWith('ADVARSEL')).slice(0, 15).join('\n'); } catch { /* */ }

// Ændringslog mellem versionerne.
let log = '';
try {
  const all = fs.readFileSync(path.join(tpl, 'CHANGELOG.md'), 'utf8');
  const parts = all.split(/^## /m).slice(1);
  log = parts.filter(p => { const v = p.split(/[\s(]/)[0]; return fra === 'ukendt' || v.localeCompare(fra, undefined, { numeric: true }) > 0; }).map(p => '### ' + p.trim()).join('\n\n');
} catch { /* */ }

const body = `Skabelonen opdateres fra **${fra}** til **${version}** (skabelon-commit \`${tplCommit}\`).

Kundens filer er ikke rørt: \`sites/${kunde}/\`, \`wrangler.jsonc\`, \`vaekster.json\` (kun versionsnummeret).
${leaked.length ? `\nFjernet fra andre kunders mapper (hørte ikke til dette repo): ${[...new Set(leaked.map(p => p.split('/')[1]))].join(', ')}.\n` : ''}
**Tjek før fletning**
${results.join('\n')}
- [ ] Preview fra Cloudflare gennemset (se "Workers Builds" under Checks)

${rapport ? `**Advarsler fra byggerapporten**\n\`\`\`\n${rapport}\n\`\`\`\n` : ''}
**Ændringer**
${log || '(ingen ændringslog fundet)'}

<details><summary>Filer</summary>

\`\`\`
${stat.split('\n').slice(-40).join('\n')}
\`\`\`
</details>

Når forslaget flettes, bygger Cloudflare og udgiver kundens side automatisk.${process.env.PR_TRAILER ? '\n\n' + process.env.PR_TRAILER : ''}`;

if (!ok) { console.error('\nTests eller bygning fejlede. Intet er pushet. Mappen ligger her: ' + dir); process.exit(1); }
inRepo('git', ['commit', '--quiet', '-m', `Skabelon ${version}\n\nOpdateret fra ${fra} med scripts/opdater-kunde.mjs (skabelon ${tplCommit}). Kundens filer er ikke rørt.${process.env.COMMIT_TRAILER ? '\n\n' + process.env.COMMIT_TRAILER : ''}`]);
if (dry) { console.log('\n--tørt: intet pushet.\n\n' + body + '\n\nMappe: ' + dir); process.exit(0); }
inRepo('git', ['push', '--quiet', '--force', '-u', 'origin', branch]);
// GitHubs REST API (virker overalt, også hvor GraphQL ikke er tilladt).
const owner = repo.split('/')[0];
const existing = JSON.parse(inRepo('gh', ['api', `repos/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`]))[0];
let url;
if (existing) { inRepo('gh', ['api', '-X', 'PATCH', `repos/${repo}/pulls/${existing.number}`, '-f', `body=${body}`]); url = existing.html_url; }
else url = JSON.parse(inRepo('gh', ['api', `repos/${repo}/pulls`, '-f', `title=Skabelon ${version}`, '-f', `head=${branch}`, '-f', 'base=main', '-f', `body=${body}`])).html_url;
console.log(`\nForslag klar: ${url}\nFlet det, når preview og tjek ser rigtige ud.`);
fs.rmSync(dir, { recursive: true, force: true });
