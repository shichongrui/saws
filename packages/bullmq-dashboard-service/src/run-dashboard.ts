import { startBullMQDashboard } from "./dashboard.js";

const dashboard = startBullMQDashboard();

const shutdown = async () => {
  await dashboard.close();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
