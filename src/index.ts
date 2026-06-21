import { createBot } from "./bot.js";
import { readConfig } from "./config.js";
import { createInvisibleClient } from "./sdk.js";
import { startBot } from "./server.js";

const config = readConfig();
await startBot(createBot(config, createInvisibleClient(config)), config);
