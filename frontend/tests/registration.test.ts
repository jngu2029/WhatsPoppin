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
import {
  emailError,
  formatPhone,
  isAtLeast21,
  parseBirthDate,
  passwordError,
  phoneError,
  resendLabel,
} from "../src/signup";
test("phone numbers must be valid 10-digit US numbers", () => {
  assert.equal(formatPhone("(301) 555-0101"), "301-555-0101");
  assert.equal(phoneError("301-555-0101"), null);
  for (const bad of ["", "301-555-010", "101-555-0101", "301-155-0101"])
    assert.ok(phoneError(bad), bad);
});
test("emails must look like real addresses", () => {
  assert.equal(emailError(" person@example.com "), null);
  for (const bad of ["person", "person@", "@example.com", "person@example", "a b@example.com"])
    assert.ok(emailError(bad), bad);
});
test("passwords need 10 characters, an uppercase letter and a number", () => {
  assert.equal(passwordError("RiverCamping904"), null);
  for (const bad of ["Short1", "lowercase123", "NoNumbersHere"]) assert.ok(passwordError(bad), bad);
});
test("dates of birth must be real, not in the future, and 21+", () => {
  const today = new Date(2026, 10, 14);
  assert.equal(parseBirthDate("02/30/2000", today), null);
  assert.equal(parseBirthDate("2000-01-01", today), null);
  assert.equal(parseBirthDate("01/01/2999", today), null);
  assert.equal(isAtLeast21(parseBirthDate("11/14/2005", today)!, today), true);
  assert.equal(isAtLeast21(parseBirthDate("11/15/2005", today)!, today), false);
});
test("the resend button counts down, then shows the 30 minute wait", () => {
  const now = 1_000_000;
  assert.equal(resendLabel(null, now), "Resend code");
  assert.equal(resendLabel({ availableAt: now + 42_000, left: 2 }, now), "Resend code in 0:42");
  assert.equal(resendLabel({ availableAt: now + 30 * 60_000, left: 0 }, now), "Too many codes sent. Try again in 30:00");
  assert.equal(resendLabel({ availableAt: now - 1, left: 0 }, now), "Resend code");
  // Daily limit: hours and minutes.
  assert.equal(resendLabel({ availableAt: now + (5 * 60 + 7) * 60_000, left: 0 }, now), "Too many codes sent. Try again in 5h 7m");
});
