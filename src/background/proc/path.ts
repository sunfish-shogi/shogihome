import path from "node:path";
import { getAppPath } from "./path-electron.js";

export const electronLicensePath = path.join(
  path.dirname(getAppPath("exe")),
  "LICENSE.electron.txt",
);
export const chromiumLicensePath = path.join(
  path.dirname(getAppPath("exe")),
  "LICENSES.chromium.html",
);
