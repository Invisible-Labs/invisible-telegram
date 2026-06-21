import { callTelegramApi, readTelegramBotToken } from "./telegram-api.js";

const botToken = readTelegramBotToken();

await callTelegramApi(botToken, "deleteWebhook", {
  drop_pending_updates: false,
});

console.log("Telegram webhook deleted");
