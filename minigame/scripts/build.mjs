import { spawn } from 'node:child_process';
import { copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');

async function verifyOutput() {
  await new Promise((resolveExit, reject) => {
    const verifier = spawn(process.execPath, [resolve(root, 'scripts/verify-output.mjs')], {
      stdio: 'inherit',
    });
    verifier.once('error', reject);
    verifier.once('exit', (code) => {
      if (code === 0) resolveExit();
      else reject(new Error(`Mini Game output verification failed (exit ${code}).`));
    });
  });
}

const options = {
  absWorkingDir: root,
  entryPoints: ['src/entry.ts'],
  outfile: resolve(output, 'game.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'BellFiveMiniGame',
  target: 'es2020',
  logLevel: 'info',
  plugins: [{
    name: 'mini-game-output',
    setup(builder) {
      builder.onStart(async () => {
        // This fixed package-local path is the only directory removed by a build.
        await rm(output, { recursive: true, force: true });
      });
      builder.onEnd(async (result) => {
        if (result.errors.length > 0) return;
        await copyFile(resolve(root, 'game.json'), resolve(output, 'game.json'));
        await verifyOutput();
      });
    },
  }],
};

if (process.argv.includes('--watch')) {
  const builder = await context(options);
  await builder.watch();
  const stop = async () => {
    await builder.dispose();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  await build(options);
}
