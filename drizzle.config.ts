import type { Config } from "drizzle-kit";

export default {
  out: "./drizzle",
  schema: "./src/index.ts",
  dialect: "postgresql",
} satisfies Config;
