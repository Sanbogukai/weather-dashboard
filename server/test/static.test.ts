// The built client: hashed assets cached for a year, index.html for every page address and
// never cached, the API untouched, and the security headers on every answer.

// describe groups tests; it defines one; expect checks a value; the hooks run around them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Makes a throwaway folder that stands in for client/dist.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// The system's temporary folder.
import { tmpdir } from 'node:os';
// Joins folder and file names.
import { join } from 'node:path';
// Shared set-up and status codes.
import { NOT_FOUND, OK, db, makeApp } from './helpers.ts';

// A tiny stand-in for the Vite build: a page, one hashed script and a favicon.
const PAGE = '<!doctype html><title>Weather & Event Dashboard</title>';
const SCRIPT = 'console.log("app")';
const ASSET = '/assets/index-abc123.js';

// The folder, made once for the file and removed at the end.
const dir = mkdtempSync(join(tmpdir(), 'client-dist-'));

beforeAll(() => {
  // The assets folder, then the three files in it and beside it.
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), PAGE);
  writeFileSync(join(dir, ASSET), SCRIPT);
  writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
});

afterAll(async () => {
  // Removes the throwaway folder (it lives in the system temp folder, not the repo).
  rmSync(dir, { recursive: true, force: true });
  // Closes the connection pool so Vitest can exit.
  await db.$disconnect();
});

describe('built client', () => {
  it('serves index.html at the root, never cached', async () => {
    const { api } = makeApp({ clientDir: dir });
    const res = await api.get('/');
    expect(res.status).toBe(OK);
    expect(res.text).toBe(PAGE);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves index.html for any other page address, so a reload still finds the app', async () => {
    const { api } = makeApp({ clientDir: dir });
    const res = await api.get('/some/page?unit=f');
    expect(res.status).toBe(OK);
    expect(res.text).toBe(PAGE);
  });

  it('serves hashed assets cached for a year', async () => {
    const { api } = makeApp({ clientDir: dir });
    const res = await api.get(ASSET);
    expect(res.status).toBe(OK);
    expect(res.text).toBe(SCRIPT);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('answers a missing asset with a 404, not the page', async () => {
    const { api } = makeApp({ clientDir: dir });
    const res = await api.get('/assets/gone.js');
    expect(res.status).toBe(NOT_FOUND);
    expect(res.text).not.toBe(PAGE);
  });

  it('serves other files such as the favicon', async () => {
    const { api } = makeApp({ clientDir: dir });
    const res = await api.get('/favicon.svg');
    expect(res.status).toBe(OK);
  });

  it('leaves unknown API routes as JSON 404s', async () => {
    const { api } = makeApp({ clientDir: dir });
    const res = await api.get('/api/nope');
    expect(res.status).toBe(NOT_FOUND);
    expect(res.body.error.code).toBe('not_found');
  });

  it('serves no page without a client folder', async () => {
    const { api } = makeApp();
    const res = await api.get('/');
    expect(res.status).toBe(NOT_FOUND);
  });

  it('sends the security headers with the page', async () => {
    const { api } = makeApp({ clientDir: dir });
    const res = await api.get('/');
    // Only the app's own scripts may run.
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
