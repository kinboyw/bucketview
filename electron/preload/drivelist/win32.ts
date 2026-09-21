import { exec } from "node:child_process";
import { DriveDataInterface } from "../types";

let getLogicalDrivesFunc: (() => number) | null | undefined;

function getKernel32LogicalDrives(): number {
  if (getLogicalDrivesFunc === undefined) {
    try {
      const koffi = require('koffi');
      const kernel32 = koffi.load('kernel32.dll');
      // DWORD GetLogicalDrives(void)
      getLogicalDrivesFunc = kernel32.func('__stdcall', 'GetLogicalDrives', 'uint32', []);
    } catch {
      getLogicalDrivesFunc = null;
    }
  }
  return getLogicalDrivesFunc ? getLogicalDrivesFunc() : 0;
}

function getExistingDriveLetters(): DriveDataInterface[] {
  const drives: DriveDataInterface[] = [];
  const bitmask = getKernel32LogicalDrives();
  if (bitmask > 0) {
    for (let i = 0; i < 26; i++) {
      if ((bitmask & (1 << i)) !== 0) {
        const mountpoint = `${String.fromCharCode(65 + i)}:`;
        drives.push({ total: 0, used: 0, available: 0, percentageUsed: 0, mountpoint, name: "" });
      }
    }
  }
  return drives;
}

export const execDriveList = (cb: any) => {
  // 优先通过 Win32 API GetLogicalDrives() 获取，速度仅微秒级且不会阻塞或依赖外部进程
  const fastDrives = getExistingDriveLetters();
  if (fastDrives.length > 0) {
    // 补充查询 net use 获取网络驱动器映射，避免丢失断开状态的网络盘
    exec("net use", { windowsHide: true, timeout: 2000 }, (netUseErr, netUseStdout) => {
      if (!netUseErr && netUseStdout) {
        const netLines = netUseStdout.split("\n");
        for (const line of netLines) {
          const match = line.trim().match(/^(\w+)\s+([A-Z]:)\s+/);
          if (match) {
            const driveLetter = match[2];
            if (!fastDrives.some(d => d.mountpoint === driveLetter)) {
              fastDrives.push({ total: 0, used: 0, available: 0, percentageUsed: 0, mountpoint: driveLetter, name: "" });
            }
          }
        }
      }
      cb(null, fastDrives);
    });
    return;
  }

  // 兜底：使用 net use 与 A-Z 快速推断
  exec("net use", { windowsHide: true, timeout: 3000 }, (_netErr, netUseStdout) => {
    const drives: DriveDataInterface[] = [];
    if (netUseStdout) {
      const netLines = netUseStdout.split("\n");
      for (const line of netLines) {
        const match = line.trim().match(/^(\w+)\s+([A-Z]:)\s+/);
        if (match) {
          const driveLetter = match[2];
          if (!drives.some(d => d.mountpoint === driveLetter)) {
            drives.push({ total: 0, used: 0, available: 0, percentageUsed: 0, mountpoint: driveLetter, name: "" });
          }
        }
      }
    }
    cb(null, drives);
  });
};

