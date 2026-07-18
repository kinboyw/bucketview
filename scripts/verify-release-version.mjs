import { readFileSync } from 'node:fs';

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tagVersion = tag.replace(/^v/, '');

if (!tag || !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  console.error(`Invalid release tag: ${tag || '(empty)'}`);
  process.exit(1);
}

if (tagVersion !== packageJson.version) {
  console.error(`Release tag ${tag} does not match package.json version ${packageJson.version}.`);
  process.exit(1);
}

console.log(`Release version verified: ${packageJson.version}`);
