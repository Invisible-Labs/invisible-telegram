import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertExactSdkDependency,
  assertOnlySdkLockChange,
  sdkInstallSpec,
  validateSdkVersion,
  SDK_PACKAGE_NAME,
} from "./update-sdk-dependency.mjs";

describe("SDK dependency updater", () => {
  it("creates an exact install spec for a dev package", () => {
    assert.equal(
      sdkInstallSpec("0.6.0-devnet.2-dev.123.1"),
      "@invisible-labs/sdk@0.6.0-devnet.2-dev.123.1",
    );
  });

  it("accepts stable and prerelease versions", () => {
    assert.equal(validateSdkVersion("1.2.3"), "1.2.3");
    assert.equal(
      validateSdkVersion("1.2.3-beta.4+build.5"),
      "1.2.3-beta.4+build.5",
    );
  });

  it("rejects tags, ranges, and malformed versions", () => {
    assert.throws(
      () => validateSdkVersion("dev"),
      /Invalid SDK package version/u,
    );
    assert.throws(
      () => validateSdkVersion("^1.2.3"),
      /Invalid SDK package version/u,
    );
    assert.throws(
      () => validateSdkVersion("1.2"),
      /Invalid SDK package version/u,
    );
    assert.throws(
      () => validateSdkVersion("1.2.3-"),
      /Invalid SDK package version/u,
    );
    assert.throws(
      () => validateSdkVersion("01.2.3"),
      /Invalid SDK package version/u,
    );
  });

  it("requires the dependency to be pinned exactly", () => {
    const packageJson = {
      dependencies: { [SDK_PACKAGE_NAME]: "1.2.3-dev.4.5" },
    };
    assert.equal(
      assertExactSdkDependency("1.2.3-dev.4.5", packageJson),
      "1.2.3-dev.4.5",
    );
    assert.throws(
      () => assertExactSdkDependency("1.2.3-dev.4.6", packageJson),
      /must be pinned to 1\.2\.3-dev\.4\.6/u,
    );
  });

  it("allows only the root SDK spec and SDK package entry to change", () => {
    const before = {
      packages: {
        "": { dependencies: { [SDK_PACKAGE_NAME]: "1.2.3-dev.4.5" } },
        [`node_modules/${SDK_PACKAGE_NAME}`]: { version: "1.2.3-dev.4.5" },
        "node_modules/bs58": { version: "6.0.0" },
      },
    };
    const after = {
      packages: {
        "": { dependencies: { [SDK_PACKAGE_NAME]: "1.2.3-dev.4.6" } },
        [`node_modules/${SDK_PACKAGE_NAME}`]: { version: "1.2.3-dev.4.6" },
        "node_modules/bs58": { version: "6.0.0" },
      },
    };
    assert.doesNotThrow(() => assertOnlySdkLockChange(before, after));
  });

  it("rejects unrelated lockfile changes", () => {
    assert.throws(
      () =>
        assertOnlySdkLockChange(
          { packages: { "node_modules/bs58": { version: "6.0.0" } } },
          { packages: { "node_modules/bs58": { version: "6.0.1" } } },
        ),
      /changed non-SDK entries: node_modules\/bs58/u,
    );
  });
});
