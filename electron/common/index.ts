
import nodeOs from "node:os";

export class Platform {
  public static macos(): boolean {
    return nodeOs.type() == "Darwin";
  }
  public static linux(): boolean {
    return nodeOs.type() == "Linux";
  }
  public static windows(): boolean {
    return nodeOs.type() == "Windows_NT";
  }
}


export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
}
