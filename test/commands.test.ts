import { describe, expect, it, vi } from "vitest";

vi.mock("../src/sdk-basics.js", () => ({
  openAttestedSession: vi.fn(async () => ({ close: vi.fn(), session: {} })),
  requestPrivateRefund: vi.fn(async () => ({ kind: "accepted" })),
  runLocalSdkUtilityCheck: vi.fn(async () => ({
    storageKind: "memory",
    recoveryCodeHexLength: 64,
    refundableLamports: 1_995_000,
  })),
  runPrivateTransfer: vi.fn(async () => ({ swapId: "swap_1" })),
}));

vi.mock("../src/config.js", () => ({
  loadCoordinatorPool: vi.fn(() => ({ endpoints: [] })),
  mutationsEnabled: vi.fn(() => false),
}));

describe("Telegram commands", () => {
  it("reports SDK local utility coverage", async () => {
    const { handleCommand } = await import("../src/bot.js");
    await expect(handleCommand("/sdk")).resolves.toContain("SDK utilities OK");
  });

  it("fails closed for mutating commands by default", async () => {
    const { handleCommand } = await import("../src/bot.js");
    await expect(handleCommand("/private_transfer 100 address")).resolves.toContain(
      "Live SDK mutations are disabled",
    );
  });
});
