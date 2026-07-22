import type { Server } from "node:http";
import { createBackendApp } from "./backend/app.js";
import { InvisibleService } from "./backend/invisible-service.js";
import {
  config,
  getBackendApiToken,
  getTelegramWebhookBaseUrl,
  getTelegramWebhookSecret,
} from "./config.js";
import { createTelegramBot } from "./telegram/bot.js";
import { BackendClient } from "./telegram/backend-client.js";
import { stopAllTransferPolling } from "./telegram/transfer-monitor.js";
import { createWebApp, TELEGRAM_WEBHOOK_PATH } from "./web-app.js";

const WEBHOOK_SECRET_ERROR =
  "TELEGRAM_WEBHOOK_SECRET is required when a webhook URL is configured";
const WEBHOOK_STARTUP_MESSAGE = "Telegram bot is running with webhook";
const POLLING_STARTUP_MESSAGE = "Telegram bot is running with long polling";
const BACKEND_STARTUP_MESSAGE = "Invisible backend is running on port";

async function start(): Promise<void> {
  const service = new InvisibleService();
  let server: Server | undefined;

  try {
    const backendApiToken = getBackendApiToken();
    const bot = createTelegramBot(
      new BackendClient(config.backendUrl, backendApiToken),
    );
    const webhookBaseUrl = getTelegramWebhookBaseUrl();
    const webhookSecret = getTelegramWebhookSecret();

    if (webhookBaseUrl !== undefined && webhookSecret === undefined) {
      throw new Error(WEBHOOK_SECRET_ERROR);
    }

    const app = createWebApp(
      createBackendApp(service, backendApiToken),
      bot,
      webhookSecret,
    );

    let pollingStarted = false;

    server = await listen(app, config.backendPort, config.backendHost);
    console.log(`${BACKEND_STARTUP_MESSAGE} ${config.backendPort}`);

    const botInfo = await bot.telegram.getMe();
    bot.botInfo = botInfo;

    if (webhookBaseUrl !== undefined) {
      const webhookUrl = `${webhookBaseUrl}${TELEGRAM_WEBHOOK_PATH}`;
      await bot.telegram.setWebhook(webhookUrl, {
        secret_token: webhookSecret,
      });
      console.log(`${WEBHOOK_STARTUP_MESSAGE}: ${TELEGRAM_WEBHOOK_PATH}`);
    } else {
      pollingStarted = true;
      void bot.launch().catch((error: unknown) => {
        reportStartupError("Telegram long polling", error);
        shutdown("telegram launch failure");
      });
      console.log(POLLING_STARTUP_MESSAGE);
    }

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    function shutdown(signal: string): void {
      stopAllTransferPolling();
      if (pollingStarted) {
        try {
          bot.stop(signal);
        } catch (error: unknown) {
          reportStartupError("Telegram shutdown", error);
        }
      }
      server?.close(() => service.close());
    }
  } catch (error: unknown) {
    if (server !== undefined) await close(server);
    service.close();
    throw error;
  }
}

function listen(
  app: ReturnType<typeof createWebApp>,
  port: number,
  host: string,
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      server.off("error", handleError);
      resolve(server);
    });
    const handleError = (error: Error): void => {
      server.off("error", handleError);
      reject(error);
    };
    server.once("error", handleError);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function reportStartupError(component: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[render] ${component} failed: ${message}`);
}

void start().catch((error: unknown) => {
  reportStartupError("service startup", error);
  process.exitCode = 1;
});
