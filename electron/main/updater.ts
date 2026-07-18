import { WebContents, app } from 'electron';
import { Platform, sleep } from '../common';
import axios from 'axios';
import YAML from 'yaml'
import semver from "semver";
import { DownloaderHelper } from 'node-downloader-helper';
import { UpdateInfo } from '../preload/types';
import nodePath from "node:path";
import nodeOs from "node:os";
import nodeFs from "node:fs";
import nodeProcess from "node:child_process";

// electron-updater 和 electron 自带的autoUpdater都需要签名才能自动更新，只能自己实现一个
class HandlerUpdater {
  // private static instance: HandlerUpdater;
  private updateInfo?: {
    version: string;
    fileName: string;
    feedURL: string;
    downloadPath?: string;
  };

  constructor() {
  }

  // public static getInstance(): HandlerUpdater {
  //   if (!HandlerUpdater.instance) {
  //     HandlerUpdater.instance = new HandlerUpdater();
  //   }
  //   return HandlerUpdater.instance;
  // }

  public async check(contents: WebContents, feedURL: string = process.env.BUCKETVIEW_UPDATE_FEED_URL || ""): Promise<boolean> {
    if (process.env.VITE_DEV_SERVER_URL) {
      return false;
    }
    if (feedURL.trim().length == 0) {
      return false;
    }

    const latest = `latest-${nodeOs.platform()}.yml`
    try {
      const response = await axios.get(`${feedURL}/${latest}`);
      if (response.status != 200) {
        return false;
      }
      const info = YAML.parse(response.data) as UpdateInfo;
      const newReleases = semver.gt(info.version, app.getVersion());
      if (!newReleases) {
        contents.send("handler-updater", {
          cmd: 'update-not-available',
        })
        return false;
      }
      const file = info.files.find(file => file.name.endsWith(".zip") && file.arch == nodeOs.arch());
      if (!file) {
        contents.send("handler-updater", {
          cmd: 'update-not-available',
        })
        return false;
      }

      this.updateInfo = {
        version: info.version,
        fileName: file.name,
        feedURL,
      };
      contents.send("handler-updater", {
        cmd: 'update-available',
        version: info.version,
      });
      return true;
    } catch (error) {
      contents.send("handler-updater", {
        cmd: 'error',
        message: error.message,
      })
      return false;
    }
  }

  public async download(contents: WebContents): Promise<boolean> {
    try {
      if (!this.updateInfo) {
        contents.send("handler-updater", {
          cmd: 'error',
          message: '未找到可下载的更新',
        })
        return false;
      }

      const downloadUrl = `${this.updateInfo.feedURL}/${this.updateInfo.fileName}`;
      const dl = new DownloaderHelper(downloadUrl, nodeOs.tmpdir(), {
        retry: { maxRetries: 20, delay: 30 * 1000 },
        resumeOnIncomplete: true,
        resumeOnIncompleteMaxRetry: 5,
        fileName: this.updateInfo.fileName,
        override: false,
      });

      dl.on("progress.throttled", (stats) => {
        contents.send("handler-updater", {
          cmd: 'download-progress',
          parent: Number(stats.progress.toFixed(2)),
        })
      })

      const state = await dl.start();
      if (state) {
        this.updateInfo.downloadPath = dl.getDownloadPath();
        contents.send("handler-updater", {
          cmd: 'update-downloaded',
          version: this.updateInfo.version,
        });
        return true;
      }

    } catch (error) {
      contents.send("handler-updater", {
        cmd: 'error',
        message: error.message,
      })
      return false;
    }
  }

  public async installDownloaded(contents: WebContents): Promise<boolean> {
    try {
      if (!this.updateInfo?.downloadPath) {
        contents.send("handler-updater", {
          cmd: 'error',
          message: '更新包尚未下载完成',
        })
        return false;
      }

      let resources = nodePath.dirname(app.getAppPath());
      if (process.env.VITE_DEV_SERVER_URL) {
        resources = app.getAppPath();
      }
      let autoUpdaterBin = `autoUpdater-${nodeOs.platform()}-${nodeOs.arch()}${Platform.windows() ? ".exe" : ""}`;
      autoUpdaterBin = nodePath.join(resources, "bin", autoUpdaterBin)

      const currentExe = app.getPath("exe");
      let installPath = nodePath.dirname(currentExe);
      if (Platform.macos()) {
        installPath = "/Applications"
      }
      // windows直接使用autoUpdater会提示进程被占用
      if (Platform.windows()) {
        let newAutoUpdaterBin = nodePath.join(nodeOs.tmpdir(), nodePath.basename(autoUpdaterBin));
        nodeFs.copyFileSync(autoUpdaterBin, newAutoUpdaterBin);
        autoUpdaterBin = newAutoUpdaterBin;
      }

      contents.send("handler-updater", {
        cmd: 'installing',
        version: this.updateInfo.version,
      });

      // 给渲染层一点时间刷新安装提示，再退出当前进程。
      await sleep(500)
      nodeProcess.spawn(autoUpdaterBin, [this.updateInfo.downloadPath, installPath, currentExe], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      return true;
    } catch (error) {
      contents.send("handler-updater", {
        cmd: 'error',
        message: error.message,
      })
      return false;
    }
  }

  // https://github.com/sunzongzheng/electron-updater/tree/master
  // public async quitAndInstall() {
  //   switch (process.platform) {
  //     case 'darwin':
  //       const unzip = exec(`unzip -o '${this.updatePath}' -d '/Applications/'`, { encoding: 'binary' })
  //       unzip.on('exit', () => {
  //         app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) })
  //         app.exit(0)
  //       })
  //       break
  //     case 'win32':
  //       const args = ["--updated"]
  //       args.push("/S")

  //       args.push("--force-run")

  //       const spawnOptions = {
  //         detached: true,
  //         stdio: "ignore",
  //       }

  //       try {
  //         spawn(this.updatePath, args, spawnOptions)
  //           .unref()
  //       }
  //       catch (e) {
  //         this.emit('error', e)
  //         console.warn(e)
  //       }

  //       app.exit(0)
  //       break
  //     default:
  //       fs.chmodSync(this.updatePath, 0o755)
  //       const appImageFile = process.env.APPIMAGE
  //       if (appImageFile == null) {
  //         this.emit('error', "APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND")
  //       }

  //       // https://stackoverflow.com/a/1712051/1910191
  //       fs.unlinkSync(appImageFile)

  //       let destination
  //       if (path.basename(this.updatePath) === path.basename(appImageFile)) {
  //         // no version in the file name, overwrite existing
  //         destination = appImageFile
  //       }
  //       else {
  //         destination = path.join(path.dirname(appImageFile), path.basename(this.updatePath))
  //       }

  //       execSync(`mv -f ${this.updatePath} ${destination}`)

  //       app.relaunch({
  //         args: process.argv.slice(1).concat(['--relaunch']),
  //         execPath: destination
  //       })
  //       app.exit(0)
  //       break
  //   }
  // }
}

export const handlerUpdater = new HandlerUpdater();
