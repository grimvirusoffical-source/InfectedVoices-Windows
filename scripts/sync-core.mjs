import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {repoRoot} from './lib/root.mjs';

const CORE_URL = 'https://github.com/grimvirusoffical-source/InfectedVoices.git';
const PIN_FILE = path.join(repoRoot, 'CORE-PIN');
const CORE_DIR = path.join(repoRoot, 'core');
const PAYLOAD = path.join(repoRoot, 'payload');
const SPARSE_PATTERNS = [
  '/*',
  '!/*/',
  '/scripts/',
  '/download/',
  '/docs/',
  '/browser-src/',
  '/mobile-src/',
  '/studio/',
  '!eas.json',
  '!EAS-CLOUD-RELEASE.md',
  '!START-EAS-CLOUD-RELEASE.cmd',
  '!/.eas'
];

const pin = fs.readFileSync(PIN_FILE, 'utf8').trim();
if (!/^[0-9a-f]{40}$/.test(pin)) {
  console.error('CORE-PIN must be the 40-character Core commit this shell tracks.');
  process.exit(2);
}

const build = process.argv.includes('--build');
for (const arg of process.argv.slice(2)) {
  if (arg !== '--build') {
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }
}

function git(args, cwd = repoRoot) {
  execFileSync('git', args, {cwd, stdio: 'inherit'});
}

function npm(args, cwd) {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error('Run this command through npm so npm_execpath is available.');
  execFileSync(process.execPath, [cli, ...args], {cwd, stdio: 'inherit', env: process.env});
}

function applySparse(includeVendor) {
  const patterns = includeVendor ? [...SPARSE_PATTERNS, '/vendor/'] : SPARSE_PATTERNS;
  execFileSync('git', ['sparse-checkout', 'set', '--no-cone', '--stdin'], {
    cwd: CORE_DIR,
    input: patterns.join('\n') + '\n',
    stdio: ['pipe', 'inherit', 'inherit']
  });
}

if (!fs.existsSync(path.join(CORE_DIR, '.git'))) {
  fs.rmSync(CORE_DIR, {recursive: true, force: true});
  git(['clone', '--filter=blob:none', '--sparse', '--no-checkout', CORE_URL, 'core']);
}

applySparse(false);
git(['fetch', '--depth', '1', 'origin', pin], CORE_DIR);
git(['checkout', '--detach', pin], CORE_DIR);

const checkedOut = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: CORE_DIR, encoding: 'utf8'}).trim();
if (checkedOut !== pin) {
  console.error(`Core checkout ${checkedOut} does not match CORE-PIN ${pin}.`);
  process.exit(2);
}

if (!build) {
  console.log(`Sparse Core source is checked out at ${pin}.`);
  console.log('vendor/ (DSP archive), ios/, android/, assets/, and EAS are not checked out.');
  console.log('Pass --build to produce payload/. That step uses vendor/ at this same pin and then drops it from the worktree.');
  process.exit(0);
}

applySparse(true);
let buildError = null;
try {
  npm(['ci', '--include=dev', '--ignore-scripts'], CORE_DIR);
  npm(['run', 'build:browser'], CORE_DIR);
  const browserDist = path.join(CORE_DIR, 'browser-dist');
  const indexHtml = fs.readFileSync(path.join(browserDist, 'index.html'), 'utf8');
  if (!indexHtml.includes('content="0.7.0"')) {
    throw new Error('Core browser payload is missing the 0.7.0 studio marker.');
  }
  const getHtml = fs.readFileSync(path.join(browserDist, 'get', 'index.html'), 'utf8');
  if (!getHtml.includes('No Mac .app is published.')) {
    throw new Error('Core /get page no longer states that no Mac .app is published.');
  }
  if (/href\s*=\s*['"][^'"]*zipball/i.test(getHtml)) {
    throw new Error('Core /get page links a source zipball. Refusing to publish that as the Windows installer.');
  }
  fs.rmSync(PAYLOAD, {recursive: true, force: true});
  fs.cpSync(browserDist, PAYLOAD, {recursive: true});
  fs.writeFileSync(path.join(PAYLOAD, 'CORE-PIN'), pin + '\n');
  fs.writeFileSync(
    path.join(PAYLOAD, 'PAYLOAD.txt'),
    [
      'source=core-browser-dist',
      'npm_script=build:browser',
      'includes=build:web',
      `pin=${pin}`,
      'dsp=not-vendored'
    ].join('\n') + '\n'
  );
  console.log(`Wrote payload/ from Core ${pin}. DSP source was not copied into this repository.`);
} catch (error) {
  buildError = error;
} finally {
  applySparse(false);
}
if (buildError) {
  console.error(buildError instanceof Error ? buildError.message : String(buildError));
  process.exit(2);
}
