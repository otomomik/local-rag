import chokidar from "chokidar";
import path from "path";
import { index, pgTable, primaryKey, text, vector } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { vector as pgVector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createHash } from "crypto";
import fs from "fs/promises";
import {
  and,
  cosineDistance,
  desc,
  eq,
  getTableColumns,
  like,
  sql,
} from "drizzle-orm";
import { LMStudioClient } from "@lmstudio/sdk";
import { fileTypeFromBuffer } from "file-type";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";

const execAsync = promisify(exec);
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
    contentSearch: text("content_search").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.parentHash, t.path],
    }),
    index("content_vector_index").using(
      "hnsw",
      t.contentVector.op("vector_cosine_ops"),
    ),
    index("content_search_index").using(
      "gin",
      sql`to_tsvector('simple', ${t.contentSearch})`,
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

interface FileProcessor {
  getContent: (params: {
    buffer: Buffer;
    fileName: string;
    absolutePath: string;
  }) => Promise<string | null>;
}

interface FileProcessors {
  [key: string]: FileProcessor;
}

const detectFileType = async (buffer: Buffer): Promise<FileType> => {
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType) return "other";

  const mime = fileType.mime;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  return "other";
};

const getEmbedding = async (
  content: string,
  modelName: string,
): Promise<number[]> => {
  const { stdout } = await execAsync(
    `./scripts/text-to-vector.sh "${content}" "${modelName}"`,
  );

  return JSON.parse(stdout);
};

const fileProcessors: FileProcessors = {
  text: {
    getContent: async ({ buffer }) => buffer.toString("utf8"),
  },
  pdf: {
    getContent: async ({ buffer }) => {
      // TODO: Implement PDF text extraction
      return buffer.toString("utf8");
    },
  },
  image: {
    getContent: async ({ absolutePath }) => {
      const modelName = "mlx-community/gemma-3-27b-it-4bit";
      const prompt =
        "あなたは画像を説明するAIです。この画像について詳しく説明してください。";
      const { stdout } = await execAsync(
        `./scripts/image_to_text.sh "${absolutePath}" "${modelName}" "${prompt}"`,
      );
      return stdout;
    },
  },
  video: {
    getContent: async ({ buffer }) => {
      // TODO: Implement video metadata/frame extraction
      return "video content";
    },
  },
  audio: {
    getContent: async ({ absolutePath }) => {
      const modelName = "mlx-community/whisper-large-v3-turbo";
      const { stdout } = await execAsync(
        `./scripts/audio-to-text.sh ${absolutePath} ${modelName}`,
      );

      return stdout;
    },
  },
  other: {
    getContent: async ({ buffer }) => buffer.toString("utf8"),
  },
};

interface QueueItem {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
  type: "add" | "change" | "unlink";
}

const fileQueue: QueueItem[] = [];
let isProcessing = false;

const processQueue = async () => {
  if (isProcessing || fileQueue.length === 0) return;

  isProcessing = true;
  try {
    const item = fileQueue.shift();
    if (!item) return;

    const { parentHash, absolutePath, relativePath, type } = item;

    if (type === "add") {
      await addFile({ parentHash, absolutePath, relativePath });
    } else if (type === "change") {
      await changeFile({ parentHash, absolutePath, relativePath });
    } else if (type === "unlink") {
      await removeFile({ parentHash, absolutePath, relativePath });
    }
  } finally {
    isProcessing = false;
    // 再帰的に次の処理を実行
    processQueue();
  }
};

const processFile = async (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
  type: "add" | "change";
}) => {
  // start
  console.log(
    `[${params.type.toUpperCase()}]: START -> ${params.relativePath}`,
  );
  const fileBuffer = await fs.readFile(params.absolutePath);
  const fileType = await detectFileType(fileBuffer);
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");

  const [existingFile] = await dbClient
    .select()
    .from(filesTable)
    .where(
      and(
        eq(filesTable.parentHash, params.parentHash),
        eq(filesTable.path, params.relativePath),
        eq(filesTable.contentHash, fileHash),
      ),
    );

  if (existingFile) {
    console.log(`[SKIP] ${params.relativePath}`);
  } else {
    const processor = fileProcessors[fileType];
    const fileContent = await processor.getContent({
      buffer: fileBuffer,
      fileName: path.basename(params.absolutePath),
      absolutePath: params.absolutePath,
    });

    if (fileContent === null) {
      console.log(`[SKIP] Failed to get content for ${params.relativePath}`);
      return;
    }

    const contentVector = await getEmbedding(
      fileContent,
      "mlx-community/snowflake-arctic-embed-l-v2.0-bf16",
    );

    await dbClient
      .insert(filesTable)
      .values({
        parentHash: params.parentHash,
        path: params.relativePath,
        contentHash: fileHash,
        content: fileContent,
        contentVector,
        contentSearch: fileContent,
      })
      .onConflictDoUpdate({
        target: [filesTable.parentHash, filesTable.path],
        set: {
          contentHash: fileHash,
          content: fileContent,
          contentVector,
          contentSearch: fileContent,
        },
        setWhere: and(
          eq(filesTable.parentHash, params.parentHash),
          eq(filesTable.path, params.relativePath),
        ),
      });
    console.log(
      `[${params.type.toUpperCase()}]: END -> ${params.relativePath}`,
    );
  }
};

const addFile = async (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  await processFile({ ...params, type: "add" });
};

const changeFile = async (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  await processFile({ ...params, type: "change" });
};

const removeFile = async (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  console.log(`[REMOVE] ${params.relativePath}`);
  await dbClient
    .delete(filesTable)
    .where(
      eq(filesTable.parentHash, params.parentHash) &&
        eq(filesTable.path, params.relativePath),
    );
};

