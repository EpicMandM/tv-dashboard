import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const forge = require('node-forge');
const PackageSigner = require('./vendor/packageSigner.js');

const root = join(import.meta.dir, '..');
const WGT = join(root, 'tv-dashboard.wgt');
const TV_PUSH = '/home/owner/share/tmp/sdk_tools/tv-dashboard.wgt';

function expand(path) {
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

function env(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? expand(value.trim()) : expand(fallback);
}

function die(message) {
  console.error(message);
  process.exit(1);
}

function idsFromConfig() {
  const xml = readFileSync(join(root, 'tizen', 'config.xml'), 'utf8');
  const match = xml.match(/<tizen:application id="([^"]+)" package="([^"]+)"/);
  const appId = match && match[1];
  const packageId = match && match[2];
  if (!appId || !packageId) die('tizen/config.xml: missing tizen:application id/package');
  return { appId, packageId };
}

const ids = idsFromConfig();
const PACKAGE_ID = ids.packageId;
const APP_ID = ids.appId;

function parseP12(file, password) {
  const p12 = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(readFileSync(file).toString('binary')),
    password
  );
  const out = { privateKey: '', certChain: [] };
  for (const contents of p12.safeContents) {
    for (const bag of contents.safeBags) {
      if (bag.type === forge.pki.oids.certBag) {
        const pem = forge.pki.certificateToPem(bag.cert);
        const begin = '-----BEGIN CERTIFICATE-----';
        const end = '-----END CERTIFICATE-----';
        out.certChain.push(pem.slice(pem.indexOf(begin) + begin.length + 1, pem.indexOf(end)));
      } else if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag || bag.type === forge.pki.oids.keyBag) {
        out.privateKey = forge.pki.privateKeyToPem(bag.key);
      }
    }
  }
  if (!out.privateKey) die('No private key in ' + file);
  if (!out.certChain.length) die('No certificates in ' + file);
  return out;
}

function findSdb() {
  const fromEnv = process.env.SDB;
  if (fromEnv) return expand(fromEnv);
  const which = spawnSync('which', ['sdb'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  const fallback = join(homedir(), '.local/opt/tizen-tools/sdb');
  if (existsSync(fallback)) return fallback;
  die('sdb not found. Install Tizen sdb or set SDB=/path/to/sdb');
}

function run(cmd, args, opts) {
  const proc = spawnSync(cmd, args, {
    cwd: opts && opts.cwd,
    encoding: 'utf8'
  });
  const out = String(proc.stdout || '') + String(proc.stderr || '');
  if (proc.status !== 0) {
    console.error(out.trim());
    die(cmd + ' failed (' + String(proc.status) + ')');
  }
  return out;
}

function sdb(args) {
  return run(findSdb(), args);
}

function tvSerial() {
  const ip = process.env.TV_IP;
  if (!ip || !ip.trim()) die('Set TV_IP in .env (see .env.example)');
  return ip.trim() + ':26101';
}

function buildWgt() {
  const dist = join(root, 'dist');
  const tizen = join(root, 'tizen');
  if (!existsSync(join(dist, 'index.html'))) die('Missing dist/. Run bun run build first.');
  if (!existsSync(join(tizen, 'config.xml')) || !existsSync(join(tizen, 'icon.png'))) {
    die('Missing tizen/config.xml or tizen/icon.png');
  }

  const certDir = env('CERT_DIR', '~/tizen-studio-data/SamsungCertificate/Tizen');
  const passwordFile = env('CERT_PASSWORD_FILE', '~/.samsung-tv-cert-password');
  const authorP12 = join(certDir, 'author.p12');
  const distributorP12 = join(certDir, 'distributor.p12');
  if (!existsSync(authorP12) || !existsSync(distributorP12)) {
    die('Samsung certificates not found in ' + certDir);
  }
  if (!existsSync(passwordFile)) die('Missing certificate password file ' + passwordFile);
  const password = readFileSync(passwordFile, 'utf8').trim();

  const staging = join(tmpdir(), 'tv-dashboard-wgt');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  for (const name of readdirSync(dist)) {
    if (name.startsWith('.')) continue;
    copyFileSync(join(dist, name), join(staging, name));
  }
  copyFileSync(join(tizen, 'config.xml'), join(staging, 'config.xml'));
  copyFileSync(join(tizen, 'icon.png'), join(staging, 'icon.png'));

  const signer = new PackageSigner();
  signer.profileInfo.author = parseP12(authorP12, password);
  signer.profileInfo.distributor1 = parseP12(distributorP12, password);
  signer.signPackage(staging);

  if (!existsSync(join(staging, 'author-signature.xml')) || !existsSync(join(staging, 'signature1.xml'))) {
    die('Signing failed: signature xml missing');
  }

  rmSync(WGT, { force: true });
  run('zip', ['-q', '-r', WGT, '.'], { cwd: staging });
  rmSync(staging, { recursive: true, force: true });
  console.log('Signed ' + WGT);
}

function deploy() {
  buildWgt();
  const serial = tvSerial();
  sdb(['connect', serial]);
  sdb(['push', WGT, TV_PUSH]);
  const install = sdb(['shell', '0', 'vd_appinstall', PACKAGE_ID, TV_PUSH]);
  process.stdout.write(install);
  if (install.indexOf('install completed') === -1) die('TV install failed');
  launch();
}

function launch() {
  const serial = tvSerial();
  sdb(['connect', serial]);
  const out = sdb(['shell', '0', 'was_execute', APP_ID]);
  process.stdout.write(out);
}

const cmd = process.argv[2];
if (cmd === 'package') buildWgt();
else if (cmd === 'deploy') deploy();
else if (cmd === 'launch') launch();
else die('Usage: bun scripts/tv.js <package|deploy|launch>');
