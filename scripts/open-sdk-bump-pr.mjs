#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  assertExactSdkDependency,
  SDK_PACKAGE_NAME,
  validateSdkVersion,
} from "./update-sdk-dependency.mjs";

const TARGET_REPOSITORY = "Invisible-Labs/invisible-telegram";
const BASE_BRANCH = "main";
const BRANCH_PREFIX = "automation/sdk-bump-";
const ALLOWED_CHANGED_FILES = new Set(["package.json", "package-lock.json"]);
const COMMIT_MESSAGE_PREFIX = "chore: bump";
const PULL_REQUEST_ASSIGNEE = "JWMatheo";
const PULL_REQUEST_LABEL = "infra";
const GIT_STATUS_PATH_PREFIX = /^.{2} /u;

export function sdkBumpBranch(value) {
  const version = validateSdkVersion(value);
  return `${BRANCH_PREFIX}${version.replaceAll("+", "-build-")}`;
}

export function sdkBumpCommitMessage(value) {
  return `${COMMIT_MESSAGE_PREFIX} ${SDK_PACKAGE_NAME} to ${validateSdkVersion(value)}`;
}

export function sdkBumpPullRequestTitle(value) {
  return sdkBumpCommitMessage(value);
}

export function sdkBumpPullRequestBody(value) {
  const version = validateSdkVersion(value);
  return [
    `Update ${SDK_PACKAGE_NAME} to ${version}.`,
    `Why: keep Telegram builds reproducible against the published SDK artifact.`,
    "",
    "Validation run by the SDK dev package bump workflow:",
    "- `npm ci`",
    "- `npm run typecheck`",
    "- `npm run build`",
    "- `npm audit --audit-level=high`",
  ].join("\n");
}

function run(
  command,
  args,
  { capture = false, env = process.env, trimOutput = true } = {},
) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${command} ${args.join(" ")} exited with status ${result.status ?? "unknown"}${detail ? `\n${detail}` : ""}`,
    );
  }
  const output = result.stdout ?? "";
  return trimOutput ? output.trim() : output;
}

function remoteBranchExists(branch) {
  const result = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branch}`],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  return result.status === 0;
}

export function allowedChangedFiles(paths) {
  return paths.filter((path) => !ALLOWED_CHANGED_FILES.has(path));
}

export function parseGitStatusPaths(statusOutput) {
  return statusOutput
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const prefix = line.match(GIT_STATUS_PATH_PREFIX)?.[0];
      if (!prefix) {
        throw new Error(`Unable to parse git status line: ${line}`);
      }
      return line.slice(prefix.length);
    });
}

function workingTreePaths() {
  return parseGitStatusPaths(
    run("git", ["status", "--porcelain=v1"], {
      capture: true,
      trimOutput: false,
    }),
  );
}

function committedPaths() {
  return run("git", ["diff", "--name-only", `origin/${BASE_BRANCH}...HEAD`], {
    capture: true,
  })
    .split(/\r?\n/u)
    .filter(Boolean);
}

function assertAllowedPaths(paths, scope) {
  const unexpected = allowedChangedFiles(paths);
  if (unexpected.length > 0) {
    throw new Error(
      `${scope} contains unexpected files: ${unexpected.join(", ")}`,
    );
  }
}

export function prepareSdkBumpBranch(value) {
  const branch = sdkBumpBranch(value);
  run("git", ["fetch", "origin", BASE_BRANCH, "--depth=1"]);
  if (remoteBranchExists(branch)) {
    run("git", ["fetch", "origin", branch, "--depth=1"]);
    run("git", ["switch", "--force-create", branch, `origin/${branch}`]);
  } else {
    run("git", ["switch", "--force-create", branch, `origin/${BASE_BRANCH}`]);
  }
  return branch;
}

function readPackageJson() {
  return JSON.parse(readFileSync("package.json", "utf8"));
}

function ensureGhToken(env) {
  if (!env.GH_TOKEN) {
    throw new Error(
      "GH_TOKEN is required to create the SDK bump pull request.",
    );
  }
}

export function publishSdkBump(value, { env = process.env } = {}) {
  const version = validateSdkVersion(value);
  const branch = sdkBumpBranch(version);
  assertExactSdkDependency(version, readPackageJson());

  const workingPaths = workingTreePaths();
  assertAllowedPaths(workingPaths, "Working tree");

  if (workingPaths.length > 0) {
    run("git", ["add", "--", ...workingPaths]);
    run("git", ["commit", "-m", sdkBumpCommitMessage(version)]);
  }

  const branchPaths = committedPaths();
  assertAllowedPaths(branchPaths, "SDK bump branch");
  if (branchPaths.length === 0) {
    console.log(
      `SDK ${SDK_PACKAGE_NAME}@${version} is already current; no PR needed.`,
    );
    return { branch, pullRequest: null, changed: false };
  }

  ensureGhToken(env);
  run("git", ["push", "--set-upstream", "origin", branch]);

  const existingPullRequest = run(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      TARGET_REPOSITORY,
      "--state",
      "open",
      "--base",
      BASE_BRANCH,
      "--head",
      branch,
      "--json",
      "number,url",
      "--jq",
      '.[0] | if . then "#\(.number) \(.url)" else "" end',
    ],
    { capture: true, env },
  );
  if (existingPullRequest) {
    console.log(`SDK bump PR already exists: ${existingPullRequest}`);
    return { branch, pullRequest: existingPullRequest, changed: true };
  }

  const pullRequest = run(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      TARGET_REPOSITORY,
      "--base",
      BASE_BRANCH,
      "--head",
      branch,
      "--title",
      sdkBumpPullRequestTitle(version),
      "--body",
      sdkBumpPullRequestBody(version),
      "--assignee",
      PULL_REQUEST_ASSIGNEE,
      "--label",
      PULL_REQUEST_LABEL,
    ],
    { capture: true, env },
  );
  console.log(`Created SDK bump PR: ${pullRequest}`);
  return { branch, pullRequest, changed: true };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--version") {
      options.version = rest[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (command !== "prepare" && command !== "publish") {
    throw new Error(`Unknown command: ${command ?? "<empty>"}`);
  }
  return { command, ...options };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "prepare") {
    console.log(`Prepared ${prepareSdkBumpBranch(options.version)}.`);
    return;
  }
  publishSdkBump(options.version);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
