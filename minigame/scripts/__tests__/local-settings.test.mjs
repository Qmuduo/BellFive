import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadMiniGameLocalSettings } from '../local-settings.mjs';

async function withSettingsFile(run) {
  const directory = await mkdtemp(join(tmpdir(), 'bellfive-minigame-settings-'));
  const path = join(directory, 'local.settings.json');
  try { await run(path); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('uses simulator localhost endpoints when the ignored settings file is absent', async () => {
  await withSettingsFile(async path => {
    assert.deepEqual(await loadMiniGameLocalSettings(path), {
      authUrl: 'http://localhost:8787',
      socketUrl: 'ws://localhost:8787',
    });
  });
});

test('reads and normalizes local HTTP and WebSocket service URLs', async () => {
  await withSettingsFile(async path => {
    await writeFile(path, JSON.stringify({ authUrl: 'https://api.example.test/', socketUrl: 'wss://rooms.example.test/' }));
    assert.deepEqual(await loadMiniGameLocalSettings(path), {
      authUrl: 'https://api.example.test',
      socketUrl: 'wss://rooms.example.test',
    });
  });
});

test('rejects a service URL with the wrong protocol', async () => {
  await withSettingsFile(async path => {
    await writeFile(path, JSON.stringify({ authUrl: 'ws://api.example.test', socketUrl: 'ws://rooms.example.test' }));
    await assert.rejects(loadMiniGameLocalSettings(path), /authUrl must use http or https/);
  });
});

test('rejects service URLs containing credentials or route paths', async () => {
  await withSettingsFile(async path => {
    await writeFile(path, JSON.stringify({ authUrl: 'https://user:pass@api.example.test/auth', socketUrl: 'wss://rooms.example.test' }));
    await assert.rejects(loadMiniGameLocalSettings(path), /authUrl must be a base URL without credentials, path, query, or fragment/);
  });
});
