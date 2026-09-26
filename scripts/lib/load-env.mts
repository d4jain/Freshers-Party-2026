import { config } from "dotenv";

/**
 * Local scripts: same precedence as Next.js (.env.local overrides .env).
 * With ENV_FILE=.env.live (the `…:live` npm scripts) ONLY that file is read,
 * so local settings can never mix with the live database's.
 */
const envFile = process.env.ENV_FILE;
if (envFile) {
  const res = config({ path: envFile, quiet: true });
  if (res.error) {
    console.error(
      `Couldn't read ${envFile}. Copy .env.live.example to ${envFile} and paste your Neon connection string into it.`,
    );
    process.exit(1);
  }
} else {
  config({ path: ".env.local", quiet: true });
  config({ path: ".env", quiet: true });
}

/**
 * The database URL for scripts (direct/unpooled preferred), checked so a
 * placeholder or half-pasted value fails with a clear message instead of a
 * DNS error. Prints which database it's about to use.
 */
export function scriptDatabaseUrl(): string {
  const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").trim();
  const where = envFile ?? ".env.local";
  const fail = (why: string) => {
    console.error(
      `${why}\nSet DATABASE_URL_UNPOOLED in ${where} to the full connection string, e.g.\n` +
        `  postgresql://neondb_owner:xxxx@ep-something-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`,
    );
    process.exit(1);
  };
  if (!url) fail("No database connection string found.");
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    fail("The database connection string isn't a valid URL.");
  }
  if (!parsed || !/^postgres(ql)?:$/.test(parsed.protocol) || !parsed.hostname || /[…<>]|\.\.\./.test(url)) {
    fail("The database connection string still looks like a placeholder.");
  }
  if (parsed!.hostname.includes("-pooler")) {
    console.warn("Note: this is the pooled connection string. For scripts, the direct one (no “-pooler” in the host) is safer.");
  }
  console.log(`Using database: ${parsed!.hostname}${parsed!.pathname}`);
  return url;
}
