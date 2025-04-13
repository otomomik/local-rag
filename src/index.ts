import chokidar from "chokidar";
import path from "path";
import { index, pgTable, primaryKey, text, vector } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { vector as pgVector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createHash } from "crypto";
import fs from "fs/promises";
import { and, eq } from "drizzle-orm";
import { LMStudioClient } from "@lmstudio/sdk";
import { fileTypeFromBuffer } from "file-type";

// init
const baseDir = process.argv[2];
const targetDir = process.argv[3];

// db
const pglite = new PGlite({
  dataDir: "./.pglite",
  extensions: { vector: pgVector },
});
const dbClient = drizzle(pglite);

// lmstudio
const lmstudio = new LMStudioClient();

const getEmbedding = async (text: string): Promise<number[]> => {
  const model = await lmstudio.embedding.model("mxbai-embed-large-v1");
  const { embedding } = await model.embed(text);
  return embedding;
};

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
    fileType: text("file_type").notNull(),
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

const getHash = (filePath: string): string => {
  return createHash("sha256").update(filePath).digest("hex");
};

type FileType = "image" | "video" | "audio" | "pdf" | "text" | "other";

const detectFileType = async (buffer: Buffer): Promise<FileType> => {
  const fileType = await fileTypeFromBuffer(buffer.slice(0, 1024));
  if (!fileType) return "other";

  const mime = fileType.mime;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  return "other";
};

const updateFile = async ({
  parentHash,
  absolutePath,
  relativePath,
  logPrefix,
}: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
  logPrefix: string;
}) => {
  console.log(`[${logPrefix}] ${relativePath}`);
  const fileBuffer = await fs.readFile(absolutePath);
  const fileType = await detectFileType(fileBuffer);
  const fileContent = fileBuffer.toString("utf8");
  const fileHash = createHash("sha256").update(fileContent).digest("hex");
  const [existingFile] = await dbClient
    .select()
    .from(filesTable)
    .where(
      and(
        eq(filesTable.parentHash, parentHash),
        eq(filesTable.path, relativePath),
        eq(filesTable.contentHash, fileHash),
      ),
    );

  if (existingFile) {
    console.log(`[SKIP] ${relativePath}`);
    return;
  }

  const contentVector = await getEmbedding(fileContent);
  await dbClient
    .insert(filesTable)
    .values({
      parentHash,
      path: relativePath,
      contentHash: fileHash,
      content: fileContent,
      contentVector,
      fileType,
    })
    .onConflictDoUpdate({
      target: [filesTable.parentHash, filesTable.path],
      set: {
        contentHash: fileHash,
        content: fileContent,
        contentVector,
        fileType,
      },
      setWhere: and(
        eq(filesTable.parentHash, parentHash),
        eq(filesTable.path, relativePath),
      ),
    });
};

const addFile = async (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  await updateFile({ ...params, logPrefix: "ADD" });
};

const changeFile = async (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  await updateFile({ ...params, logPrefix: "CHANGE" });
};

const removeFile = async ({
  parentHash,
  absolutePath,
  relativePath,
}: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  console.log(`[REMOVE] ${relativePath}`);

  await dbClient
    .delete(filesTable)
    .where(
      eq(filesTable.parentHash, parentHash) &&
        eq(filesTable.path, relativePath),
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
    .on("add", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      await addFile({ parentHash, absolutePath, relativePath });
    })
    .on("change", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      await changeFile({ parentHash, absolutePath, relativePath });
    })
    .on("unlink", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      await removeFile({ parentHash, absolutePath, relativePath });
    });
};

if (!!baseDir && !!targetDir) {
  main();
}
