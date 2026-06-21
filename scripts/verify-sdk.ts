import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const packageSpec = process.env.INVISIBLE_SDK_PACKAGE ?? "npm:@invisible-labs/sdk@0.1.0-dev.1.2";
const privateSdkInstallArgs = ["install", "--omit=dev", "--min-release-age=0"];
const required =
  process.env.VERIFY_SDK_REQUIRED === "1" ||
  Boolean(process.env.INVISIBLE_SDK_PACKAGE) ||
  Boolean(process.env.NPM_TOKEN);
const workspace = join(tmpdir(), `invisible-sdk-verify-${process.pid}`);

await mkdir(workspace, { recursive: true });

try {
  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({ type: "module", dependencies: { "@invisible/sdk": packageSpec } }, null, 2),
  );
  await writeFile(
    join(workspace, ".npmrc"),
    [
      "@invisible:registry=https://npm.pkg.github.com",
      "@invisible-labs:registry=https://npm.pkg.github.com",
      "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}",
      "ignore-scripts=true",
      "",
    ].join("\n"),
  );

  const install = spawnSync("npm", privateSdkInstallArgs, {
    cwd: workspace,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (install.status !== 0) {
    if (required) {
      process.stderr.write(install.stderr);
      process.exit(install.status ?? 1);
    }
    skipUnavailable();
  }

  const verify = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "await import('@invisible/sdk'); await import('@invisible/sdk/user'); await import('@invisible/sdk/lp'); await import('@invisible/sdk/storage'); console.log('sdk imports ok')",
    ],
    { cwd: workspace, encoding: "utf8", stdio: "pipe" },
  );
  if (verify.status !== 0) {
    if (!required) skipUnavailable();
    process.stderr.write(verify.stderr);
    process.exit(verify.status ?? 1);
  }
  process.stdout.write(verify.stdout);
} finally {
  await rm(workspace, { force: true, recursive: true });
}

function skipUnavailable(): never {
  console.log("sdk verification skipped: package is not available yet");
  process.exit(0);
}
