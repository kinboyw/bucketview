import nodeOs from "node:os";
import { ExecException, ExecFileException } from "child_process";
import { execDriveList as win32ExecDriveList } from "./win32";
import { execDriveList as posixExecDriveList } from "./posix";
import { DriveDataInterface } from "../types";

const execDriveList = nodeOs.platform() === "win32" ? win32ExecDriveList : posixExecDriveList;

export const getDriveList = (): Promise<DriveDataInterface[]> => {
  return new Promise((resolve) => {
    execDriveList(
      (
        err: ExecException | ExecFileException | null,
        driveList: DriveDataInterface[]
      ) => resolve(driveList)
    );
  });
};

export const getDriveByName = async (driveName: string) => {
  const driveList = (await getDriveList()) as DriveDataInterface[];

  for (const drive of driveList) {
    if (drive.name === driveName) {
      return drive;
    }
  }

  return null;
};

module.exports = {
  getDriveList,
  getDriveByName,
};
