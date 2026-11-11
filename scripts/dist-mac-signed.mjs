// Signed and notarized macOS build. Nothing secret lives in the repo:
// - the signing certificate ("Developer ID Application") is found in the login keychain,
// - notarization uses a notarytool keychain profile created once with
//     xcrun notarytool store-credentials cube-crashers --apple-id <you> --team-id <TEAM>
// Override the profile name with APPLE_KEYCHAIN_PROFILE if you used another one.
//
// The app is built in a temporary folder: when the project lives in an iCloud-synced folder (Documents,
// Desktop), iCloud tags every file with extended attributes and codesign refuses them ("resource fork,
// Finder information, or similar detritus not allowed"). The finished dmg/zip files are copied to release/.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
if (!/Developer ID Application/.test(identities)) {
  console.error('No "Developer ID Application" certificate in the keychain. See README → "Signed macOS builds".');
  process.exit(1);
}
const out = join(tmpdir(), 'cube-crashers-signed');
rmSync(out, { recursive: true, force: true });
const env = { ...process.env, APPLE_KEYCHAIN_PROFILE: process.env.APPLE_KEYCHAIN_PROFILE || 'cube-crashers' };
const r = spawnSync(
  'npx',
  ['electron-builder', '--mac', '--publish', 'never', `-c.directories.output=${out}`, '-c.mac.hardenedRuntime=true', '-c.dmg.sign=true', '-c.mac.notarize=true', '-c.mac.entitlements=build/entitlements.mac.plist', '-c.mac.entitlementsInherit=build/entitlements.mac.plist'],
  { stdio: 'inherit', env },
);
if (r.status === 0) {
  mkdirSync('release', { recursive: true });
  for (const f of readdirSync(out)) if (/\.(dmg|zip|blockmap)$|^latest-mac\.yml$/.test(f)) copyFileSync(join(out, f), join('release', f));
  console.log(`signed build: ${out} (copied the dmg, zip and latest-mac.yml to release/)`);
}
process.exit(r.status ?? 1);
