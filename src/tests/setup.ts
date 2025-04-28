import { getTempPathForTesting } from "@/background/proc/env.js";
import fs from "node:fs";

afterAll(() => {
  fs.rmSync(getTempPathForTesting(), { recursive: true, force: true });
});
