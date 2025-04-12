import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

let dbClient: ReturnType<typeof drizzle> | null = null;

export const getDbClient = async () => {
  if (!dbClient) {
    const pglite = new PGlite(".pglite", {
      extensions: {
        vector,
      },
    });
    dbClient = drizzle({ connection: pglite });
  }
  return dbClient;
};

export const runMigration = async () => {
  const dbClient = await getDbClient();
  await migrate(dbClient, {
    migrationsFolder: "./drizzle",
  });
};
