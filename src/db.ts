import { index, pgTable, primaryKey, text, vector } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { vector as pgVector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { dbConfig } from "./config";

// db
const pglite = new PGlite({
  dataDir: dbConfig.dataDir,
  extensions: { vector: pgVector },
});
export const dbClient = drizzle(pglite);

export const runMigration = async () => {
  await dbClient.execute("CREATE EXTENSION IF NOT EXISTS vector");
  await migrate(dbClient, {
    migrationsFolder: dbConfig.migrationsFolder,
  });
};

export const filesTable = pgTable(
  "files",
  {
    parentHash: text("parent_hash").notNull(),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    content: text("content").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.parentHash, t.path],
    }),
  ],
);

export const fileChunksTable = pgTable(
  "file_chunks",
  {
    parentHash: text("parent_hash").notNull(),
    filePath: text("file_path").notNull(),
    chunkIndex: text("chunk_index").notNull(),
    content: text("content").notNull(),
    contentVector: vector("content_vector", {
      dimensions: 1024,
    }).notNull(),
    contentSearch: text("content_search").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.parentHash, t.filePath, t.chunkIndex],
    }),
    index("chunk_vector_index").using(
      "hnsw",
      t.contentVector.op("vector_cosine_ops"),
    ),
    index("chunk_search_index").using(
      "gin",
      sql`to_tsvector('simple', ${t.contentSearch})`,
    ),
  ],
);
