import assert from 'node:assert/strict';
import test from 'node:test';
import { VIEW_PATHS, viewFromAuthRedirect, viewFromPath } from '../src/app/routes.ts';

test('guest routes resolve to their intended views', () => {
    for (const [view, path] of Object.entries(VIEW_PATHS)) {
        if (view === 'home') continue;
        assert.equal(viewFromPath(path, false), view);
        assert.equal(viewFromPath(`${path}/`, false), view);
    }
    assert.equal(viewFromPath('/home', false), 'marketing');
    assert.equal(viewFromPath('/unrecognized', false), 'marketing');
});

test('authenticated root, dashboard and unknown routes resolve consistently', () => {
    assert.equal(viewFromPath('/', true), 'home');
    assert.equal(viewFromPath('/home', true), 'home');
    assert.equal(viewFromPath('/unrecognized', true), 'home');
    assert.equal(viewFromPath('/canvas', true), 'canvas');
});

test('auth redirects distinguish recovery from sign-in', () => {
    assert.equal(viewFromAuthRedirect(new URL('https://example.test/?code=sample')), 'canvas');
    assert.equal(viewFromAuthRedirect(new URL('https://example.test/#access_token=sample')), 'canvas');
    assert.equal(viewFromAuthRedirect(new URL('https://example.test/?type=recovery&code=sample')), 'update-password');
    assert.equal(viewFromAuthRedirect(new URL('https://example.test/#access_token=sample&type=recovery')), 'update-password');
    assert.equal(viewFromAuthRedirect(new URL('https://example.test/')), null);
});
