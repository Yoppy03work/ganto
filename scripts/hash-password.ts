import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question("Enter password (16+ chars): ");
  rl.close();

  if (password.length < 16) {
    console.error("\n❌ Password must be at least 16 characters.");
    process.exit(1);
  }

  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);

  // Format: iterations:salt(hex):hash(hex)
  const encoded = `${ITERATIONS}:${salt.toString("hex")}:${hash.toString("hex")}`;

  console.log("\n✅ Hash generated. Copy this value to .env.local:\n");
  console.log(`AUTH_PASSWORD_HASH=${encoded}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
