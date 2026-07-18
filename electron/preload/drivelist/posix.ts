import { execFile } from "node:child_process";
import { DriveDataInterface } from "../types";

export const execDriveList = (cb: any) => {
  execFile("df", ["-P", "-k"], { timeout: 5000 }, (err, stdout) => {
    if (err) {
      return err;
    }

    const lines = stdout.split("\n").filter((line: string) => line.length);

    lines.shift();

    const drives = lines.map((line: string) => parse(line));

    try {
      cb(null, drives);
    } catch (e) {
      cb(e);
    }
  });
};

export const parse = (driveLine: string): DriveDataInterface => {
  const matches = driveLine.match(
    /^.+\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+%)\s+([\dA-Za-z\/]*)/
  );

  if (!matches || matches.length !== 6) {
    throw new Error("Unexpected df output: [" + driveLine + "]");
  }

  const total = Number(matches[1]);
  const used = Number(matches[2]);
  const available = Number(matches[3]);
  const percentageUsed = Number(matches[4].replace("%", ""));
  const mountpoint = matches[5];
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
