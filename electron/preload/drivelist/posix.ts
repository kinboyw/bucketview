import { execFile } from "node:child_process";
import { DriveDataInterface } from "../types";

export const execDriveList = (cb: any) => {
  execFile("df", ["-P", "-k"], { timeout: 5000 }, (err, stdout) => {
    if (err) {
      cb(err, []);
      return;
    }

    const lines = stdout.split("\n").filter((line: string) => line.length);

    lines.shift();

    const drives: DriveDataInterface[] = [];
    for (const line of lines) {
      try { drives.push(parse(line)); } catch { /* Ignore an individual malformed df row. */ }
    }

    try {
      cb(null, drives);
    } catch (e) {
      cb(e);
    }
  });
};

export const parse = (driveLine: string): DriveDataInterface => {
  const matches = driveLine.match(
    /^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+%)\s+(.+)$/
  );

  if (!matches || matches.length !== 7) {
    throw new Error("Unexpected df output: [" + driveLine + "]");
  }

  const total = Number(matches[2]);
  const used = Number(matches[3]);
  const available = Number(matches[4]);
  const percentageUsed = Number(matches[5].replace("%", ""));
  const mountpoint = matches[6].replace(/\\040/g, " ").replace(/\\011/g, "\t");
  const name = mountpoint.split("/").pop();

  return {
    total: total * 1024,
    used: used * 1024,
    available: available * 1024,
    percentageUsed,
    mountpoint,
    name,
  };
};

module.exports = {
  execDriveList,
  parse,
};
