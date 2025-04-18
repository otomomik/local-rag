import { dbClient, fileChunksTable, filesTable } from "../db";
import {
  and,
  cosineDistance,
  desc,
  eq,
  getTableColumns,
  like,
  sql,
} from "drizzle-orm";
import { getEmbedding } from "../utils/file";
import { modelConfig } from "../config";
import { Logger } from "../utils/logger";

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

export interface HybridSearchOptions extends SearchOptions {
  vectorWeight?: number;
  textWeight?: number;
}

export class SearchService {
  constructor(private logger: Logger) {}

  async listFiles(
    parentHash: string,
    pathPrefix: string = "",
  ): Promise<string[]> {
    await this.logger.debug(
      `[TOOL] list-files called with path: ${pathPrefix}`,
    );

    const files = await dbClient
      .select()
      .from(filesTable)
      .where(
        and(
          eq(filesTable.parentHash, parentHash),
          like(filesTable.path, `${pathPrefix}%`),
        ),
      );

    await this.logger.debug(`[TOOL] list-files found ${files.length} files`);
    return files.map((file) => file.path);
  }

  async getFileContent(
    parentHash: string,
    path: string,
    chunkIndex?: string,
  ): Promise<string> {
    await this.logger.debug(
      `[TOOL] get-file called with path: ${path}, chunkIndex: ${chunkIndex}`,
    );

    if (chunkIndex) {
      // Get specific chunk
      const [chunk] = await dbClient
        .select()
        .from(fileChunksTable)
        .where(
          and(
            eq(fileChunksTable.parentHash, parentHash),
            eq(fileChunksTable.filePath, path),
            eq(fileChunksTable.chunkIndex, chunkIndex),
          ),
        );

      if (!chunk) {
        await this.logger.warn(
          `[TOOL] get-file: Chunk not found: ${path}#chunk${chunkIndex}`,
        );
        throw new Error("Chunk not found");
      }

      await this.logger.debug(
        `[TOOL] get-file: Successfully retrieved chunk: ${path}#chunk${chunkIndex}`,
      );
      return chunk.content;
    } else {
      // Get entire file
      const [file] = await dbClient
        .select()
        .from(filesTable)
        .where(
          and(eq(filesTable.parentHash, parentHash), eq(filesTable.path, path)),
        );

      if (!file) {
        await this.logger.warn(`[TOOL] get-file: File not found: ${path}`);
        throw new Error("File not found");
      }

      await this.logger.debug(
        `[TOOL] get-file: Successfully retrieved file: ${path}`,
      );
      return file.content;
    }
  }

  async searchByVector(
    parentHash: string,
    query: string,
    options: SearchOptions = {},
  ): Promise<Array<{ path: string; chunkIndex: string; similarity: number }>> {
    const { limit = 10, offset = 0 } = options;

    await this.logger.debug(
      `[TOOL] search-files-vector called with query: "${query}", limit: ${limit}, offset: ${offset}`,
    );

    const embedding = await getEmbedding(query, modelConfig.embeddingModel);
    const chunkColumns = getTableColumns(fileChunksTable);

    const chunks = await dbClient
      .select({
        ...chunkColumns,
        similarity: sql<number>`1 - (${cosineDistance(fileChunksTable.contentVector, embedding)})`,
      })
      .from(fileChunksTable)
      .where(eq(fileChunksTable.parentHash, parentHash))
      .orderBy(
        desc(
          sql<number>`1 - (${cosineDistance(fileChunksTable.contentVector, embedding)})`,
        ),
      )
      .limit(limit)
      .offset(offset);

    await this.logger.debug(
      `[TOOL] search-files-vector found ${chunks.length} results`,
    );

    return chunks.map((chunk) => ({
      path: chunk.filePath,
      chunkIndex: chunk.chunkIndex,
      similarity: chunk.similarity,
    }));
  }

  async searchByText(
    parentHash: string,
    query: string,
    options: SearchOptions = {},
  ): Promise<Array<{ path: string; chunkIndex: string }>> {
    const { limit = 10, offset = 0 } = options;

    await this.logger.debug(
      `[TOOL] search-files-full-text called with query: "${query}", limit: ${limit}, offset: ${offset}`,
    );

    const chunks = await dbClient
      .select()
      .from(fileChunksTable)
      .where(
        and(
          eq(fileChunksTable.parentHash, parentHash),
          sql`to_tsvector('simple', ${fileChunksTable.contentSearch}) @@ plainto_tsquery('simple', ${query})`,
        ),
      )
      .limit(limit)
      .offset(offset);

    await this.logger.debug(
      `[TOOL] search-files-full-text found ${chunks.length} results`,
    );

    return chunks.map((chunk) => ({
      path: chunk.filePath,
      chunkIndex: chunk.chunkIndex,
    }));
  }

  async searchHybrid(
    parentHash: string,
    query: string,
    options: HybridSearchOptions = {},
  ): Promise<Array<{ path: string; chunkIndex: string; score: number }>> {
    const {
      limit = 10,
      offset = 0,
      vectorWeight = 0.7,
      textWeight = 0.3,
    } = options;

    await this.logger.debug(
      `[TOOL] search-files-hybrid called with query: "${query}", vectorWeight: ${vectorWeight}, textWeight: ${textWeight}, limit: ${limit}, offset: ${offset}`,
    );

    const embedding = await getEmbedding(query, modelConfig.embeddingModel);
    const chunkColumns = getTableColumns(fileChunksTable);

    const results = await dbClient
      .select({
        ...chunkColumns,
        vectorSimilarity: sql<number>`1 - (${cosineDistance(fileChunksTable.contentVector, embedding)})`,
        textRank: sql<number>`ts_rank(to_tsvector('simple', ${fileChunksTable.contentSearch}), plainto_tsquery('simple', ${query}))`,
      })
      .from(fileChunksTable)
      .where(eq(fileChunksTable.parentHash, parentHash))
      .orderBy(
        desc(
          sql<number>`(${vectorWeight} * (1 - (${cosineDistance(fileChunksTable.contentVector, embedding)})) + 
                   ${textWeight} * ts_rank(to_tsvector('simple', ${fileChunksTable.contentSearch}), plainto_tsquery('simple', ${query})))`,
        ),
      )
      .limit(limit)
      .offset(offset);

    await this.logger.debug(
      `[TOOL] search-files-hybrid found ${results.length} results`,
    );

    return results.map((chunk) => {
      const combinedScore =
        vectorWeight * chunk.vectorSimilarity + textWeight * chunk.textRank;
      return {
        path: chunk.filePath,
        chunkIndex: chunk.chunkIndex,
        score: combinedScore,
      };
    });
  }
}
