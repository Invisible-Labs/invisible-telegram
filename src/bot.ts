import type { PayoutSpec } from "@invisible-labs/sdk/user";
import { loadCoordinatorPool, mutationsEnabled } from "./config.js";
import {
  openAttestedSession,
  requestPrivateRefund,
  runLocalSdkUtilityCheck,
  runPrivateTransfer,
} from "./sdk-basics.js";

const TELEGRAM_TOKEN_ENV = "TELEGRAM_BOT_TOKEN";
const BOT_API_BASE = "https://api.telegram.org/bot";
const POLL_TIMEOUT_SECONDS = 30;
const POLL_DELAY_MS = 1_000;
const MUTATION_DISABLED_MESSAGE =
  "Live SDK mutations are disabled. Set INVISIBLE_ENABLE_MUTATIONS=true.";

type TelegramMessage = {
  readonly chat: { readonly id: number };
  readonly text?: string;
};

type TelegramUpdate = {
  readonly update_id: number;
  readonly message?: TelegramMessage;
};

type TelegramResponse<T> = {
  readonly ok: boolean;
  readonly result: T;
};

export async function handleCommand(text: string): Promise<string> {
  const [command, ...args] = text.trim().split(/\s+/);
  const coordinatorPool = loadCoordinatorPool();

  if (command === "/start") {
    return "Invisible SDK Telegram example. Commands: /sdk, /attest, /private_transfer, /refund.";
  }

  if (command === "/sdk") {
    const result = await runLocalSdkUtilityCheck();
    return `SDK utilities OK: storage=${result.storageKind}, recoveryHex=${result.recoveryCodeHexLength}, refundable=${result.refundableLamports}`;
  }

  if (command === "/attest") {
    const handle = await openAttestedSession(coordinatorPool);
    handle.close();
    return "Attested session opened and closed.";
  }

  if (!mutationsEnabled()) return MUTATION_DISABLED_MESSAGE;

  if (command === "/private_transfer") {
    const [lamportsRaw, destinationAddress] = args;
    const amountLamports = Number(lamportsRaw);
    if (!Number.isSafeInteger(amountLamports) || destinationAddress === undefined) {
      return "Usage: /private_transfer <lamports> <destinationAddress>";
    }
    const payoutSpec: PayoutSpec = { mode: "instant", destination_address: destinationAddress };
    const result = await runPrivateTransfer(coordinatorPool, { amountLamports, payoutSpec });
    return `Swap accepted: ${result.swapId}`;
  }

  if (command === "/refund") {
    const [swapId, recoveryCode, syncSecretHex] = args;
    if (swapId === undefined || recoveryCode === undefined) {
      return "Usage: /refund <swapId> <recoveryCodeHex> [syncSecretHex]";
    }
    const result = await requestPrivateRefund(coordinatorPool, {
      swapId,
      recoveryCode,
      syncSecretHex,
    });
    return `Refund result: ${result.kind}`;
  }

  return "Unknown command.";
}

async function main(): Promise<void> {
  const token = process.env[TELEGRAM_TOKEN_ENV];
  if (token === undefined || token.length === 0) {
    throw new Error(`${TELEGRAM_TOKEN_ENV} is required`);
  }

  let offset = 0;
  for (;;) {
    const updates = await telegram<TelegramUpdate[]>(token, "getUpdates", {
      offset,
      timeout: POLL_TIMEOUT_SECONDS,
    });
    for (const update of updates) {
      offset = update.update_id + 1;
      const message = update.message;
      if (message?.text === undefined) continue;
      const reply = await handleCommand(message.text).catch((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      );
      await telegram(token, "sendMessage", { chat_id: message.chat.id, text: reply });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }
}

async function telegram<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${BOT_API_BASE}${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) throw new Error(`Telegram ${method} failed`);
  return payload.result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
