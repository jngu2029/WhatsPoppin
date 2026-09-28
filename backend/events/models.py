from django.core.exceptions import ValidationError
from django.db import models

from venues.models import Venue


class Event(models.Model):
    """A scheduled night at a venue, including the DJ and music genre."""

    venue = models.ForeignKey(
        Venue,
        on_delete=models.CASCADE,
        related_name="events",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(blank=True, null=True)
    dj_name = models.CharField(max_length=150, blank=True)
    music_genre = models.CharField(max_length=100, blank=True)
    image_url = models.URLField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_time"]
        indexes = [
            models.Index(fields=["start_time"], name="event_start_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="event_end_after_start",
            ),
        ]

    def clean(self):
        super().clean()
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError(
                {"end_time": "End time must be after the start time."}
            )

    def __str__(self):
        return f"{self.title} at {self.venue}"
