import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { ESLint } from 'eslint';

// Virtual controls exercise the real config without adding invalid source files
// or changing the lint policy. Run from beta/: node qa/scrum-56/verify-lint-coverage.mjs
const eslint = new ESLint();
const files = [
  'e2e/diagnostics/ai-audit/case-studies.spec.ts',
  'qa/editor-document-checks.tsx',
  'qa/scrum-37/playwright.config.ts',
];
const records = [];
for (const filePath of files) {
  const ignored = await eslint.isPathIgnored(filePath);
  assert.equal(ignored, false, `${filePath} must remain in lint scope`);
  const config = await eslint.calculateConfigForFile(filePath);
  const rule = config.rules['@typescript-eslint/no-explicit-any'];
  assert.equal(rule[0], 2, `${filePath} must reject explicit any`);
  const [invalid] = await eslint.lintText(
    'export const gateProbe = (value: any): unknown => value;\n', { filePath },
  );
  assert.equal(invalid.messages.filter(message =>
    message.ruleId === '@typescript-eslint/no-explicit-any' && message.severity === 2,
  ).length, 1, `${filePath} negative control must fail`);
  const [valid] = await eslint.lintText(
    'export const gateProbe = (value: unknown): unknown => value;\n', { filePath },
  );
  assert.equal(valid.errorCount, 0, `${filePath} typed control must pass`);
  assert.equal(valid.warningCount, 0, `${filePath} typed control must have no warnings`);
  const [actual] = await eslint.lintFiles([filePath]);
  assert.equal(actual.errorCount, 0, `${filePath} actual source must pass`);
  assert.equal(actual.warningCount, 0, `${filePath} actual source must have no warnings`);
  records.push({ filePath, ignored, noExplicitAny: rule, negativeControl: invalid.messages,
    typedControl: { errors: valid.errorCount, warnings: valid.warningCount },
    actualSource: { errors: actual.errorCount, warnings: actual.warningCount } });
}
writeFileSync('qa/scrum-56/lint-coverage.json', JSON.stringify({
  command: 'node qa/scrum-56/verify-lint-coverage.mjs',
  finishedAt: new Date().toISOString(), passed: true, records,
}, null, 2) + '\n');
console.log(`PASS ${records.length} lint targets: included, rule active, invalid control rejected, typed control and actual source clean.`);
