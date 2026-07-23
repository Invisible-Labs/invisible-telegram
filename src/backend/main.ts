import { createBackendApp } from "./app.js";
import { config, getBackendApiToken } from "../config.js";
import { InvisibleService } from "./invisible-service.js";

const service = new InvisibleService();

try {
  const app = createBackendApp(service, getBackendApiToken());
  const server = app.listen(config.backendPort, config.backendHost, () => {
    console.log(`Invisible backend is running on port ${config.backendPort}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[backend] received ${signal}, shutting down`);
    server.close(() => service.close());
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[backend] failed to start: ${message}`);
  service.close();
  process.exitCode = 1;
}
