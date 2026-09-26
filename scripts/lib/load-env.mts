import { config } from "dotenv";

// Same precedence as Next.js for local scripts: .env.local overrides .env.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
