import { exec } from "node:child_process";
import { DriveDataInterface } from "../types";

export const execDriveList = (cb: any) => {
  // WMIC 获取本地和已连接的逻辑磁盘
  exec(
    "WMIC LOGICALDISK GET Name, VolumeName",
    { windowsHide: true, timeout: 5000 },
    (wmicErr, wmicStdout) => {
      const drives: DriveDataInterface[] = [];

      // 解析 WMIC 结果
      if (!wmicErr && wmicStdout) {
        const lines = wmicStdout
          .replace(/\r\r\n/g, "\n")
          .split("\n")
          .filter((line: string) => line.trim().length > 0)
          .slice(1);
        for (const line of lines) {
          const match = line.trim().match(/^([A-Z]:)\s*(.*)/);
          if (match) {
            drives.push({ total: 0, used: 0, available: 0, percentageUsed: 0, mountpoint: match[1], name: match[2].trim() });
          }
        }
      }

      // net use 转获取断开状态的网络盘（WMIC不会列出它们）
      exec(
        "net use",
        { windowsHide: true, timeout: 5000 },
        (netUseErr, netUseStdout) => {
          if (!netUseErr && netUseStdout) {
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

          try {
            cb(null, drives);
          } catch (e) {
            cb(e);
          }
        }
      );
    }
  );
};
