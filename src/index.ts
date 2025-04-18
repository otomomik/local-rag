import { setupLogging } from "./utils/logger";
import { runMigration } from "./db";
import { setupWatch } from "./utils/watch";
import { FileService } from "./services/FileService";
import { SearchService } from "./services/SearchService";
import { McpService } from "./services/McpService";
import { dirConfig, projectRootDir } from "./config";

// main
const main = async () => {
  const logger = await setupLogging();
  await logger.info("Starting Local Rag server...");

  await runMigration();

  const fileService = new FileService(logger);
  const searchService = new SearchService(logger);

  const { watchDir, parentHash } = await setupWatch({
    baseDir: dirConfig.baseDir,
    targetDir: dirConfig.getTargetDir(process.argv[2]),
    projectRootDir,
    onAdd: (params) => fileService.processFile({ ...params, type: "add" }),
    onChange: (params) =>
      fileService.processFile({ ...params, type: "change" }),
    onUnlink: (params) => fileService.removeFile(params),
  });

  const mcpService = new McpService(logger, searchService, parentHash);
  await mcpService.initialize();

  await fileService.cleanupNonExistentFiles(watchDir, parentHash);
  await logger.info("Cleanup completed");
};

main();
