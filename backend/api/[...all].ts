import type { IncomingMessage, ServerResponse } from "http";
import { loadEnv } from "../src/env.js";
import { buildApp } from "../src/app.js";

let appPromise: Promise<import("fastify").FastifyInstance> | null = null;

async function getApp() {
  if (!appPromise) {
    const env = loadEnv();
    const app = buildApp(env);
    await app.ready();
    appPromise = Promise.resolve(app);
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
