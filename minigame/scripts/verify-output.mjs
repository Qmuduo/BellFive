import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const project = JSON.parse(await readFile(resolve(root, 'project.config.json'), 'utf8'));
const output = resolve(root, project.miniprogramRoot);

assert.equal(project.compileType, 'game');
await access(resolve(output, 'game.js'));
await access(resolve(output, 'game.json'));
JSON.parse(await readFile(resolve(output, 'game.json'), 'utf8'));
