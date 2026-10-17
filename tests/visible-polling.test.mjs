import test from 'node:test';
import assert from 'node:assert/strict';
import { startVisiblePolling } from '../packages/tokens/visible-polling.js';

test('notification polling pauses hidden/offline work, resumes, serializes, and cleans up', async () => {
    const originals = new Map();
    const doc = new EventTarget();
    doc.visibilityState = 'hidden';
    const win = new EventTarget();
    const nav = { onLine: true };
    let tick;
    let cleared = false;
    const overrides = {
        document: doc, window: win, navigator: nav,
        setInterval: (fn, delay) => { assert.equal(delay, 60_000); tick = fn; return 123; },
        clearInterval: (id) => { assert.equal(id, 123); cleared = true; },
    };
    for (const [key, value] of Object.entries(overrides)) {
        originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    let calls = 0;
    let release;
    let stop;
    try {
        stop = startVisiblePolling(() => {
            calls++;
            return new Promise((resolve) => { release = resolve; });
        }, 60_000);
        await tick();
        assert.equal(calls, 0, 'hidden mount and ticks do not request');
        doc.visibilityState = 'visible';
        doc.dispatchEvent(new Event('visibilitychange'));
        assert.equal(calls, 1, 'foreground transition refreshes immediately');
        await tick();
        win.dispatchEvent(new Event('online'));
        assert.equal(calls, 1, 'slow requests never overlap');
        release();
        await settle();
        nav.onLine = false;
        await tick();
        assert.equal(calls, 1, 'offline ticks do not request');
        nav.onLine = true;
        win.dispatchEvent(new Event('online'));
        assert.equal(calls, 2, 'reconnecting refreshes immediately');
        stop();
        assert.equal(cleared, true);
        release();
        await settle();
        doc.dispatchEvent(new Event('visibilitychange'));
        win.dispatchEvent(new Event('online'));
        await tick();
        assert.equal(calls, 2, 'unmount stops all subsequent work');

        let attempts = 0;
        stop = startVisiblePolling(async () => { attempts++; throw new Error('offline'); }, 60_000);
        await settle();
        await tick();
        assert.equal(attempts, 2, 'failure releases the guard for subsequent ticks');
    } finally {
        stop?.();
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
