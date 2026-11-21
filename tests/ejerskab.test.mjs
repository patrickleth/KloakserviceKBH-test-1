// Ét repo pr. kunde: hvem ejer hvilke filer, og bygningen må aldrig tage en anden kundes indhold.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { erKundensFil, erSkabelonFil } from '../scripts/lib/ejerskab.mjs';

test('ejerskab: kundens filer røres aldrig af en opdatering', () => {
  for (const p of ['sites/hansen-vvs/site.json', 'sites/hansen-vvs/components/Kampagne.astro', 'wrangler.jsonc', 'vaekster.json']) assert.ok(erKundensFil(p, 'hansen-vvs'), p);
  for (const p of ['src/components/Hero.astro', 'server/lead-core.mjs', 'package.json', 'sites/eksempel/site.json', 'sites/anden-kunde/site.json']) assert.ok(!erKundensFil(p, 'hansen-vvs'), p);
});

test('ejerskab: skabelonen tager aldrig andre kunders mapper med', () => {
  for (const p of ['src/layouts/Base.astro', 'sites/eksempel/pages/index.md', 'CHANGELOG.md', '.github/workflows/cookie-scan.yml']) assert.ok(erSkabelonFil(p), p);
  for (const p of ['sites/kloakservicekbh/site.json', 'kunder-arkiv/skelbo/site.json', 'wrangler.jsonc', 'vaekster.json']) assert.ok(!erSkabelonFil(p), p);
});

test('manifest: bygning med en anden kunde end repoets stopper', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-'));
  fs.writeFileSync(path.join(dir, 'vaekster.json'), JSON.stringify({ kunde: 'hansen-vvs' }));
  const cfg = path.resolve('src/lib/config.mjs');
  const load = kunde => execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify('file://' + cfg)})`], { cwd: dir, env: { ...process.env, KUNDE: kunde }, stdio: 'pipe' });
  assert.throws(() => load('anden-kunde'), /tilhører "hansen-vvs"/);
  assert.doesNotThrow(() => load('hansen-vvs'));
  assert.doesNotThrow(() => load('eksempel'), 'demokunden skal kunne bygges til tests');
});
