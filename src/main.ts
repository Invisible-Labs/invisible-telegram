import { createTelegramBot } from "./telegram/bot.js";
import { BackendClient } from "./telegram/backend-client.js";
import { config, getBackendApiToken } from "./config.js";
import { stopAllTransferPolling } from "./telegram/transfer-monitor.js";

const backend = new BackendClient(config.backendUrl, getBackendApiToken());
const bot = createTelegramBot(backend);

bot
  .launch()
  .then(() => {
    console.log("Telegram bot is running");
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Telegram bot failed to start: ${message}`);
    process.exitCode = 1;
  });

process.once("SIGINT", () => {
  stopAllTransferPolling();
  bot.stop("SIGINT");
});
process.once("SIGTERM", () => {
  stopAllTransferPolling();
  bot.stop("SIGTERM");
});
