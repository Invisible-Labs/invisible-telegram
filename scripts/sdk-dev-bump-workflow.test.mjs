import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const WORKFLOW_PATH = new URL(
  "../.github/workflows/sdk-dev-bump.yml",
  import.meta.url,
);

describe("SDK dev bump workflow", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");

  it("accepts repository dispatches and manual recovery runs", () => {
    assert.match(workflow, /repository_dispatch:/u);
    assert.match(workflow, /types: \[sdk-dev-published\]/u);
    assert.match(workflow, /workflow_dispatch:/u);
    assert.match(
      workflow,
      /description: Exact @invisible-labs\/sdk version to install/u,
    );
  });

  it("requires write access only for the target branch and pull request", () => {
    assert.match(workflow, /contents: write/u);
    assert.match(workflow, /pull-requests: write/u);
    assert.match(workflow, /cancel-in-progress: false/u);
  });

  it("validates and installs the exact published SDK package", () => {
    assert.match(workflow, /SDK_PRIVATE_PACKAGE_READ_TOKEN/u);
    assert.match(
      workflow,
      /npm view "\$\{SDK_PACKAGE_NAME\}@\$\{SDK_VERSION\}" version/u,
    );
    assert.match(
      workflow,
      /node scripts\/update-sdk-dependency\.mjs --version "\$SDK_VERSION"/u,
    );
    assert.match(
      workflow,
      /node scripts\/update-sdk-dependency\.mjs --check --version "\$SDK_VERSION"/u,
    );
    assert.match(workflow, /npm ci/u);
    assert.match(workflow, /npm run test:automation/u);
    assert.match(workflow, /npm run typecheck/u);
    assert.match(workflow, /npm run build/u);
    assert.match(workflow, /npm audit --audit-level=high/u);
  });

  it("creates an idempotent version-specific pull request", () => {
    assert.match(
      workflow,
      /node scripts\/open-sdk-bump-pr\.mjs prepare --version "\$SDK_VERSION"/u,
    );
    assert.match(
      workflow,
      /node scripts\/open-sdk-bump-pr\.mjs publish --version "\$SDK_VERSION"/u,
    );
    assert.match(
      workflow,
      /invisible-telegram-sdk-bump-\$\{\{ github\.event\.client_payload\.package_version \|\| inputs\.version \}\}/u,
    );
  });
});
