import chokidar from "chokidar";
import path from "path";
import { shouldIgnoreFile, getHash } from "./file";
import { setupLogging } from "./logger";

export interface QueueItem {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
  type: "add" | "change" | "unlink";
}

export interface WatchConfig {
  baseDir: string;
  targetDir: string;
  projectRootDir: string;
  onAdd: (params: Omit<QueueItem, "type">) => Promise<void>;
  onChange: (params: Omit<QueueItem, "type">) => Promise<void>;
  onUnlink: (params: Omit<QueueItem, "type">) => Promise<void>;
}

const fileQueue: QueueItem[] = [];
let isProcessing = false;

const processQueue = async (config: WatchConfig) => {
  if (isProcessing || fileQueue.length === 0) return;

  isProcessing = true;
  try {
    const item = fileQueue.shift();
    if (!item) return;

    const { parentHash, absolutePath, relativePath, type } = item;

    if (type === "add") {
      await config.onAdd({ parentHash, absolutePath, relativePath });
    } else if (type === "change") {
      await config.onChange({ parentHash, absolutePath, relativePath });
    } else if (type === "unlink") {
      await config.onUnlink({ parentHash, absolutePath, relativePath });
    }
  } finally {
    isProcessing = false;
    // 再帰的に次の処理を実行
    processQueue(config);
  }
};

const queueFile = (params: QueueItem, config: WatchConfig) => {
  fileQueue.push(params);
  processQueue(config);
};

export const setupWatch = async (config: WatchConfig) => {
  const log = await setupLogging();
  await log.info("Starting Local Rag server...");

  const watchDir = path.isAbsolute(config.targetDir)
    ? config.targetDir
    : path.resolve(config.baseDir, config.targetDir);

  const parentHash = getHash(watchDir);
  await log.info(`Watching directory: ${watchDir}`);

  const watcher = chokidar.watch(watchDir, {
    ignored: (path, stats) => !!stats?.isFile() && shouldIgnoreFile(path),
  });

  watcher
    .on("add", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      await log.info(`File added: ${relativePath}`);
      queueFile(
        { parentHash, absolutePath, relativePath, type: "add" },
        config,
      );
    })
    .on("change", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      await log.info(`File changed: ${relativePath}`);
      queueFile(
        { parentHash, absolutePath, relativePath, type: "change" },
        config,
      );
    })
    .on("unlink", async (absolutePath) => {
      const relativePath = absolutePath.slice(watchDir.length + 1);
      await log.info(`File removed: ${relativePath}`);
      queueFile(
        { parentHash, absolutePath, relativePath, type: "unlink" },
        config,
      );
    });

  await log.info("File watcher initialized");

  return {
    watchDir,
    parentHash,
  };
};
