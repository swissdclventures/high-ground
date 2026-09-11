/**
 * sdk-commands build mutates scene.json when it sees @dcl/sdk/network server
 * helpers (isServer / registerMessages). High Ground's live World does not use
 * DCL's Multiplayer Server — desktop and mobile share a round over MessageBus
 * plus the HTTPS live wire. Putting authoritativeMultiplayer on the scene splits
 * those clients. Strip the flag after every build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const scenePath = path.join(root, "scene.json");
const scene = JSON.parse(fs.readFileSync(scenePath, "utf8"));
if ("authoritativeMultiplayer" in scene) {
  delete scene.authoritativeMultiplayer;
  fs.writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
  console.log("[after-build] removed authoritativeMultiplayer from scene.json");
}

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.scripts?.["server-logs"]) {
  delete pkg.scripts["server-logs"];
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log("[after-build] removed sdk-injected server-logs script");
}