const queueFile = (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
  type: "add" | "change" | "unlink";
}) => {
  fileQueue.push(params);
  processQueue();
};

const cleanupNonExistentFiles = async (
  watchDir: string,
  parentHash: string,
) => {
  const files = await dbClient
    .select()
    .from(filesTable)
    .where(eq(filesTable.parentHash, parentHash));

  for (const file of files) {
    const absolutePath = path.join(watchDir, file.path);
    try {
      await fs.access(absolutePath);
    } catch {
      console.log(`[CLEANUP] Removing non-existent file: ${file.path}`);
      await dbClient
        .delete(filesTable)
        .where(
          and(
            eq(filesTable.parentHash, parentHash),
            eq(filesTable.path, file.path),
          ),
        );
    }
  }
};

// main
const main = async () => {
  await runMigration();
  const watchDir = path.isAbsolute(targetDir)
    ? targetDir
    : path.resolve(baseDir, targetDir);

  const parentHash = getHash(watchDir);

  const server = new McpServer({
    name: "Local Rag",
    version: "0.0.1",
  });

  server.tool(
    "list-files",
    "list files in the directory",
    {
      path: z.string().optional().default(""),
    },
    async ({ path }) => {
      const files = await dbClient
        .select()
        .from(filesTable)
        .where(
          and(
            eq(filesTable.parentHash, parentHash),
            like(filesTable.path, `${path}%`),
          ),
        );

      return {
        content: [
          {
            type: "text",
            text: files.map((file) => `${file.path}`).join("\n"),
          },
        ],
      };
    },
  );

  server.tool(
    "get-file",
    "get file content",
    {
      path: z.string(),
    },
    async ({ path }) => {
      const [file] = await dbClient
        .select()
        .from(filesTable)
        .where(
          and(eq(filesTable.parentHash, parentHash), eq(filesTable.path, path)),
        );
      if (!file) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "File not found",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: file.content,
          },
        ],
      };
    },
  );

  server.tool(
    "search-files-vector",
    "search files using vector similarity",
    {
      query: z.string(),
    },
    async ({ query }) => {
      const embedding = await getEmbedding(
        query,
        "mlx-community/snowflake-arctic-embed-l-v2.0-bf16",
      );
      const fileColumns = getTableColumns(filesTable);
      const files = await dbClient
        .select({
          ...fileColumns,
          similarity: sql<number>`1 - (${cosineDistance(filesTable.contentVector, embedding)})`,
        })
        .from(filesTable)
        .where(eq(filesTable.parentHash, parentHash))
        .orderBy(
          desc(
            sql<number>`1 - (${cosineDistance(filesTable.contentVector, embedding)})`,
          ),
        );

      return {
        content: [
          {
            type: "text",
            text: files
              .map((file) => `${file.path} (${file.similarity.toFixed(3)})`)
              .join("\n"),
          },
        ],
      };
    },
  );

  server.tool(
    "search-files-full-text",
    "search files using full-text search",
    {
      query: z.string(),
    },
    async ({ query }) => {
      const files = await dbClient
        .select()
        .from(filesTable)
        .where(
          and(
            eq(filesTable.parentHash, parentHash),
            sql`to_tsvector('simple', ${filesTable.contentSearch}) @@ plainto_tsquery('simple', ${query})`,
          ),
        );

      return {
        content: [
          {
            type: "text",
            text: files.map((file) => `${file.path}`).join("\n"),
          },
        ],
      };
    },
  );

  server.tool(
    "search-files-hybrid",
    "search files using both vector similarity and full-text search",
    {
      query: z.string(),
      vectorWeight: z.number().optional().default(0.7),
      textWeight: z.number().optional().default(0.3),
    },
    async ({ query, vectorWeight, textWeight }) => {
      const embedding = await getEmbedding(
        query,
        "mlx-community/snowflake-arctic-embed-l-v2.0-bf16",
      );
      const fileColumns = getTableColumns(filesTable);

      const results = await dbClient
        .select({
          ...fileColumns,
          vectorSimilarity: sql<number>`1 - (${cosineDistance(filesTable.contentVector, embedding)})`,
          textRank: sql<number>`ts_rank(to_tsvector('simple', ${filesTable.contentSearch}), plainto_tsquery('simple', ${query}))`,
        })
        .from(filesTable)
        .where(eq(filesTable.parentHash, parentHash))
        .orderBy(
          desc(
            sql<number>`(${vectorWeight} * (1 - (${cosineDistance(filesTable.contentVector, embedding)})) + 
                     ${textWeight} * ts_rank(to_tsvector('simple', ${filesTable.contentSearch}), plainto_tsquery('simple', ${query})))`,
          ),
        );

      return {
        content: [
          {
            type: "text",
            text: results
              .map((file) => {
                const combinedScore =
                  vectorWeight * file.vectorSimilarity +
                  textWeight * file.textRank;
                return `${file.path} (${combinedScore.toFixed(3)})`;
              })
              .join("\n"),
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  await cleanupNonExistentFiles(watchDir, parentHash);

  const watcher = chokidar.watch(watchDir, {
    ignored: (path, stats) => !!stats?.isFile() && shouldIgnoreFile(path),
  });

  watcher
    .on("add", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      queueFile({ parentHash, absolutePath, relativePath, type: "add" });
    })
    .on("change", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      queueFile({ parentHash, absolutePath, relativePath, type: "change" });
    })
    .on("unlink", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      queueFile({ parentHash, absolutePath, relativePath, type: "unlink" });
    });
};

if (!!baseDir && !!targetDir) {
  main();
}
