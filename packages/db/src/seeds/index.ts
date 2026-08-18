import { seedUsers } from "./users";

/**
 * One file per table, run in dependency order — a seed that references another
 * table's rows must come after the seed that creates them.
 */
const seeds = [seedUsers];

async function main() {
  for (const seed of seeds) {
    await seed();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
