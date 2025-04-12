import chokidar from "chokidar";
import path from "path";
import { pgTable, text } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// init
const baseDir = process.argv[2];
const targetDir = process.argv[3];

const watchDir = path.isAbsolute(targetDir) ? targetDir : path.resolve(baseDir, targetDir);

// db
let dbClient: ReturnType<typeof drizzle> | null = null;

export const getDbClient = async () => {
  if (!dbClient) {
    const pglite = new PGlite(".pglite", {
      extensions: {
        vector,
      },
    });
    dbClient = drizzle({ connection: pglite });
  }
  return dbClient;
};

export const runMigration = async () => {
  const dbClient = await getDbClient();
  await migrate(dbClient, {
    migrationsFolder: "./drizzle",
  });
};

export const filesTable = pgTable("files", {
  path: text("path").notNull().primaryKey(),
  content: text("content").notNull(),
});

// utils
const shouldIgnoreFile = (filePath: string): boolean => {
  const normalizedPath = path.normalize(filePath);
  const pathParts = normalizedPath.split(path.sep);

  // Check if any part of the path starts with . or is node_modules
  return pathParts.some(
    (part) => part.startsWith(".") || part === "node_modules",
  );
};

// main
const main = async () => {
  await runMigration();

  const watcher = chokidar.watch(watchDir, {
    ignored: (path, stats) => !!stats?.isFile() && shouldIgnoreFile(path),
  });

  watcher
    .on("add", (path) => console.log(`[ADD] ${path.slice(watchDir.length + 1)}`))
    .on("change", (path) => console.log(`[CHANGE] ${path.slice(watchDir.length + 1)}`))
    .on("unlink", (path) => console.log(`[UNLINK] ${path.slice(watchDir.length + 1)}`));
};


// run
main();
