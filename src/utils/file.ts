import { createHash } from "crypto";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { FileType } from "./mime";
import { fileConfig, modelConfig, scriptConfig } from "../config";

const execAsync = promisify(exec);

export const shouldIgnoreFile = (filePath: string): boolean => {
  const normalizedPath = path.normalize(filePath);
  const pathParts = normalizedPath.split(path.sep);

  // Check if any part of the path starts with . or is node_modules
  return pathParts.some(
    (part) => part.startsWith(".") || part === "node_modules",
  );
};

export const getHash = (filePath: string): string => {
  return createHash("sha256").update(filePath).digest("hex");
};

export interface FileProcessor {
  getContent: (params: {
    buffer: Buffer;
    fileName: string;
    absolutePath: string;
  }) => Promise<string | null>;
}

export type FileProcessors = Record<FileType, FileProcessor>;

export const getEmbedding = async (
  content: string,
  modelName: string = modelConfig.embeddingModel,
): Promise<number[]> => {
  const { stdout } = await execAsync(
    `"${scriptConfig.textToVector}" "${content.replace(/"/g, '\\"').replace(/`/g, "\\`")}" "${modelName}"`,
  );

  return JSON.parse(stdout);
};

export const fileProcessors: FileProcessors = {
  text: {
    getContent: async ({ buffer }) => {
      return buffer.toString("utf8");
    },
  },
  html: {
    getContent: async ({ absolutePath }) => {
      const { stdout } = await execAsync(
        `"${scriptConfig.htmlToMarkdown}" "${absolutePath}"`,
      );
      return stdout;
    },
  },
  document: {
    getContent: async ({ absolutePath }) => {
      const { stdout } = await execAsync(
        `"${scriptConfig.documentToMarkdown}" "${absolutePath}"`,
      );
      return stdout;
    },
  },
  image: {
    getContent: async ({ absolutePath }) => {
      const modelName = modelConfig.imageModel;
      const prompt =
        "あなたは画像を説明するAIです。この画像について詳しく説明してください。";
      const { stdout } = await execAsync(
        `"${scriptConfig.imageToText}" "${absolutePath}" "${modelName}" "${prompt}"`,
      );
      return stdout;
    },
  },
  video: {
    getContent: async ({ absolutePath }) => {
      const modelName = modelConfig.videoModel;
      const prompt =
        "あなたは動画を説明するAIです。この動画ついて詳しく説明してください。";
      const { stdout } = await execAsync(
        `"${scriptConfig.videoToText}" "${absolutePath}" "${modelName}" "${prompt}"`,
      );
      return stdout;
    },
  },
  audio: {
    getContent: async ({ absolutePath }) => {
      const modelName = modelConfig.audioModel;
      const { stdout } = await execAsync(
        `"${scriptConfig.audioToText}" "${absolutePath}" "${modelName}"`,
      );
      return stdout;
    },
  },
  other: {
    getContent: async ({ buffer }) => buffer.toString("utf8"),
  },
};

export const CHUNK_SIZE = fileConfig.chunkSize; // チャンクサイズ（文字数）
export const CHUNK_OVERLAP = fileConfig.chunkOverlap; // チャンク間のオーバーラップ（文字数）

export const splitIntoChunks = (text: string): string[] => {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + CHUNK_SIZE, text.length);
    const chunk = text.slice(startIndex, endIndex);
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    // 次のチャンクの開始位置を設定（オーバーラップを考慮）
    startIndex = endIndex;
    if (startIndex < text.length) {
      startIndex = Math.max(0, startIndex - CHUNK_OVERLAP);
    }
  }

  return chunks;
};
