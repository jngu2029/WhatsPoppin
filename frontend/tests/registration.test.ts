import { test } from "node:test";
import assert from "node:assert/strict";
import { submissionGuard } from "../src/submissionGuard";
test("rapid submissions send one request, and failure releases the form", async () => {
  const guard = submissionGuard();
  let calls = 0;
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const submit = async () => {
    if (!guard.enter()) return;
    try { calls++; await pending; throw new Error("network failure"); }
    catch {} finally { guard.release(); }
  };
  const first = submit();
  await submit();
  assert.equal(calls, 1);
  finish(); await first;
  await submit();
  assert.equal(calls, 2);
});
