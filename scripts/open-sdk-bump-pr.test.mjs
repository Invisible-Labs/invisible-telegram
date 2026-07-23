import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  allowedChangedFiles,
  sdkBumpBranch,
  sdkBumpCommitMessage,
  sdkBumpPullRequestBody,
  sdkBumpPullRequestTitle,
} from "./open-sdk-bump-pr.mjs";

describe("SDK bump pull request helper", () => {
  it("derives a stable branch and commit name from the exact version", () => {
    const version = "0.6.0-devnet.2-dev.123.1";
    assert.equal(
      sdkBumpBranch(version),
      "automation/sdk-bump-0.6.0-devnet.2-dev.123.1",
    );
    assert.equal(
      sdkBumpCommitMessage(version),
      "chore: bump @invisible-labs/sdk to 0.6.0-devnet.2-dev.123.1",
    );
    assert.equal(
      sdkBumpPullRequestTitle(version),
      sdkBumpCommitMessage(version),
    );
  });

  it("does not put source repository internals in the pull request body", () => {
    const body = sdkBumpPullRequestBody("0.6.0-devnet.2-dev.123.1");
    assert.match(
      body,
      /@invisible-labs\/sdk to 0\.6\.0-devnet\.2-dev\.123\.1/u,
    );
    assert.doesNotMatch(body, /The-JW-Corp|commit|branch|Linear/u);
  });

  it("allows only the two dependency manifests to change", () => {
    assert.deepEqual(
      allowedChangedFiles(["package.json", "package-lock.json"]),
      [],
    );
    assert.deepEqual(allowedChangedFiles(["package.json", "src/main.ts"]), [
      "src/main.ts",
    ]);
  });

  it("assigns automated pull requests to the repository owner", () => {
    const helper = readFileSync(
      new URL("./open-sdk-bump-pr.mjs", import.meta.url),
      "utf8",
    );
    assert.match(helper, /PULL_REQUEST_ASSIGNEE = "JWMatheo"/u);
    assert.match(helper, /"--assignee",\s*PULL_REQUEST_ASSIGNEE/u);
  });
});
