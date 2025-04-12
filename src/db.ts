import { pgTable, text } from "drizzle-orm/pg-core";

export const filesTable = pgTable("files", {
  path: text("path").notNull().primaryKey(),
  content: text("content").notNull(),
});
