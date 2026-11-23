// Sends API requests with this browser's owner key, getting a key first when there is none.
// The server forgets owners unused for 30 days, so a stored key can stop working: a 401
// answer makes a fresh owner (with the samples again) and the request is sent once more.
// Storage and fetch are passed in, so the tests can run it without a browser or a server.

// The header the server reads the key from, and the localStorage entry it is kept in.
export const OWNER_HEADER = 'X-Owner-Key'
export const STORAGE_KEY = 'weather-dashboard.owner-key'

// 401: the key is missing or the server does not know it.
const HTTP_UNAUTHORIZED = 401

// The part of localStorage used here, so a test can pass a Map-backed stand-in.
export interface KeyStorage {
  getItem(name: string): string | null
  setItem(name: string, value: string): void
}

// The part of fetch used here.
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

// What createKeyedFetch returns.
export interface KeyedFetch {
  // Sends a request to /api + path with the key, retrying once with a new key after a 401.
  send(path: string, init?: RequestInit): Promise<Response>
  // Makes a new owner with the samples, keeps its key and returns it.
  startOver(): Promise<string>
}

// The request options with the key header added to any the caller passed.
function withKey(init: RequestInit, key: string): RequestInit {
  return { ...init, headers: { ...init.headers, [OWNER_HEADER]: key } }
}

// Builds a sender over the given storage and fetch.
export function createKeyedFetch(storage: KeyStorage, fetchFn: FetchFn): KeyedFetch {
  // The key in use, and the owner request in flight if there is one. Two requests at start-up
  // (the list and the first cards) both find no key; sharing one pending request makes one owner, not two.
  const state: { key: string | null; pending: Promise<string> | null } = {
    key: storage.getItem(STORAGE_KEY),
    pending: null,
  }

  // Asks the server for a new owner and keeps its key.
  async function requestOwner(): Promise<string> {
    const res = await fetchFn('/api/owners', { method: 'POST' })
    if (!res.ok) throw new Error(`Could not start a dashboard (${res.status})`)
    const { key } = (await res.json()) as { key: string }
    storage.setItem(STORAGE_KEY, key)
    state.key = key
    return key
  }

  // requestOwner, then clears the shared request once it settles, so a later call can make
  // another. The fetch inside always waits, so this runs after `pending` has been set.
  async function requestOwnerOnce(): Promise<string> {
    try {
      return await requestOwner()
    } finally {
      state.pending = null
    }
  }

  // A new owner, shared by everyone who asks while it is on its way.
  function newOwner(): Promise<string> {
    state.pending ??= requestOwnerOnce()
    return state.pending
  }

  // The key to use now: the stored one, or a new owner's.
  function currentKey(): Promise<string> {
    return state.key === null ? newOwner() : Promise.resolve(state.key)
  }

  // The key to retry with after `stale` got a 401. If another request has already replaced it,
  // that key is used instead of making yet another owner.
  function replaceKey(stale: string): Promise<string> {
    return state.key !== null && state.key !== stale ? Promise.resolve(state.key) : newOwner()
  }

  return {
    async send(path, init = {}) {
      const key = await currentKey()
      const res = await fetchFn(`/api${path}`, withKey(init, key))
      if (res.status !== HTTP_UNAUTHORIZED) return res
      // Once only: a second 401 with a brand-new key is passed back to the caller.
      return fetchFn(`/api${path}`, withKey(init, await replaceKey(key)))
    },
    startOver: newOwner,
  }
}
