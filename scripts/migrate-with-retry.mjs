import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
const waits = [0, 5_000, 10_000, 20_000];

for (let attempt = 0; attempt < waits.length; attempt += 1) {
  if (waits[attempt] > 0) {
    console.log(`Database migration lock is busy. Retrying in ${waits[attempt] / 1000} seconds (${attempt + 1}/${waits.length})...`);
    await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
  }

  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0) process.exit(0);

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const retryable = output.includes("P1002") || output.includes("advisory lock") || output.includes("timed out");
  if (!retryable || attempt === waits.length - 1) process.exit(result.status ?? 1);
}
