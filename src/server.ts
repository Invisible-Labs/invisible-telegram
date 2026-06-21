import { createServer } from "node:http";

import type { Bot } from "grammy";
import { webhookCallback } from "grammy";

import type { AppConfig } from "./config.js";

export async function startBot(bot: Bot, config: AppConfig): Promise<void> {
  bot.catch((error) => {
    console.error("Telegram update failed", {
      updateId: error.ctx.update.update_id,
      message: error.error instanceof Error ? error.error.message : "unknown",
    });
  });

  if (config.webhookUrl) {
    const secretToken = config.telegramWebhookSecret;
    if (!secretToken) throw new Error("TELEGRAM_WEBHOOK_SECRET is required in webhook mode");
    await bot.api.setWebhook(config.webhookUrl, { secret_token: secretToken });
    await startWebhookServer(bot, config.port, secretToken);
    return;
  }

  if (!config.enablePolling) {
    throw new Error("Set WEBHOOK_URL or ENABLE_POLLING=true");
  }

  await bot.start();
}

async function startWebhookServer(bot: Bot, port: number, secretToken: string): Promise<void> {
  const handleUpdate = webhookCallback(bot, "http", { secretToken });
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/webhook") {
      response.writeHead(404).end("not found");
      return;
    }
    await handleUpdate(request, response);
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`Telegram webhook listening on :${port}/webhook`);
}
