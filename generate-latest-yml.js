const packageJson = require('./package.json');
const os = require("os");
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const crypto = require('crypto');

function sumsha512(filename, encoding = 'hex') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');

    const stream = fs.createReadStream(filename);
    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      const fileHash = hash.digest(encoding);
      resolve(fileHash);
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

exports.default = async function (buildResult) {
  // console.log(packageJson.version);
  // console.log(buildResult.platformToTargets["mac"])

  for (const [platform, platformTarget] of buildResult.platformToTargets) {
    // console.log('Platform:', platform);
    const latest = {
      version: "",
      files: [],
      releaseDate: new Date(),
    }

    for (const [archive, archiveTarget] of platformTarget) {
      if (archive != "zip") {
        continue;
      }
      // console.log('Target Name:', archive);
      // console.log('Target:', archiveTarget);

      for (const archTarget of archiveTarget.packager.platformSpecificBuildOptions.target) {
        for (const arch of archTarget.arch) {
          const name = archiveTarget.packager.platformSpecificBuildOptions.artifactName
            .replace('${productName}', archiveTarget.packager.appInfo.productName)
            .replace('${version}', archiveTarget.packager.appInfo.version)
            .replace('${arch}', arch)
            .replace('${ext}', archive);

          if (latest.version.length == 0) {
            latest.version = archiveTarget.packager.appInfo.version;
          }

          const fullname = path.join(buildResult.outDir, name);
          const size = fs.statSync(fullname)?.size;
          const has512 = await sumsha512(fullname);
          latest.files.push({ name: name, arch: arch, sha512: has512, size: size })
        }
      }
    }

    const latestFilename = `latest-${platform.nodeName}.yml`
    fs.writeFileSync(path.join(buildResult.outDir, latestFilename), YAML.stringify(latest));
  }

  return [""];
}
