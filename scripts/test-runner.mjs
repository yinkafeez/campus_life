/*
 * npm test — runs the Vitest suite, then re-runs ONLY test files whose worker process crashed
 * (a native exit such as 0xC0000409 on low-memory Windows machines), one file at a time.
 * A failing assertion is never retried: any real test failure fails the run.
 *
 *   npm test                 the whole suite (+ crash re-runs)
 *   npm test -- tests/x.js   pass-through to vitest for chosen files
 */
import { spawn } from 'node:child_process';

const VITEST = ['node_modules/vitest/vitest.mjs', 'run'];
const MAX_RERUNS = 2;

function vitest(args) {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(process.execPath, [...VITEST, ...args], {
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        output += chunk;
        (stream === child.stdout ? process.stdout : process.stderr).write(chunk);
      });
    }
    child.on('exit', (code) => resolve({ code: code ?? 1, output }));
  });
}

// files whose worker died, e.g. "Worker exited unexpectedly ... while running test file C:/…/x.test.js"
const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');
const crashedFiles = (text) => [
  ...new Set(
    [
      ...plain(text).matchAll(
        /Worker exited unexpectedly[^\n]*?running test file (\S+\.test\.js)/g,
      ),
    ].map((m) => m[1]),
  ),
];
// assertion failures look like " FAIL  tests/x.test.js > ..." — those are real
const hasRealFailures = (text) =>
  /^\s*FAIL\s/m.test(plain(text)) || /Tests\s+\d+ failed/.test(plain(text));

const passThrough = process.argv.slice(2);
let { code, output } = await vitest(passThrough);
if (code !== 0 && !hasRealFailures(output)) {
  let crashed = crashedFiles(output);
  for (let round = 1; crashed.length && round <= MAX_RERUNS; round += 1) {
    console.log(
      `\n⚠ ${crashed.length} test file(s) lost their worker process (not a test failure). Re-running one at a time (round ${round}):`,
    );
    const results = [];
    for (const file of crashed) {
      results.push({ file, ...(await vitest([file, '--maxWorkers=1'])) });
    }
    if (results.some((r) => hasRealFailures(r.output))) {
      code = 1;
      crashed = [];
      break;
    }
    const stillFailing = results.filter((r) => r.code !== 0);
    crashed = stillFailing.flatMap((r) => crashedFiles(r.output));
    // failed again for any other reason → a real failure, stop here
    code = stillFailing.length ? 1 : 0;
    if (stillFailing.length && !crashed.length) break;
  }
  console.log(
    code === 0
      ? '\n✓ All test files passed (after re-running crashed workers).'
      : '\n✗ Tests did not pass.',
  );
}
process.exit(code);
