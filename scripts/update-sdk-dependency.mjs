#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SDK_PACKAGE_NAME = "@invisible-labs/sdk";
const NUMERIC_IDENTIFIER = "(?:0|[1-9]\\d*)";
const NON_NUMERIC_IDENTIFIER = "\\d*[A-Za-z-][0-9A-Za-z-]*";
const PRERELEASE_IDENTIFIER = `(?:${NUMERIC_IDENTIFIER}|${NON_NUMERIC_IDENTIFIER})`;
const BUILD_IDENTIFIER = "[0-9A-Za-z-]+";
export const SDK_VERSION_PATTERN = new RegExp(
  `^${NUMERIC_IDENTIFIER}\\.${NUMERIC_IDENTIFIER}\\.${NUMERIC_IDENTIFIER}` +
    `(?:-(?:${PRERELEASE_IDENTIFIER})(?:\\.${PRERELEASE_IDENTIFIER})*)?` +
    `(?:\\+(?:${BUILD_IDENTIFIER})(?:\\.${BUILD_IDENTIFIER})*)?$`,
  "u",
);
const PACKAGE_JSON_PATH = "package.json";
const PACKAGE_LOCK_PATH = "package-lock.json";
const SDK_LOCK_PACKAGE_PATH = `node_modules/${SDK_PACKAGE_NAME}`;

export function validateSdkVersion(value) {
  const version = String(value ?? "").trim();
  if (!SDK_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid SDK package version: ${version || "<empty>"}`);
  }
  return version;
}

export function sdkInstallSpec(value) {
  return `${SDK_PACKAGE_NAME}@${validateSdkVersion(value)}`;
}

export function assertExactSdkDependency(value, packageJson) {
  const version = validateSdkVersion(value);
  const dependencySpec = packageJson?.dependencies?.[SDK_PACKAGE_NAME];
  if (dependencySpec !== version) {
    throw new Error(
      `${SDK_PACKAGE_NAME} must be pinned to ${version}; found ${dependencySpec ?? "<missing>"}.`,
    );
  }
  return version;
}

function withoutSdkRootDependency(rootPackage) {
  const copy = structuredClone(rootPackage ?? {});
  delete copy.dependencies?.[SDK_PACKAGE_NAME];
  delete copy.devDependencies?.[SDK_PACKAGE_NAME];
  delete copy.optionalDependencies?.[SDK_PACKAGE_NAME];
  return copy;
}

export function assertOnlySdkLockChange(beforeLockfile, afterLockfile) {
  const beforePackages = beforeLockfile?.packages ?? {};
  const afterPackages = afterLockfile?.packages ?? {};
  const packagePaths = new Set([
    ...Object.keys(beforePackages),
    ...Object.keys(afterPackages),
  ]);
  const unexpectedPaths = [...packagePaths].filter((packagePath) => {
    if (packagePath === "") {
      return (
        JSON.stringify(
          withoutSdkRootDependency(beforePackages[packagePath]),
        ) !==
        JSON.stringify(withoutSdkRootDependency(afterPackages[packagePath]))
      );
    }
    if (
      packagePath === SDK_LOCK_PACKAGE_PATH ||
      packagePath.startsWith(`${SDK_LOCK_PACKAGE_PATH}/`)
    ) {
      return false;
    }
    return (
      JSON.stringify(beforePackages[packagePath]) !==
      JSON.stringify(afterPackages[packagePath])
    );
  });
  if (unexpectedPaths.length > 0) {
    throw new Error(
      `${PACKAGE_LOCK_PATH} changed non-SDK entries: ${unexpectedPaths.join(", ")}`,
    );
  }
}

function readPackageJson() {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
}

function readPackageLock() {
  return JSON.parse(readFileSync(PACKAGE_LOCK_PATH, "utf8"));
}

function runNpmInstall(version, env) {
  const beforeLockfile = readPackageLock();
  const result = spawnSync(
    "npm",
    ["install", "--save-exact", sdkInstallSpec(version)],
    {
      encoding: "utf8",
      env,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `npm install exited with status ${result.status ?? "unknown"}.`,
    );
  }
  assertOnlySdkLockChange(beforeLockfile, readPackageLock());
}

function parseArgs(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (argument === "--version") {
      options.version = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = validateSdkVersion(options.version);
  if (options.check) {
    assertExactSdkDependency(version, readPackageJson());
    console.log(`Verified ${SDK_PACKAGE_NAME}@${version} is pinned exactly.`);
    return;
  }
  runNpmInstall(version, process.env);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
