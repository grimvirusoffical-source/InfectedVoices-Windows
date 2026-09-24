import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {describeCertificate} from './lib/cert.mjs';
import {repoRoot} from './lib/root.mjs';
import {isUnprovisioned} from './lib/sums.mjs';

const PIN = '667ae1cb2edac499b773fb9f688b6b46484a558d';
const sumsPath = path.join(repoRoot, 'release', 'SHA256SUMS.txt');

function runBuild(extraArgs, env = {}) {
  const childEnv = {...process.env, ...env};
  delete childEnv.IV_AUTHENTICODE_PFX;
  delete childEnv.IV_AUTHENTICODE_PASSWORD;
  delete childEnv.IV_AUTHENTICODE_THUMBPRINT;
  Object.assign(childEnv, env);
  return execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'build.mjs'), ...extraArgs], {
    cwd: repoRoot,
    env: childEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function failBuild(extraArgs) {
  try {
    runBuild(extraArgs);
    assert.fail(`${extraArgs.join(' ')} was expected to refuse`);
  } catch (error) {
    assert.equal(error.status, 2);
    return `${error.stdout || ''}\n${error.stderr || ''}`;
  }
}

test('CORE-PIN is the hardened Core release commit', () => {
  assert.equal(fs.readFileSync(path.join(repoRoot, 'CORE-PIN'), 'utf8').trim(), PIN);
  const modules = fs.readFileSync(path.join(repoRoot, '.gitmodules'), 'utf8');
  assert.match(modules, /grimvirusoffical-source\/InfectedVoices\.git/);
  assert.match(modules, /update = none/);
  assert.equal(modules.includes('vendor'), false);
});

test('SHA256SUMS stays UNPROVISIONED and has no digest', () => {
  const text = fs.readFileSync(sumsPath, 'utf8');
  assert.equal(isUnprovisioned(text), true);
});

test('README states the Windows release contract', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  for (const phrase of [
    'parity source',
    'Free',
    'Basic',
    'Pro',
    'SHA-256',
    'GitHub Releases',
    'zipball',
    'Mac .app',
    'UNPROVISIONED',
    PIN,
    'WebView2'
  ]) {
    assert.equal(readme.includes(phrase), true, phrase);
  }
});

test('preload reports an unprovisioned channel and does not fetch', () => {
  const preload = fs.readFileSync(path.join(repoRoot, 'shell', 'ShellPreload.js'), 'utf8');
  assert.match(preload, /unprovisioned/);
  assert.match(preload, /__CORE_PIN__/);
  assert.equal(/fetch\s*\(/.test(preload), false);
  assert.equal(/https?:\/\//.test(preload), false);
});

test('certificate helper refuses an empty environment', () => {
  const result = describeCertificate({});
  assert.equal(result.ok, false);
  assert.match(result.reason, /not provisioned/);
});

test('--sign and --release exit honestly when certs are missing', () => {
  const before = fs.readFileSync(sumsPath, 'utf8');
  for (const flag of ['--sign', '--release']) {
    const output = failBuild([flag]);
    assert.match(output, /Authenticode certificate is not provisioned/);
    assert.match(output, /UNPROVISIONED/);
  }
  assert.equal(fs.readFileSync(sumsPath, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(repoRoot, 'release', 'InfectedVoices-Setup.exe')), false);
});

test('plain build stays unsigned and refuses a missing payload', () => {
  const missing = failBuild([]);
  assert.match(missing, /sync-core\.mjs/);
  assert.equal(fs.existsSync(path.join(repoRoot, 'release', 'publish')), false);
  if (process.platform === 'win32') return;

  const payload = path.join(repoRoot, 'payload');
  fs.mkdirSync(payload, {recursive: true});
  fs.writeFileSync(path.join(payload, 'index.html'), '<meta name="infected-voices-studio" content="0.7.0">');
  fs.writeFileSync(path.join(payload, 'CORE-PIN'), PIN + '\n');
  fs.writeFileSync(path.join(payload, 'PAYLOAD.txt'), 'source=core-browser-dist\nincludes=build:web\n');
  const before = fs.readFileSync(sumsPath, 'utf8');
  try {
    const output = runBuild([]);
    assert.match(output, /not Windows/);
    assert.match(output, /UNPROVISIONED/);
    assert.equal(fs.readFileSync(sumsPath, 'utf8'), before);
    assert.equal(fs.existsSync(path.join(repoRoot, 'release', 'InfectedVoices-Setup.exe')), false);
  } finally {
    fs.rmSync(payload, {recursive: true, force: true});
  }
});

test('scripts do not embed an invented SHA-256 digest', () => {
  for (const relative of ['scripts/build.mjs', 'scripts/sync-core.mjs', 'shell/ShellPreload.js', 'release/SHA256SUMS.txt']) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    assert.equal(/[a-f0-9]{64}/i.test(source), false, relative);
  }
});

test('tracked tree has no installer, EAS project, or raw binary', () => {
  const skip = new Set(['.git', 'core', 'payload', 'node_modules', 'bin', 'obj', 'publish']);
  const banned = /\.(exe|dll|msi|msix|msixbundle|app|ipa|apk|aab|pfx|p12|snk|zip|7z|wasm|node|pdb|nupkg)$/i;
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (banned.test(entry.name) || entry.name === 'eas.json') hits.push(path.relative(repoRoot, full));
    }
  }
  walk(repoRoot);
  assert.deepEqual(hits, []);
  assert.equal(fs.existsSync(path.join(repoRoot, 'eas.json')), false);
  assert.equal(fs.existsSync(path.join(repoRoot, '.eas')), false);
});
