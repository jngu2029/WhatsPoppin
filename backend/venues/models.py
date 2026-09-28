from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Venue(models.Model):
    """A bar, club, or other nightlife place users can discover."""

    name = models.CharField(max_length=150)
    address = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    state = models.CharField(
        max_length=2,
        help_text="Two-letter USPS abbreviation, such as MD.",
    )
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[
            MinValueValidator(Decimal("-90")),
            MaxValueValidator(Decimal("90")),
        ],
        help_text="Decimal degrees, between -90 and 90.",
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[
            MinValueValidator(Decimal("-180")),
            MaxValueValidator(Decimal("180")),
        ],
        help_text="Decimal degrees, between -180 and 180.",
    )
    description = models.TextField(blank=True)
    cover_fee = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Cover charge in US dollars.",
    )
    image_url = models.URLField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["city", "state"], name="venue_city_state_idx"),
            models.Index(fields=["latitude", "longitude"], name="venue_coordinates_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(latitude__gte=-90) & models.Q(latitude__lte=90),
                name="venue_latitude_range",
            ),
            models.CheckConstraint(
                condition=models.Q(longitude__gte=-180) & models.Q(longitude__lte=180),
                name="venue_longitude_range",
            ),
            models.CheckConstraint(
                condition=models.Q(cover_fee__gte=0),
                name="venue_cover_fee_non_negative",
            ),
        ]

    def __str__(self):
        return self.name
