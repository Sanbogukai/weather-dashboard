// The upstream cache, on a clock moved by hand: fresh answers, refetching after the TTL, the
// stale fallback and its 6-hour cut-off, shared in-flight fetches, and the size limit. No
// database or network: each "upstream" is a counter.

// Vitest's test functions.
import { describe, expect, it } from 'vitest';
// The code under test, and its stale limit.
import { STALE_MAX_MS, createCache } from '../src/cache.ts';
// The hand-moved clock and the fixed start time.
import { NOW, manualClock } from './helpers.ts';

// A time-to-live for the tests: one minute.
const TTL_MS = 60_000;
// A small size limit, so eviction is easy to reach.
const SMALL_MAX = 2;

// A fake upstream that counts its calls and answers "answer 1", "answer 2" and so on, or
// throws while `failing` is set.
function counter() {
  const state = { calls: 0, failing: false };
  const load = async () => {
    state.calls += 1;
    if (state.failing) throw new Error('upstream down');
    return `answer ${state.calls}`;
  };
  return { state, load };
}

describe('createCache', () => {
  it('serves a fresh answer from memory', async () => {
    const clock = manualClock();
    const cache = createCache({ now: clock.now });
    const upstream = counter();
    const first = await cache.get('k', TTL_MS, upstream.load);
    // Just inside the TTL: no second call.
    clock.advance(TTL_MS - 1);
    const second = await cache.get('k', TTL_MS, upstream.load);
    expect(upstream.state.calls).toBe(1);
    expect(second).toEqual(first);
    expect(first).toEqual({ data: 'answer 1', fetchedAt: NOW.toISOString(), stale: false });
  });

  it('fetches again once the TTL has passed', async () => {
    const clock = manualClock();
    const cache = createCache({ now: clock.now });
    const upstream = counter();
    await cache.get('k', TTL_MS, upstream.load);
    clock.advance(TTL_MS);
    const again = await cache.get('k', TTL_MS, upstream.load);
    expect(again.data).toBe('answer 2');
    // Stamped with the time of the new fetch.
    expect(again.fetchedAt).toBe(clock.now().toISOString());
  });

  it('serves the old answer, marked stale, when a refresh fails', async () => {
    const clock = manualClock();
    const cache = createCache({ now: clock.now });
    const upstream = counter();
    await cache.get('k', TTL_MS, upstream.load);
    // Upstream goes down, and the answer is now old.
    upstream.state.failing = true;
    clock.advance(TTL_MS);
    const fallback = await cache.get('k', TTL_MS, upstream.load);
    expect(fallback).toEqual({ data: 'answer 1', fetchedAt: NOW.toISOString(), stale: true });
  });

  it('gives up on the old answer after 6 hours and passes the failure on', async () => {
    const clock = manualClock();
    const cache = createCache({ now: clock.now });
    const upstream = counter();
    await cache.get('k', TTL_MS, upstream.load);
    upstream.state.failing = true;
    // Exactly 6 hours: still served.
    clock.advance(STALE_MAX_MS);
    expect((await cache.get('k', TTL_MS, upstream.load)).stale).toBe(true);
    // One millisecond more: the failure goes through.
    clock.advance(1);
    await expect(cache.get('k', TTL_MS, upstream.load)).rejects.toThrow('upstream down');
  });

  it('passes the failure on when there is no old answer', async () => {
    const cache = createCache({ now: manualClock().now });
    const upstream = counter();
    upstream.state.failing = true;
    await expect(cache.get('k', TTL_MS, upstream.load)).rejects.toThrow('upstream down');
  });

  it('shares one fetch between requests that arrive while it is out', async () => {
    const cache = createCache({ now: manualClock().now });
    const upstream = counter();
    // Three requests before the first fetch has answered.
    const answers = await Promise.all([
      cache.get('k', TTL_MS, upstream.load),
      cache.get('k', TTL_MS, upstream.load),
      cache.get('k', TTL_MS, upstream.load),
    ]);
    expect(upstream.state.calls).toBe(1);
    expect(answers.map((answer) => answer.data)).toEqual(['answer 1', 'answer 1', 'answer 1']);
  });

  it('fetches again after a shared fetch failed', async () => {
    const cache = createCache({ now: manualClock().now });
    const upstream = counter();
    upstream.state.failing = true;
    await expect(cache.get('k', TTL_MS, upstream.load)).rejects.toThrow();
    // The failed fetch is not remembered as "out", so the next request tries again.
    upstream.state.failing = false;
    expect((await cache.get('k', TTL_MS, upstream.load)).data).toBe('answer 2');
  });

  it('drops the oldest entry past the size limit', async () => {
    const cache = createCache({ now: manualClock().now, maxEntries: SMALL_MAX });
    const upstream = counter();
    await cache.get('a', TTL_MS, upstream.load);
    await cache.get('b', TTL_MS, upstream.load);
    await cache.get('c', TTL_MS, upstream.load);
    expect(cache.size).toBe(SMALL_MAX);
    // 'b' is still there (no new call); 'a' was dropped (a new call).
    await cache.get('b', TTL_MS, upstream.load);
    const callsBefore = upstream.state.calls;
    await cache.get('a', TTL_MS, upstream.load);
    expect(upstream.state.calls).toBe(callsBefore + 1);
  });
});
