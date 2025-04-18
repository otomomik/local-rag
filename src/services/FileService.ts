import { dbClient, filesTable, fileChunksTable } from "../db";
import { and, eq } from "drizzle-orm";
import {
  getHash,
  fileProcessors,
  getEmbedding,
  splitIntoChunks,
} from "../utils/file";
import { detectFileType } from "../utils/mime";
import { Logger } from "../utils/logger";
import { modelConfig } from "../config";
import path from "path";
import fs from "fs/promises";

export interface FileOperationParams {
  parentHash: string;
  absolutePath: string;
  relativePath: string;
}

export class FileService {
  constructor(private logger: Logger) {}

  async processFile(
    params: FileOperationParams & { type: "add" | "change" },
  ): Promise<void> {
    await this.logger.debug(
      `[${params.type.toUpperCase()}]: START -> ${params.relativePath}`,
    );

    try {
      const fileBuffer = await fs.readFile(params.absolutePath);
      const fileType = await detectFileType(fileBuffer);
      const fileHash = getHash(params.absolutePath);

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
        await this.logger.debug(`[SKIP] ${params.relativePath}`);
        return;
      }

      const processor = fileProcessors[fileType];
      const fileContent = await processor.getContent({
        buffer: fileBuffer,
        fileName: path.basename(params.absolutePath),
        absolutePath: params.absolutePath,
      });

      if (fileContent === null) {
        await this.logger.warn(
          `[SKIP] Failed to get content for ${params.relativePath}`,
        );
        return;
      }

      await this.saveFile(params, fileHash, fileContent);
      await this.processChunks(params, fileContent);

      await this.logger.debug(
        `[${params.type.toUpperCase()}]: END -> ${params.relativePath}`,
      );
    } catch (error) {
      await this.logger.error(
        `Error processing file ${params.relativePath}: ${error.message}`,
      );
      throw error;
    }
  }

  private async saveFile(
    params: FileOperationParams,
    fileHash: string,
    fileContent: string,
  ): Promise<void> {
    await dbClient
      .insert(filesTable)
      .values({
        parentHash: params.parentHash,
        path: params.relativePath,
        contentHash: fileHash,
        content: fileContent,
      })
      .onConflictDoUpdate({
        target: [filesTable.parentHash, filesTable.path],
        set: {
          contentHash: fileHash,
          content: fileContent,
        },
        setWhere: and(
          eq(filesTable.parentHash, params.parentHash),
          eq(filesTable.path, params.relativePath),
        ),
      });
  }

  private async processChunks(
    params: FileOperationParams,
    fileContent: string,
  ): Promise<void> {
    const chunks = splitIntoChunks(fileContent);
    const chunkVectors = await Promise.all(
      chunks.map((chunk) => getEmbedding(chunk, modelConfig.embeddingModel)),
    );

    // Delete existing chunks
    await dbClient
      .delete(fileChunksTable)
      .where(
        and(
          eq(fileChunksTable.parentHash, params.parentHash),
          eq(fileChunksTable.filePath, params.relativePath),
        ),
      );

    // Save new chunks
    for (let i = 0; i < chunks.length; i++) {
      await dbClient.insert(fileChunksTable).values({
        parentHash: params.parentHash,
        filePath: params.relativePath,
        chunkIndex: i.toString(),
        content: chunks[i],
        contentVector: chunkVectors[i],
        contentSearch: chunks[i],
      });
    }
  }

  async removeFile(params: FileOperationParams): Promise<void> {
    await this.logger.debug(`[REMOVE] ${params.relativePath}`);

    try {
      // Delete both file and chunks
      await dbClient
        .delete(filesTable)
        .where(
          and(
            eq(filesTable.parentHash, params.parentHash),
            eq(filesTable.path, params.relativePath),
          ),
        );

      await dbClient
        .delete(fileChunksTable)
        .where(
          and(
            eq(fileChunksTable.parentHash, params.parentHash),
            eq(fileChunksTable.filePath, params.relativePath),
          ),
        );
    } catch (error) {
      await this.logger.error(
        `Error removing file ${params.relativePath}: ${error.message}`,
      );
      throw error;
    }
  }

  async cleanupNonExistentFiles(
    watchDir: string,
    parentHash: string,
  ): Promise<void> {
    const files = await dbClient
      .select()
      .from(filesTable)
      .where(eq(filesTable.parentHash, parentHash));

    for (const file of files) {
      const absolutePath = path.join(watchDir, file.path);
      try {
        await fs.access(absolutePath);
      } catch {
        await this.logger.debug(
          `[CLEANUP] Removing non-existent file: ${file.path}`,
        );
        await this.removeFile({
          parentHash,
          absolutePath,
          relativePath: file.path,
        });
      }
    }
  }
}
