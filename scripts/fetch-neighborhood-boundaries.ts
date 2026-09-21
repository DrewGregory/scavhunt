/**
 * @deprecated Use scripts/build-sf-topology.ts instead.
 * Kept so existing docs/commands still work.
 */
import { spawnSync } from "child_process";
import path from "path";

console.warn(
  "fetch-neighborhood-boundaries.ts is deprecated — running build-sf-topology.ts",
);
const result = spawnSync(
  "pnpm",
  ["tsx", path.join(__dirname, "build-sf-topology.ts")],
  { stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(result.status ?? 1);
