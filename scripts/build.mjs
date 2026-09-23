import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {describeCertificate} from './lib/cert.mjs';
import {repoRoot} from './lib/root.mjs';

const args = process.argv.slice(2);
const release = args.includes('--release');
const sign = args.includes('--sign') || release;
for (const arg of args) {
  if (arg !== '--release' && arg !== '--sign') {
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }
}

const sumsPath = path.join(repoRoot, 'release', 'SHA256SUMS.txt');
const originalSums = fs.readFileSync(sumsPath, 'utf8');
const payloadDir = path.join(repoRoot, 'payload');
const publishDir = path.join(repoRoot, 'release', 'publish');
const setupExe = path.join(repoRoot, 'release', 'InfectedVoices-Setup.exe');
let sumsCommitted = false;

function restoreSums() {
  if (!sumsCommitted) fs.writeFileSync(sumsPath, originalSums);
}

function fail(message, code = 2) {
  console.error(message);
  restoreSums();
  if (fs.existsSync(setupExe)) fs.rmSync(setupExe, {force: true});
  process.exit(code);
}

function requirePayload() {
  const indexPath = path.join(payloadDir, 'index.html');
  const pinPath = path.join(payloadDir, 'CORE-PIN');
  const markerPath = path.join(payloadDir, 'PAYLOAD.txt');
  if (!fs.existsSync(indexPath) || !fs.existsSync(pinPath) || !fs.existsSync(markerPath)) {
    fail('payload/ is missing. Run: node scripts/sync-core.mjs');
  }
  const expected = fs.readFileSync(path.join(repoRoot, 'CORE-PIN'), 'utf8').trim();
  const actual = fs.readFileSync(pinPath, 'utf8').trim();
  if (actual !== expected) {
    fail(`payload/CORE-PIN ${actual} does not match CORE-PIN ${expected}. Re-run: node scripts/sync-core.mjs`);
  }
  const marker = fs.readFileSync(markerPath, 'utf8');
  if (!marker.includes('source=core-browser-dist') || !marker.includes('includes=build:web')) {
    fail('payload/PAYLOAD.txt is not a Core browser payload produced through build:web.');
  }
}

if (sign) {
  const cert = describeCertificate();
  if (!cert.ok) fail(cert.reason);
  if (process.platform !== 'win32') {
    fail('Authenticode signing requires Windows (signtool). No signature, installer, or checksum was written.');
  }
  requirePayload();
  const signtool = findSigntool();
  if (!signtool) {
    fail('signtool.exe was not found. Install the Windows SDK. No signature or checksum was written.');
  }
  if (release) {
    const iscc = findIscc();
    if (!iscc) {
      fail('Inno Setup compiler (ISCC.exe) is not installed. Refusing to treat a folder or zip as the Windows installer. SHA256SUMS.txt stays UNPROVISIONED.');
    }
    if (!commandExists('dotnet')) {
      fail('.NET SDK is not installed. No installer was created. SHA256SUMS.txt stays UNPROVISIONED.');
    }
    try {
      publishPayload(true);
      signTree(signtool, cert, publishDir);
      execFileSync(iscc, [path.join(repoRoot, 'installer', 'InfectedVoices.iss')], {cwd: repoRoot, stdio: 'inherit'});
      if (!fs.existsSync(setupExe)) fail('ISCC did not write release/InfectedVoices-Setup.exe.');
      signFile(signtool, cert, setupExe);
      verifyAuthenticode(signtool, setupExe);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(setupExe)).digest('hex');
      fs.writeFileSync(sumsPath, `${digest}  InfectedVoices-Setup.exe\n`);
      sumsCommitted = true;
      console.log(`Signed installer SHA-256: ${digest}`);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    process.exit(0);
  }

  if (!fs.existsSync(path.join(publishDir, 'InfectedVoices.exe'))) {
    fail('Nothing to sign. Run node scripts/build.mjs on Windows first. No checksum was written.');
  }
  try {
    signTree(signtool, cert, publishDir);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  console.log('Signed files under release/publish. SHA256SUMS.txt stays UNPROVISIONED until --release cuts an installer.');
  process.exit(0);
}

requirePayload();
if (process.platform !== 'win32') {
  console.log('WebView2 publish was not run (this host is not Windows).');
  console.log('No installer was created. release/SHA256SUMS.txt stays UNPROVISIONED.');
  process.exit(0);
}
if (!commandExists('dotnet')) {
  fail('.NET SDK is not installed. No package was created. SHA256SUMS.txt stays UNPROVISIONED.');
}
publishPayload(false);
console.log('Published an unsigned shell to release/publish. This is not a Release.');
console.log('release/SHA256SUMS.txt stays UNPROVISIONED until --release signs an installer.');

function commandExists(name) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(checker, [name], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
}

function publishPayload(selfContained) {
  fs.rmSync(publishDir, {recursive: true, force: true});
  const publishArgs = [
    'publish', path.join(repoRoot, 'shell', 'InfectedVoices.Windows.csproj'),
    '-c', 'Release',
    '-r', 'win-x64',
    '--self-contained', selfContained ? 'true' : 'false',
    '-o', publishDir
  ];
  execFileSync('dotnet', publishArgs, {cwd: repoRoot, stdio: 'inherit'});
  fs.cpSync(payloadDir, path.join(publishDir, 'payload'), {recursive: true});
}

function findSigntool() {
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
  const found = [];
  for (const root of roots) {
    const bin = path.join(root, 'Windows Kits', '10', 'bin');
    if (!fs.existsSync(bin)) continue;
    for (const version of fs.readdirSync(bin)) {
      const candidate = path.join(bin, version, 'x64', 'signtool.exe');
      if (fs.existsSync(candidate)) found.push(candidate);
    }
  }
  found.sort();
  return found.at(-1) || null;
}

function findIscc() {
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
  for (const root of roots) {
    const candidate = path.join(root, 'Inno Setup 6', 'ISCC.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return commandExists('ISCC') ? 'ISCC' : null;
}

function signArgs(cert, file) {
  const common = ['sign', '/fd', 'SHA256', '/tr', 'http://timestamp.digicert.com', '/td', 'SHA256'];
  if (cert.mode === 'pfx') {
    return [...common, '/f', cert.pfx, '/p', process.env.IV_AUTHENTICODE_PASSWORD, file];
  }
  return [...common, '/sha1', cert.thumb, file];
}

function signFile(signtool, cert, file) {
  execFileSync(signtool, signArgs(cert, file), {stdio: 'inherit'});
}

function signTree(signtool, cert, directory) {
  const files = fs.readdirSync(directory).filter(name => /\.(exe|dll)$/i.test(name));
  if (!files.length) fail(`No executables to sign in ${directory}.`);
  for (const name of files) signFile(signtool, cert, path.join(directory, name));
}

function verifyAuthenticode(signtool, file) {
  execFileSync(signtool, ['verify', '/pa', file], {stdio: 'inherit'});
}
