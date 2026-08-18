import { seedDemo } from "./demo";
import { seedRoles } from "./roles";
import { seedUsers } from "./users";

/**
 * One file per table, run in dependency order — a seed that references another
 * table's rows must come after the seed that creates them.
 *
 * `seedDemo` is last and decides for itself whether to run: it needs the catalog and the
 * `admin` role in place, and it is the only seed that is optional — see `shouldSeedDemo`.
 */
const seeds = [seedRoles, seedUsers, seedDemo];

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
