import fs from 'node:fs';
import ts from 'typescript';
for (const report of JSON.parse(fs.readFileSync('reports/qa-lint.json', 'utf8'))) {
  const names = new Set(report.messages.filter(m => m.ruleId === '@typescript-eslint/no-unused-vars').map(m => /^'([^']+)'/.exec(m.message)?.[1]));
  if (!names.size) continue;
  let source = fs.readFileSync(report.filePath, 'utf8');
  const ast = ts.createSourceFile(report.filePath, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const remaining = bindings.elements.filter(e => !names.has(e.name.text));
    if (remaining.length === bindings.elements.length) continue;
    edits.push({ start: bindings.getStart(ast), end: bindings.end, text: `{ ${remaining.map(e => e.getText(ast)).join(', ')} }` });
  }
  for (const e of edits.reverse()) source = source.slice(0,e.start)+e.text+source.slice(e.end);
  if (edits.length) fs.writeFileSync(report.filePath, source);
}
