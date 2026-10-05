/** @jest-environment node */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('an occupied port reaches the generic startup handler and closes the account database', async () => {
  const occupied = createServer();
  const directory = mkdtempSync(join(tmpdir(), 'bellfive-occupied-port-'));
  const databasePath = join(directory, 'accounts.sqlite');
  try {
    await new Promise<void>((done, reject) => {
      occupied.once('error', reject);
      occupied.listen(0, '127.0.0.1', () => done());
    });
    const { port } = occupied.address() as AddressInfo;
    const child = spawn(process.execPath, ['--require', 'tsx/cjs', 'server/src/index.ts'], {
      cwd: resolve(__dirname, '../../..'),
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), BELLFIVE_AUTH_DB_PATH: databasePath },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    child.stderr.setEncoding('utf8').on('data', text => { stderr += text; });
    child.stdout.setEncoding('utf8').on('data', text => { stdout += text; });
    const exitCode = await new Promise<number | null>((done, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('The failed startup process did not exit.'));
      }, 10_000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', code => { clearTimeout(timeout); done(code); });
    });
    expect(exitCode).toBe(1);
    expect(stderr.trim()).toBe('BellFive room and account service failed to start.');
    expect(stdout).toBe('');
    expect(existsSync(databasePath)).toBe(true);
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);
  } finally {
    await new Promise<void>((done, reject) => occupied.close(error => error ? reject(error) : done()));
    rmSync(directory, { recursive: true, force: true });
  }
}, 15_000);
