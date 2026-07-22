import { Telegraf } from "telegraf";
import { getTelegramBotToken } from "../config.js";
import { BackendClient } from "./backend-client.js";
import { registerTelegramHandlers } from "./command.js";

export function createTelegramBot(backend: BackendClient) {
  const bot = new Telegraf(getTelegramBotToken());

  registerTelegramHandlers(bot, backend);

  return bot;
}
