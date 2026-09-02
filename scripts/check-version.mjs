import { readFile } from "node:fs/promises";

const [packageJson, tauriConfig, cargoToml] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
]);

const packageVersion = JSON.parse(packageJson).version;
const tauriVersion = JSON.parse(tauriConfig).version;
const cargoMatch = cargoToml.match(/^\[package\][\s\S]*?^version = "([^"]+)"/m);
const cargoVersion = cargoMatch?.[1];

if (!packageVersion || !tauriVersion || !cargoVersion) {
  throw new Error("Unable to read every application version.");
}

if (new Set([packageVersion, tauriVersion, cargoVersion]).size !== 1) {
  throw new Error(
    `Version mismatch: package.json=${packageVersion}, tauri.conf.json=${tauriVersion}, Cargo.toml=${cargoVersion}`,
  );
}

console.log(`Version check passed: ${packageVersion}`);
