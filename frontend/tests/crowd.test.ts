import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageLabel,
  backendLevel,
  crowdSummary,
  distanceMiles,
  collegePark,
  Report,
  signInIdentifierError,
} from "../src/data";
const now = Date.parse("2026-10-05T01:00:00Z");
const report = (minutes: number, level: number, venueId = 1): Report => ({
  id: String(minutes),
  venueId,
  level,
  wait: null,
  createdAt: new Date(now - minutes * 60000).toISOString(),
});
test("freshness and agreement use the latest report and only the last 30 minutes", () => {
  const summary = crowdSummary(
    1,
    [
      report(40, 3),
      report(2, 2),
      report(10, 2),
      report(15, 1),
      report(1, 3, 2),
    ],
    now,
  );
  assert.equal(summary.latest?.level, 2);
  assert.equal(summary.age, 2);
  assert.equal(summary.total, 3);
  assert.equal(summary.agreeing, 2);
  assert.equal(summary.stale, false);
});
test("stale or missing reports do not appear current", () => {
  assert.equal(crowdSummary(1, [report(31, 3)], now).stale, true);
  assert.equal(crowdSummary(1, [], now).stale, true);
  assert.equal(crowdSummary(1, [report(30, 1)], now).stale, false);
  assert.equal(ageLabel(null), "No reports yet");
  assert.equal(ageLabel(0), "Just now");
});
test("the existing six-point backend scale maps to the four user-facing levels", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(backendLevel), [0, 0, 1, 2, 2, 3]);
});
test("distance calculation preserves nearby ordering and supports relocated origin", () => {
  assert.equal(distanceMiles(collegePark), 0);
  assert.ok(
    distanceMiles({
      latitude: collegePark.latitude + 0.01,
      longitude: collegePark.longitude,
    }) > 0.6,
  );
});
test("one extreme report does not set the crowd level", () => {
  const reports = [
    report(0, 3),
    report(4, 0),
    report(6, 0),
    report(8, 0),
    report(10, 1),
  ];
  assert.equal(crowdSummary(1, reports, now).level, 0);
});
test("reports that could not be confirmed at the venue count for less", () => {
  const unconfirmed = (minutes: number, level: number): Report => ({
    ...report(minutes, level),
    verified: false,
  });
  const reports = [
    unconfirmed(3, 0),
    unconfirmed(3, 0),
    { ...report(3, 3), verified: true },
  ];
  assert.equal(crowdSummary(1, reports, now).level, 3);
});
test("an even split averages the two middle levels", () => {
  assert.equal(crowdSummary(1, [report(5, 1), report(5, 3)], now).level, 2);
});
test("the server's consensus level wins over the local reports when provided", () => {
  const crowd = {
    level: 5,
    report_count: 3,
    confidence: "medium" as const,
    updated_at: null,
  };
  const summary = crowdSummary(1, [report(2, 0)], now, crowd);
  assert.equal(summary.level, 3); // backend 5 maps to the app's "Packed"
  assert.equal(summary.stale, false);
  const none = { ...crowd, level: null, report_count: 0 };
  assert.equal(crowdSummary(1, [report(2, 0)], now, none).stale, true);
});
test("sign-in accepts a username or a valid email", () => {
  assert.equal(signInIdentifierError("alex"), null);
  assert.equal(signInIdentifierError(" alex@example.com "), null);
  assert.equal(signInIdentifierError("  "), "Enter your username or email.");
  for (const bad of ["alex@", "@example.com", "alex@example", "a b@example.com"])
    assert.equal(signInIdentifierError(bad), "Enter a valid email address.", bad);
});
