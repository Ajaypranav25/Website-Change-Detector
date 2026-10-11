import { z } from "zod";
import { isValidSelector } from "./extract";
import { noiseRulesSchema } from "./noise";

import { MAX_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES } from "./intervals";

export { formatInterval, INTERVAL_OPTIONS, MAX_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES } from "./intervals";

const selectorList = z
  .array(z.string().trim().max(300))
  .max(30)
  .transform((list) => [...new Set(list.filter(Boolean))])
  .refine((list) => list.every(isValidSelector), { message: "One or more CSS selectors are invalid" });

export const createMonitorSchema = z.object({
  url: z.string().trim().min(1, "URL is required").max(2048),
  name: z.string().trim().min(1, "Name is required").max(120),
  intervalMinutes: z.coerce.number().int().min(MIN_INTERVAL_MINUTES).max(MAX_INTERVAL_MINUTES),
  sensitivity: z.coerce.number().int().min(0).max(100).default(50),
});

export const updateMonitorSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    intervalMinutes: z.coerce.number().int().min(MIN_INTERVAL_MINUTES).max(MAX_INTERVAL_MINUTES),
    sensitivity: z.coerce.number().int().min(0).max(100),
    watchSelectors: selectorList,
    ignoreSelectors: selectorList,
    noiseRules: noiseRulesSchema,
    paused: z.boolean(),
  })
  .partial();

export const settingsSchema = z.object({
  emailAlerts: z.boolean(),
  dailyDigest: z.boolean(),
  discordWebhook: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(v), {
      message: "Must be a Discord webhook URL (https://discord.com/api/webhooks/...)",
    }),
  telegramChatId: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || /^-?\d+$/.test(v), { message: "Telegram chat id must be numeric" }),
});
