const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const YAML = require('yaml');

function calculateSha512(filename) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(filename);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

exports.default = async function generateUpdateManifest(buildResult) {
  for (const [platform, platformTarget] of buildResult.platformToTargets) {
    const latest = {
      version: '',
      files: [],
      releaseDate: new Date().toISOString(),
    };

    for (const [targetName, archiveTarget] of platformTarget) {
      if (targetName !== 'zip') continue;

      for (const archTarget of archiveTarget.packager.platformSpecificBuildOptions.target) {
        for (const arch of archTarget.arch) {
          const name = archiveTarget.packager.platformSpecificBuildOptions.artifactName
            .replace('${productName}', archiveTarget.packager.appInfo.productName)
            .replace('${version}', archiveTarget.packager.appInfo.version)
            .replace('${arch}', arch)
            .replace('${ext}', 'zip');
          const fullPath = path.join(buildResult.outDir, name);
          if (!fs.existsSync(fullPath)) throw new Error(`Release artifact not found: ${fullPath}`);

          latest.version ||= archiveTarget.packager.appInfo.version;
          latest.files.push({
            name,
            arch,
            sha512: await calculateSha512(fullPath),
            size: fs.statSync(fullPath).size,
          });
        }
      }
    }

    if (!latest.version || latest.files.length === 0) {
      throw new Error(`No zip release artifact generated for ${platform.nodeName}`);
    }

    const manifestPath = path.join(buildResult.outDir, `latest-${platform.nodeName}.yml`);
    fs.writeFileSync(manifestPath, YAML.stringify(latest));
    console.log(`[release] Generated update manifest: ${manifestPath}`);
  }

  return [];
};
