from django.conf import settings
from django.db import models

from venues.models import Venue


class CrowdLevel(models.IntegerChoices):
    """Crowd scale used by the report screen. 0 is empty and 5 is packed."""

    EMPTY = 0, "Empty"
    LIGHT = 1, "Light"
    MODERATE = 2, "Moderate"
    BUSY = 3, "Busy"
    CROWDED = 4, "Crowded"
    PACKED = 5, "Packed"


class WaitTime(models.IntegerChoices):
    """
    Wait-time buckets from the report screen.

    The values run from shortest to longest so a later summary can compare
    them. Leave NOT_SURE out of any average.
    """

    MINUTES_0_5 = 0, "0-5 minutes"
    MINUTES_5_10 = 1, "5-10 minutes"
    MINUTES_10_20 = 2, "10-20 minutes"
    MINUTES_20_30 = 3, "20-30 minutes"
    MINUTES_30_PLUS = 4, "30+ minutes"
    NOT_SURE = 5, "Not sure"


class CrowdReport(models.Model):
    """One user's crowd and wait-time report for a venue."""

    venue = models.ForeignKey(
        Venue,
        on_delete=models.CASCADE,
        related_name="crowd_reports",
        # The (venue, created_at) index below covers venue lookups.
        db_index=False,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="crowd_reports",
    )
    crowd_level = models.PositiveSmallIntegerField(choices=CrowdLevel.choices)
    wait_time = models.PositiveSmallIntegerField(choices=WaitTime.choices)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["venue", "-created_at"], name="report_venue_time_idx"),
            models.Index(fields=["created_at"], name="report_created_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(crowd_level__in=CrowdLevel.values),
                name="report_crowd_level_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(wait_time__in=WaitTime.values),
                name="report_wait_time_valid",
            ),
        ]

    def __str__(self):
        return (
            f"{self.user} at {self.venue} "
            f"({self.get_crowd_level_display()})"
        )
