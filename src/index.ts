import { runMigration } from "./utils/db";
import chokidar from "chokidar";
import path from "path";

const shouldIgnoreFile = (filePath: string): boolean => {
  const normalizedPath = path.normalize(filePath);
  const pathParts = normalizedPath.split(path.sep);

  // Check if any part of the path starts with . or is node_modules
  return pathParts.some(
    (part) => part.startsWith(".") || part === "node_modules",
  );
};

const main = async () => {
  await runMigration();

  const watcher = chokidar.watch(".", {
    ignored: (path, stats) => !!stats?.isFile() && shouldIgnoreFile(path),
  });

  watcher
    .on("add", (path) => console.log(`[ADD] ${path}`))
    .on("change", (path) => console.log(`[CHANGE] ${path}`))
    .on("unlink", (path) => console.log(`[UNLINK] ${path}`));
};

main();
