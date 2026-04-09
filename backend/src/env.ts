import "dotenv/config";
import { z, type ZodIssue } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(10),
  TELEGRAM_BOT_USERNAME: z.string().min(3),
  TELEGRAM_CHANNEL_ID: z.string().min(3),

  PUBLIC_WEBAPP_URL: z.string().url(),
  CRON_SECRET: z.string().min(10).optional()
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i: ZodIssue) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("\n");
    throw new Error(message);
  }
  return parsed.data;
}
