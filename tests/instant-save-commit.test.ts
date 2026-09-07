import { expect, it } from "vitest";
import { transactionComplete } from "../src/lib/instant-stocktake-queue";
it("waits for transaction commit rather than an individual request", async () => {
  const tx = {} as IDBTransaction;
  let committed = false;
  const done = transactionComplete(tx).then(() => { committed = true; });
  await Promise.resolve(); expect(committed).toBe(false);
  tx.oncomplete!.call(tx, new Event("complete"));
  await done; expect(committed).toBe(true);
});
it("reports a transaction abort as a failed local save", async () => {
  const tx = {} as IDBTransaction;
  const done = transactionComplete(tx);
  tx.onabort!.call(tx, new Event("abort"));
  await expect(done).rejects.toThrow("保存を確定できませんでした");
});
