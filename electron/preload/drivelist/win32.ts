import { exec, execFile } from "node:child_process";
import nodeFs from "node:fs";
import { DriveDataInterface } from "../types";

function getExistingDriveLetters(): DriveDataInterface[] {
  const drives: DriveDataInterface[] = [];
  for (let code = 65; code <= 90; code++) {
    const mountpoint = `${String.fromCharCode(code)}:`;
    try {
      if (nodeFs.existsSync(`${mountpoint}\\`)) {
        drives.push({ total: 0, used: 0, available: 0, percentageUsed: 0, mountpoint, name: "" });
      }
    } catch {}
  }
  return drives;
}

export const execDriveList = (cb: any) => {
  // PowerShell/CIM is available on supported Windows installations where WMIC may be absent.
  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName | ConvertTo-Json -Compress"],
    { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 },
    (cimErr, cimStdout) => {
      const drives: DriveDataInterface[] = [];

      if (!cimErr && cimStdout) {
        try {
          const parsed = JSON.parse(cimStdout);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            const mountpoint = String(item?.DeviceID || '').trim().toUpperCase();
            if (!/^[A-Z]:$/.test(mountpoint)) continue;
            drives.push({ total: 0, used: 0, available: 0, percentageUsed: 0, mountpoint, name: String(item?.VolumeName || '').trim() });
          }
        } catch {
          // Fall through to net use; an empty result is safer than a false mounted state.
        }
      }

      // PowerShell/CIM can be unavailable in restricted desktop sessions.
      // Keep system and already-created drive letters occupied in that case.
      for (const drive of getExistingDriveLetters()) {
        if (!drives.some(item => item.mountpoint === drive.mountpoint)) drives.push(drive);
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
