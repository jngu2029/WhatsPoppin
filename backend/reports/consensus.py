"""Turn a venue's recent reports into one crowd level.

Showing only the latest report lets a single bad report (a joke, a mistake,
or a deliberate fake) set the crowd level for everyone. Instead the level is
a weighted median of recent reports:

* only reports from the last WINDOW count;
* each user counts once per venue, using their newest report;
* newer reports weigh more (exponential decay with HALF_LIFE_MINUTES);
* reports from someone confirmed near the venue weigh more than ones that
  could not be confirmed.

A median ignores outliers, so one "Packed" among several "Quiet" reports does
not move the result. The frontend keeps a simplified copy of this for the
offline preview (frontend/src/data.ts); keep the constants in sync.
"""

from datetime import timedelta

from django.utils import timezone

# Matches the app's 30 minute "needs update" cutoff.
WINDOW = timedelta(minutes=30)
HALF_LIFE_MINUTES = 10
VERIFIED_WEIGHT = 1.0
UNVERIFIED_WEIGHT = 0.3
# Total weight needed for each confidence label.
MEDIUM_CONFIDENCE = 1.5
HIGH_CONFIDENCE = 3.0

EMPTY = {"level": None, "report_count": 0, "confidence": None, "updated_at": None}


def report_weight(report, now):
    age_minutes = max(0.0, (now - report.created_at).total_seconds() / 60)
    recency = 0.5 ** (age_minutes / HALF_LIFE_MINUTES)
    return recency * (VERIFIED_WEIGHT if report.verified_nearby else UNVERIFIED_WEIGHT)


def weighted_median(pairs):
    """pairs is [(value, weight)]. When the split is exactly even, average the two middle values."""
    ordered = sorted(pairs)
    half = sum(weight for _, weight in ordered) / 2
    running = 0.0
    for index, (value, weight) in enumerate(ordered):
        running += weight
        if running > half + 1e-9:
            return value
        if abs(running - half) <= 1e-9 and index + 1 < len(ordered):
            return (value + ordered[index + 1][0]) / 2
    return ordered[-1][0]


def venue_consensus(reports, now=None):
    """Return {level, report_count, confidence, updated_at} for one venue's reports."""
    now = now or timezone.now()
    newest_per_user = {}
    for report in reports:
        if now - report.created_at > WINDOW:
            continue
        current = newest_per_user.get(report.user_id)
        if current is None or report.created_at > current.created_at:
            newest_per_user[report.user_id] = report
    counted = list(newest_per_user.values())
    if not counted:
        return dict(EMPTY)

    weights = [report_weight(r, now) for r in counted]
    median = weighted_median([(r.crowd_level, w) for r, w in zip(counted, weights)])
    total = sum(weights)
    return {
        "level": int(median + 0.5),
        "report_count": len(counted),
        "confidence": "high" if total >= HIGH_CONFIDENCE else "medium" if total >= MEDIUM_CONFIDENCE else "low",
        "updated_at": max(r.created_at for r in counted),
    }
