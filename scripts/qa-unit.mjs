import { spawnSync } from 'node:child_process';
const checks = ['markdown-shortcuts', 'card-dates', 'card-tasks', 'youtube-study',
  'ai-part-rewrite', 'ai-upstream', 'ai-markdown', 'ai-strategy', 'markdown-tables'];
let failed = false;
for (const check of checks) {
  const result = spawnSync(process.execPath, ['scripts/run-bundled-check.mjs', `scripts/check-${check}.mts`], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
const api = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/check-qa-api.mts'], { stdio: 'inherit' });
process.exitCode = failed || api.status !== 0 ? 1 : 0;
