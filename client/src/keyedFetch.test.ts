// The owner key: made once on first use, replaced once after a 401, renewed by "Start over".
import { describe, expect, it } from 'vitest'
import { createKeyedFetch, type FetchFn, OWNER_HEADER, STORAGE_KEY } from './keyedFetch.ts'

// Status codes the fake server answers with.
const OK = 200
const CREATED = 201
const UNAUTHORIZED = 401

// A Map-backed stand-in for localStorage, optionally holding a key already.
function memoryStorage(initial: string | null = null) {
  const map = new Map<string, string>(initial === null ? [] : [[STORAGE_KEY, initial]])
  return {
    getItem: (name: string) => map.get(name) ?? null,
    setItem: (name: string, value: string) => void map.set(name, value),
  }
}

// A fake server: POST /api/owners hands out key-1, key-2, …; other paths answer 200 only for
// a key in `known`. Every call is recorded as "METHOD url key".
function fakeServer(known: Set<string>) {
  const calls: string[] = []
  const counter = { owners: 0 }
  const fetchFn: FetchFn = async (url, init = {}) => {
    const key = new Headers(init.headers).get(OWNER_HEADER) ?? '-'
    calls.push(`${init.method ?? 'GET'} ${url} ${key}`)
    if (url === '/api/owners') {
      counter.owners += 1
      const fresh = `key-${counter.owners}`
      known.add(fresh)
      return Response.json({ key: fresh }, { status: CREATED })
    }
    return new Response(null, { status: known.has(key) ? OK : UNAUTHORIZED })
  }
  return { calls, counter, fetchFn }
}

describe('createKeyedFetch', () => {
  it('makes one owner for two first requests and keeps its key', async () => {
    const storage = memoryStorage()
    const server = fakeServer(new Set())
    const keyed = createKeyedFetch(storage, server.fetchFn)
    const [list, tags] = await Promise.all([keyed.send('/bookmarks'), keyed.send('/tags')])
    expect([list.status, tags.status]).toEqual([OK, OK])
    expect(server.counter.owners).toBe(1)
    expect(storage.getItem(STORAGE_KEY)).toBe('key-1')
  })

  it('uses a stored key without asking for a new one', async () => {
    const server = fakeServer(new Set(['saved']))
    const keyed = createKeyedFetch(memoryStorage('saved'), server.fetchFn)
    await keyed.send('/tags')
    expect(server.calls).toEqual(['GET /api/tags saved'])
  })

  it('replaces a forgotten key and retries once', async () => {
    const storage = memoryStorage('forgotten')
    const server = fakeServer(new Set())
    const keyed = createKeyedFetch(storage, server.fetchFn)
    const res = await keyed.send('/tags')
    expect(res.status).toBe(OK)
    expect(server.calls).toEqual(['GET /api/tags forgotten', 'POST /api/owners -', 'GET /api/tags key-1'])
    expect(storage.getItem(STORAGE_KEY)).toBe('key-1')
  })

  it('passes a second 401 back instead of looping', async () => {
    const server = fakeServer(new Set())
    // Every request but the owner call is refused, even with the new key.
    const refuseAll: FetchFn = async (url, init) => {
      const res = await server.fetchFn(url, init)
      return url === '/api/owners' ? res : new Response(null, { status: UNAUTHORIZED })
    }
    const keyed = createKeyedFetch(memoryStorage('old'), refuseAll)
    const res = await keyed.send('/tags')
    expect(res.status).toBe(UNAUTHORIZED)
    expect(server.counter.owners).toBe(1)
  })

  it('starts over with a new key', async () => {
    const storage = memoryStorage('old')
    const keyed = createKeyedFetch(storage, fakeServer(new Set(['old'])).fetchFn)
    expect(await keyed.startOver()).toBe('key-1')
    expect(storage.getItem(STORAGE_KEY)).toBe('key-1')
  })
})
