// Signed and notarized macOS build. Nothing secret lives in the repo:
// - the signing certificate ("Developer ID Application") is found in the login keychain,
// - notarization uses a notarytool keychain profile created once with
//     xcrun notarytool store-credentials cube-crashers --apple-id <you> --team-id <TEAM>
// Override the profile name with APPLE_KEYCHAIN_PROFILE if you used another one.
import { execFileSync, spawnSync } from 'node:child_process';

const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
if (!/Developer ID Application/.test(identities)) {
  console.error('No "Developer ID Application" certificate in the keychain. See README → "Signed macOS builds".');
  process.exit(1);
}
const env = { ...process.env, APPLE_KEYCHAIN_PROFILE: process.env.APPLE_KEYCHAIN_PROFILE || 'cube-crashers' };
const r = spawnSync(
  'npx',
  ['electron-builder', '--mac', '--publish', 'never', '-c.mac.hardenedRuntime=true', '-c.mac.notarize=true', '-c.mac.entitlements=build/entitlements.mac.plist', '-c.mac.entitlementsInherit=build/entitlements.mac.plist'],
  { stdio: 'inherit', env },
);
process.exit(r.status ?? 1);
