import { readFile } from 'node:fs/promises';

const defaults = { authUrl: 'http://localhost:8787', socketUrl: 'ws://localhost:8787' };

function normalizeBaseUrl(value, key, protocols) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} must be a non-empty URL.`);
  }
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error(`${key} must be an absolute URL.`); }
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${key} must use ${protocols.map(protocol => protocol.slice(0, -1)).join(' or ')}.`);
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${key} must be a base URL without credentials, path, query, or fragment.`);
  }
  return url.origin;
}

/** Reads only public service endpoints; secrets and other settings are rejected. */
export async function loadMiniGameLocalSettings(path) {
  let content;
  try { content = await readFile(path, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return defaults;
    throw error;
  }

  let settings;
  try { settings = JSON.parse(content); }
  catch { throw new Error('minigame/local.settings.json must contain valid JSON.'); }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('minigame/local.settings.json must be a JSON object.');
  }
  const unknownKeys = Object.keys(settings).filter(key => !['authUrl', 'socketUrl'].includes(key));
  if (unknownKeys.length) {
    throw new Error(`Unsupported Mini Game local setting: ${unknownKeys.join(', ')}.`);
  }
  return {
    authUrl: normalizeBaseUrl(settings.authUrl ?? defaults.authUrl, 'authUrl', ['http:', 'https:']),
    socketUrl: normalizeBaseUrl(settings.socketUrl ?? defaults.socketUrl, 'socketUrl', ['ws:', 'wss:']),
  };
}
