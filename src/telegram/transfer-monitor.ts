import type { Context } from "telegraf";
import type { BackendClient, TransferStatus } from "./backend-client.js";

const STATUS_POLL_INTERVAL_MS = 5_000;
const AWAITING_DEPOSIT_STATE = "awaiting_deposit";
const FAILED_STATE = "failed";
const REFUNDED_STATE = "refunded";
const EXPIRED_PHASE = "expired";
const REFUNDED_PHASE = "refunded";

export type ActiveTransfer = {
  readonly transferId: string;
  readonly chatId: number;
  messageId: number;
};

type PollMode = "deposit" | "refund";

type TransferPoller = {
  readonly telegramUserId: string;
  readonly activeTransfer: ActiveTransfer;
  readonly backend: BackendClient;
  readonly telegram: Context["telegram"];
  readonly mode: PollMode;
  stopped: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const pollers = new Map<string, TransferPoller>();

export function startTransferPolling(
  backend: BackendClient,
  telegram: Context["telegram"],
  telegramUserId: string,
  activeTransfer: ActiveTransfer,
  mode: PollMode,
): void {
  stopTransferPolling(telegramUserId);

  const poller: TransferPoller = {
    telegramUserId,
    activeTransfer,
    backend,
    telegram,
    mode,
    stopped: false,
  };
  pollers.set(telegramUserId, poller);
  schedulePoll(poller);
}

export function stopTransferPolling(telegramUserId: string): void {
  const poller = pollers.get(telegramUserId);
  if (!poller) return;

  poller.stopped = true;
  if (poller.timer) clearTimeout(poller.timer);
  pollers.delete(telegramUserId);
}

export function stopAllTransferPolling(): void {
  for (const telegramUserId of [...pollers.keys()]) {
    stopTransferPolling(telegramUserId);
  }
}

export async function updateTransferMessage(
  telegram: Context["telegram"],
  activeTransfer: ActiveTransfer,
  text: string,
): Promise<void> {
  try {
    await telegram.editMessageText(
      activeTransfer.chatId,
      activeTransfer.messageId,
      undefined,
      text,
    );
  } catch (error) {
    reportMonitorError("edit transfer message", error);
    const replacement = await telegram.sendMessage(activeTransfer.chatId, text);
    activeTransfer.messageId = replacement.message_id;
  }
}

function schedulePoll(poller: TransferPoller): void {
  if (poller.stopped) return;

  poller.timer = setTimeout(() => {
    void pollTransfer(poller);
  }, STATUS_POLL_INTERVAL_MS);
}

async function pollTransfer(poller: TransferPoller): Promise<void> {
  if (!isCurrentPoller(poller)) return;

  try {
    const status = await poller.backend.getTransferStatus(
      poller.telegramUserId,
      poller.activeTransfer.transferId,
    );
    if (!isCurrentPoller(poller)) return;

    const completion = completionMessage(poller.mode, status);
    if (completion) {
      await updateTransferMessage(
        poller.telegram,
        poller.activeTransfer,
        completion,
      );
      stopTransferPolling(poller.telegramUserId);
      return;
    }
  } catch (error) {
    reportMonitorError("poll transfer status", error);
  }

  if (isCurrentPoller(poller)) schedulePoll(poller);
}

function completionMessage(
  mode: PollMode,
  status: TransferStatus,
): string | undefined {
  if (mode === "deposit") {
    if (hasObservedDeposit(status)) return "✅ Successfully deposited!";
    if (hasTransferExpiredOrFailed(status)) {
      return "⚠️ The transfer expired or failed before the deposit was detected.";
    }
    return undefined;
  }

  if (
    status.state === REFUNDED_STATE ||
    status.settlementPhase === REFUNDED_PHASE
  ) {
    return "✅ Refund completed successfully!";
  }
  if (
    status.state === FAILED_STATE ||
    status.settlementPhase === EXPIRED_PHASE
  ) {
    return "❌ The refund could not be completed.";
  }
  return undefined;
}

function hasObservedDeposit(status: TransferStatus): boolean {
  return (
    status.state !== AWAITING_DEPOSIT_STATE &&
    status.depositAmountLamports >= status.amountLamports
  );
}

function hasTransferExpiredOrFailed(status: TransferStatus): boolean {
  return (
    status.state === FAILED_STATE || status.settlementPhase === EXPIRED_PHASE
  );
}

function isCurrentPoller(poller: TransferPoller): boolean {
  return pollers.get(poller.telegramUserId) === poller && !poller.stopped;
}

function reportMonitorError(action: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[telegram] failed to ${action}: ${message}`);
}
