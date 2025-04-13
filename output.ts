import chokidar from "chokidar";
import path from "path";
import { index, pgTable, primaryKey, text, vector } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { vector as pgVector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createHash } from "crypto";
import fs from "fs/promises";
import { eq } from "drizzle-orm";

// Original file: src/index.ts
import chokidar from "chokidar";
import path from "path";
import { index, pgTable, primaryKey, text, vector } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { vector as pgVector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createHash } from "crypto";
import fs from "fs/promises";
import { eq } from "drizzle-orm";

// init
const baseDir = process.argv[2];
const targetDir = process.argv[3];

// db
const pglite = new PGlite({
  dataDir: "./.pglite",
  extensions: { vector: pgVector },
});
const dbClient = drizzle(pglite);

export const runMigration = async () => {
  await dbClient.execute("CREATE EXTENSION IF NOT EXISTS vector");
  await migrate(dbClient, {
    migrationsFolder: "./drizzle",
  });
};

export const filesTable = pgTable(
  "files",
  {
    parentHash: text("parent_hash").notNull(),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    content: text("content").notNull(),
    contentVector: vector("content_vector", {
      dimensions: 1024,
    }).notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.parentHash, t.path],
    }),
    index("content_vector_index").using(
      "hnsw",
      t.contentVector.op("vector_cosine_ops"),
    ),
  ],
);

// utils
const shouldIgnoreFile = (filePath: string): boolean => {
  const normalizedPath = path.normalize(filePath);
  const pathParts = normalizedPath.split(path.sep);

  // Check if any part of the path starts with . or is node_modules
  return pathParts.some(
    (part) => part.startsWith(".") || part === "node_modules",
  );
};

const addFile = async ({
  parentHash,
  absolutePath,
  relativePath,
}: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  console.log(`[ADD] ${relativePath}`);
  const fileContent = await fs.readFile(absolutePath, "utf8");
  console.log(fileContent);
  const fileHash = createHash("sha256").update(fileContent).digest("hex");

  await dbClient.insert(filesTable).values({
    parentHash,
    path: relativePath,
    contentHash: fileHash,
    content: fileContent,
    contentVector: Array(1024).fill(0),
  });
};

const getHash = (filePath: string): string => {
  return createHash("sha256").update(filePath).digest("hex");
};

const checkFile = async ({
  parentHash,
  absolutePath,
  relativePath,
}: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  console.log(
    await dbClient
      .select()
      .from(filesTable)
      .where(eq(filesTable.parentHash, parentHash)),
  );
};

// main
const main = async () => {
  await runMigration();
  const watchDir = path.isAbsolute(targetDir)
    ? targetDir
    : path.resolve(baseDir, targetDir);

  const watcher = chokidar.watch(watchDir, {
    ignored: (path, stats) => !!stats?.isFile() && shouldIgnoreFile(path),
  });

  const parentHash = getHash(watchDir);

  watcher
    .on("add", (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      addFile({ parentHash, absolutePath, relativePath });
    })
    .on("change", (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      checkFile({ parentHash, absolutePath, relativePath });
    })
    .on("unlink", (absolutePath) =>
      console.log(`[UNLINK] ${absolutePath.slice(watchDir.length + 1)}`),
    );
};

if (!!baseDir && !!targetDir) {
  main();
}

