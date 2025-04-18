import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Logger } from "../utils/logger";
import { SearchService } from "./SearchService";
import { serverConfig } from "../config";

export class McpService {
  private server: McpServer;

  constructor(
    private logger: Logger,
    private searchService: SearchService,
    private parentHash: string,
  ) {
    this.server = new McpServer({
      name: serverConfig.name,
      version: serverConfig.version,
    });
  }

  async initialize(): Promise<void> {
    this.registerTools();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    await this.logger.info("Server connected successfully");
  }

  private registerTools(): void {
    this.server.tool(
      "list-files",
      "list files in the directory",
      {
        path: z.string().optional().default(""),
      },
      async ({ path }) => {
        const files = await this.searchService.listFiles(this.parentHash, path);
        return {
          content: [
            {
              type: "text",
              text: files.join("\n"),
            },
          ],
        };
      },
    );

    this.server.tool(
      "get-file",
      "get file content",
      {
        path: z.string(),
        chunkIndex: z.string().optional(),
      },
      async ({ path, chunkIndex }) => {
        try {
          const content = await this.searchService.getFileContent(
            this.parentHash,
            path,
            chunkIndex,
          );
          return {
            content: [
              {
                type: "text",
                text: content,
              },
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: error.message,
              },
            ],
          };
        }
      },
    );

    this.server.tool(
      "search-files-vector",
      "search files using vector similarity",
      {
        query: z.string(),
        limit: z.number().optional().default(10),
        offset: z.number().optional().default(0),
      },
      async ({ query, limit, offset }) => {
        const results = await this.searchService.searchByVector(
          this.parentHash,
          query,
          {
            limit,
            offset,
          },
        );
        return {
          content: [
            {
              type: "text",
              text: results
                .map(
                  (result) =>
                    `${result.path}#chunk${result.chunkIndex} (${result.similarity.toFixed(3)})`,
                )
                .join("\n"),
            },
          ],
        };
      },
    );

    this.server.tool(
      "search-files-full-text",
      "search files using full-text search",
      {
        query: z.string(),
        limit: z.number().optional().default(10),
        offset: z.number().optional().default(0),
      },
      async ({ query, limit, offset }) => {
        const results = await this.searchService.searchByText(
          this.parentHash,
          query,
          {
            limit,
            offset,
          },
        );
        return {
          content: [
            {
              type: "text",
              text: results
                .map((result) => `${result.path}#chunk${result.chunkIndex}`)
                .join("\n"),
            },
          ],
        };
      },
    );

    this.server.tool(
      "search-files-hybrid",
      "search files using both vector similarity and full-text search",
      {
        query: z.string(),
        vectorWeight: z.number().optional().default(0.7),
        textWeight: z.number().optional().default(0.3),
        limit: z.number().optional().default(10),
        offset: z.number().optional().default(0),
      },
      async ({ query, vectorWeight, textWeight, limit, offset }) => {
        const results = await this.searchService.searchHybrid(
          this.parentHash,
          query,
          {
            limit,
            offset,
            vectorWeight,
            textWeight,
          },
        );
        return {
          content: [
            {
              type: "text",
              text: results
                .map(
                  (result) =>
                    `${result.path}#chunk${result.chunkIndex} (${result.score.toFixed(3)})`,
                )
                .join("\n"),
            },
          ],
        };
      },
    );
  }
}
