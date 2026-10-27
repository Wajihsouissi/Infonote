import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve once from this file, so root, beta and direct CLI invocations agree.
export const betaRoot = fileURLToPath(new URL('../../', import.meta.url));
const diagnosticsRoot = fileURLToPath(new URL('../../../output/audits/diagnostics/', import.meta.url));

export function diagnosticOutput(group: 'ai-audit' | 'jira', ...segments: string[]): string {
    return resolve(diagnosticsRoot, group, ...segments);
}
