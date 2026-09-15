import assert from 'node:assert/strict';
import { hitBucket, requireAiAccess } from '../api/_lib/aiGuard.js';

// Fail closed: no network access is permitted in these API contract tests.
globalThis.fetch = async () => { throw new Error('Unexpected external API request'); };
for (const authorization of [undefined, '', 'Basic invalid']) {
    const result = await requireAiAccess({ headers: { authorization } }, 'text');
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
}
for (const endpoint of ['text', 'stream', 'image', 'grounded']) {
    const { default: handler } = await import(`../api/ai/${endpoint}.js`);
    for (const method of ['GET', 'POST']) {
        let status = 0;
        let body = '';
        const response = {
            set statusCode(value: number) { status = value; },
            setHeader() {},
            end(value: string) { body = value; },
            status(value: number) { status = value; return this; },
            json(value: unknown) { body = JSON.stringify(value); },
        };
        await handler({ method, headers: {}, body: {} }, response);
        assert.equal(status, method === 'GET' ? 405 : 401, `${endpoint} ${method}: ${body}`);
        assert.ok(JSON.parse(body).error);
    }
}
assert.equal(hitBucket('qa-disabled', 0, 1000), 60);
assert.equal(hitBucket('qa-boundary', 2, 1000), 0);
assert.equal(hitBucket('qa-boundary', 2, 1001), 0);
assert.equal(hitBucket('qa-boundary', 2, 1002), 60);
assert.equal(hitBucket('qa-boundary', 2, 61000), 0);
assert.equal(hitBucket('qa-other-user', 2, 1002), 0);
console.log('PASS: anonymous AI endpoints, method rejection, rate-limit boundaries and user isolation');
