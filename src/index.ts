import { runMigration } from "./utils/db";

const main = async () => {
  await runMigration();
};

main();
