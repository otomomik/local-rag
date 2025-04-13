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

interface FileProcessor {
  getContent: (buffer: Buffer, fileName: string) => Promise<string>;
  getEmbedding: (content: string) => Promise<number[]>;
}

interface FileProcessors {
  [key: string]: FileProcessor;
}

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

const fileProcessors: FileProcessors = {
  text: {
    getContent: async (buffer: Buffer) => buffer.toString("utf8"),
    getEmbedding: async (content: string) => {
      const model = await lmstudio.embedding.model("mxbai-embed-large-v1");
      const { embedding } = await model.embed(content);
      return embedding;
    },
  },
  pdf: {
    getContent: async (buffer: Buffer) => {
      // TODO: Implement PDF text extraction
      return buffer.toString("utf8");
    },
    getEmbedding: async (content: string) => {
      const model = await lmstudio.embedding.model("mxbai-embed-large-v1");
      const { embedding } = await model.embed(content);
      return embedding;
    },
  },
  image: {
    getContent: async (buffer, fileName) => {
      const model = await lmstudio.llm.model("gemma-3-27b-it");
      const imageBase64 = buffer.toString("base64");
      const image = await lmstudio.files.prepareImageBase64(
        fileName,
        imageBase64,
      );
      const { content } = await model.respond([
        {
          role: "system",
          content:
            "あなたは画像を説明するAIです。画像の特徴と内容を詳細に説明してください。\n画像には・この画像は・〇〇と言えるでしょうなど不要なものは出力せず、あくまで画像の特徴と内容を説明してください。",
        },
        {
          role: "user",
          images: [image],
        },
      ]);
      console.log(content);
      return content;
    },
    getEmbedding: async (content: string) => {
      const model = await lmstudio.embedding.model("mxbai-embed-large-v1");
      const { embedding } = await model.embed(content);
      return embedding;
    },
  },
  video: {
    getContent: async (buffer: Buffer) => {
      // TODO: Implement video metadata/frame extraction
      return "video content";
    },
    getEmbedding: async (content: string) => {
      const model = await lmstudio.embedding.model("mxbai-embed-large-v1");
      const { embedding } = await model.embed(content);
      return embedding;
    },
  },
  audio: {
    getContent: async (buffer: Buffer) => {
      // TODO: Implement audio transcription
      return "audio content";
    },
    getEmbedding: async (content: string) => {
      const model = await lmstudio.embedding.model("mxbai-embed-large-v1");
      const { embedding } = await model.embed(content);
      return embedding;
    },
  },
  other: {
    getContent: async (buffer: Buffer) => buffer.toString("utf8"),
    getEmbedding: async (content: string) => {
      const model = await lmstudio.embedding.model("mxbai-embed-large-v1");
      const { embedding } = await model.embed(content);
      return embedding;
    },
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

const addFile = async (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  console.log(`[ADD] ${params.relativePath}`);
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
    const fileContent = await processor.getContent(
      fileBuffer,
      path.basename(params.absolutePath),
    );
    const contentVector = await processor.getEmbedding(fileContent);

    await dbClient
      .insert(filesTable)
      .values({
        parentHash: params.parentHash,
        path: params.relativePath,
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
          eq(filesTable.parentHash, params.parentHash),
          eq(filesTable.path, params.relativePath),
        ),
      });
  }
};

const changeFile = async (params: {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}) => {
  console.log(`[CHANGE] ${params.relativePath}`);
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
    const fileContent = await processor.getContent(
      fileBuffer,
      path.basename(params.absolutePath),
    );
    const contentVector = await processor.getEmbedding(fileContent);

    await dbClient
      .insert(filesTable)
      .values({
        parentHash: params.parentHash,
        path: params.relativePath,
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
          eq(filesTable.parentHash, params.parentHash),
          eq(filesTable.path, params.relativePath),
        ),
      });
  }
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
