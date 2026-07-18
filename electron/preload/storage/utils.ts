import nodeFs from 'node:fs';
import nodeCrypto from "node:crypto";

export class MakeProgress {
  private totalBytes = 0;
  private startTime = 0;
  private initialBytes = 0;  // for resume: already downloaded bytes at start

  constructor(totalBytes: number, initialBytes: number = 0) {
    this.totalBytes = totalBytes;
    this.initialBytes = initialBytes;
    this.startTime = Date.now();
  }

  private calculateSpeed(progress: number, elapsed: number): string {
    // For resume: only count new bytes downloaded since resume started
    const newBytes = progress - this.initialBytes;
    const speed = elapsed > 0 ? (newBytes / elapsed) * 1000 : 0;
    if (speed < 1024) {
      return speed.toFixed(2) + ' B/s';
    } else if (speed < 1024 * 1024) {
      return (speed / 1024).toFixed(2) + ' KB/s';
    } else {
      return (speed / (1024 * 1024)).toFixed(2) + ' MB/s';
    }
  }

  private calculateRemainingTime(progress: number, elapsed: number, total: number): string {
    const newBytes = progress - this.initialBytes;
    const speed = elapsed > 0 ? (newBytes / elapsed) * 1000 : 0;
    if (speed <= 0) return '--';
    const remainingBytes = total - progress;
    const remainingSeconds = Math.round(remainingBytes / speed);
    if (remainingSeconds < 60) {
      return remainingSeconds + 's';
    } else if (remainingSeconds < 3600) {
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      return minutes + 'm ' + seconds + 's';
    } else {
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);
      const seconds = remainingSeconds % 60;
      return hours + 'h ' + minutes + 'm ' + seconds + 's';
    }
  }

  get(size: number) {
    const percentage = ((size / this.totalBytes) * 100).toFixed(2);
    const elapsed = Date.now() - this.startTime;
    const speed = this.calculateSpeed(size, elapsed);
    const remaining = this.calculateRemainingTime(size, elapsed, this.totalBytes);
    return { consumedBytes: size, totalBytes: this.totalBytes, percentage, speed, remaining }
  }
}

export class Logger {
  logLevel: string;

  constructor(logLevel: string = 'info') {
    this.logLevel = logLevel;
  }

  debug(...arg: any[]) {
    if (this.logLevel === 'debug') {
      console.log(`[DEBUG]`, ...arg);
    }
  }

  info(...arg: any[]) {
    if (this.logLevel === 'debug' || this.logLevel === 'info') {
      console.log(`[INFO]`, ...arg);
    }
  }

  warn(...arg: any[]) {
    if (this.logLevel === 'debug' || this.logLevel === 'info' || this.logLevel === 'warn') {
      console.warn(`[WARN]`, ...arg);
    }
  }

  error(...arg: any[]) {
    console.error(`[ERROR]`, ...arg);
  }
}

export const md5sum = async (name: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const stream = nodeFs.createReadStream(name);
    const hash = nodeCrypto.createHash('md5');
    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      const md5: string = hash.digest('base64');
      resolve(md5)
    });

    stream.on("error", (err) => {
      reject(err)
    })
  })
}
