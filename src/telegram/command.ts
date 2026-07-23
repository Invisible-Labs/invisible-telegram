import type { Telegraf } from "telegraf";
import type { BackendClient } from "./backend-client.js";
import {
  CALLBACK,
  START_VIEW_TEXT,
  USER_ACTIONS,
  startView,
} from "./render.js";
import {
  type ActiveTransfer,
  startTransferPolling,
  stopTransferPolling,
  updateTransferMessage,
} from "./transfer-monitor.js";

const ACTION_NOT_READY_TEXT = "🛠️ This action is not connected yet.";
const MISSING_DATA = "⚠️ Missing data from context";
const MISSING_USER = "⚠️ Telegram user information is unavailable.";
const MISSING_CHAT = "⚠️ Telegram chat information is unavailable.";
const NO_ACTIVE_TRANSFER = "🤷 No active transfer for this user.";
const CREATING_TRANSFER_TEXT = "⏳ Creating private transfer...";
const DEPOSIT_DEADLINE_LABEL = "⏰ Deposit before";
const REFUND_SUBMITTING_TEXT = "↩️ Submitting refund request...";
const REFUND_WAITING_TEXT =
  "⏳ Refund request accepted. Waiting for completion...";
const REFUND_FAILED_TEXT = "❌ Failed to request refund.";
const USER_ACTION_CALLBACKS = USER_ACTIONS.map((action) => action.callbackData);

const activeTransfers = new Map<string, ActiveTransfer>();

export function registerTelegramHandlers(
  bot: Telegraf,
  backend: BackendClient,
) {
  bot.start(async (context) => {
    await context.reply(START_VIEW_TEXT, startView());
  });

  bot.action(USER_ACTION_CALLBACKS, async (context) => {
    const callbackQuery = context.callbackQuery;

    if (!("data" in callbackQuery)) {
      await context.reply(MISSING_DATA);
      return;
    }

    await context.answerCbQuery();

    const telegramUserId = context.from ? String(context.from.id) : undefined;
    if (!telegramUserId) {
      await context.reply(MISSING_USER);
      return;
    }

    const chatId = context.chat?.id;
    if (chatId === undefined) {
      await context.reply(MISSING_CHAT);
      return;
    }

    switch (callbackQuery.data) {
      case CALLBACK.CREATE_TRANSFER:
        stopTransferPolling(telegramUserId);
        await context.reply(CREATING_TRANSFER_TEXT);
        try {
          const transfer = await backend.createTransfer(telegramUserId);
          const depositMessage = await context.reply(
            `💸 Private transfer created!\n\n📥 Deposit ${transfer.amountLamports} lamports to:\n${transfer.depositAddress}\n\n${DEPOSIT_DEADLINE_LABEL}: ${new Date(transfer.depositExpiresAtMs).toISOString()}\n\n⏳ Waiting for your deposit...`,
          );
          const activeTransfer: ActiveTransfer = {
            transferId: transfer.transferId,
            chatId,
            messageId: depositMessage.message_id,
          };
          activeTransfers.set(telegramUserId, activeTransfer);
          startTransferPolling(
            backend,
            context.telegram,
            telegramUserId,
            activeTransfer,
            "deposit",
          );
        } catch (error) {
          reportBackendError("create transfer", error);
          await context.reply("❌ Failed to create private transfer.");
        }
        return;

      case CALLBACK.REFUND: {
        const activeTransfer = activeTransfers.get(telegramUserId);
        if (!activeTransfer) {
          await context.reply(NO_ACTIVE_TRANSFER);
          return;
        }

        stopTransferPolling(telegramUserId);
        try {
          await updateTransferMessage(
            context.telegram,
            activeTransfer,
            REFUND_SUBMITTING_TEXT,
          );
          await backend.requestTransferRefund(
            telegramUserId,
            activeTransfer.transferId,
          );
          await updateTransferMessage(
            context.telegram,
            activeTransfer,
            REFUND_WAITING_TEXT,
          );
          startTransferPolling(
            backend,
            context.telegram,
            telegramUserId,
            activeTransfer,
            "refund",
          );
        } catch (error) {
          reportBackendError("request refund", error);
          await updateTransferMessage(
            context.telegram,
            activeTransfer,
            REFUND_FAILED_TEXT,
          );
        }
        return;
      }

      default:
        await context.reply(ACTION_NOT_READY_TEXT);
    }
  });
}

function reportBackendError(action: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[telegram] failed to ${action}: ${message}`);
}
