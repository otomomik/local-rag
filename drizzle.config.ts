import type { Config } from "drizzle-kit";

export default {
  out: "./drizzle",
  schema: "./src/db.ts",
  dialect: "postgresql",
} satisfies Config;
