// Bootstrap (or re-affirm) the single SUPER_ADMIN account. Idempotent.
//
// Resolves the account by email (preferred) or username and designates it
// SUPER_ADMIN in platform.admins. Re-running is a no-op. The admin tables MUST
// already exist on the target DB — apply the migration FIRST (migrate-first).
//
// Run against a target DB by setting DATABASE_URL inline. Examples:
//   # local
//   pnpm --filter @fb/admin-core exec tsx scripts/bootstrap-super-admin.ts --username Fahad
//   # prod (after the additive migration is applied to prod). If this machine is
//   # behind corporate TLS interception and the remote Postgres cert fails to
//   # verify, prefix NODE_OPTIONS=--use-system-ca:
//   NODE_OPTIONS=--use-system-ca DATABASE_URL=<prod-url> DIRECT_URL=<prod-url> \
//     pnpm --filter @fb/admin-core exec tsx scripts/bootstrap-super-admin.ts --email you@example.com
import { prisma } from "@fb/db";
import { bootstrapSuperAdmin } from "../src/bootstrap.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg("email");
  const username = arg("username");
  if (!email && !username) {
    console.error(
      "usage: bootstrap-super-admin --email <email> | --username <username>",
    );
    process.exit(2);
  }

  const res = await bootstrapSuperAdmin({ email, username });
  const who = `${res.username} (#${res.playerNumber})`;
  if (res.alreadySuperAdmin) {
    console.log(`already SUPER_ADMIN: ${who} — no change`);
  } else if (res.promoted) {
    console.log(`promoted to SUPER_ADMIN: ${who}`);
  } else {
    console.log(`bootstrapped SUPER_ADMIN: ${who}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
