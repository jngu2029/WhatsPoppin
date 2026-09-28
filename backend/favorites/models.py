from django.conf import settings
from django.db import models

from venues.models import Venue


class Favorite(models.Model):
    """A venue a user has saved. Each user can save a venue only once."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    venue = models.ForeignKey(
        Venue,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "venue"],
                name="unique_favorite_per_venue",
            ),
        ]

    def __str__(self):
        return f"{self.user} saved {self.venue}"
