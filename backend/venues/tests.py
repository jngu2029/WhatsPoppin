from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from venues.models import Venue


class VenueModelTests(TestCase):
    def test_create_venue(self):
        venue = Venue.objects.create(
            name="Sample Hall",
            address="123 Sample Ave",
            city="College Park",
            state="MD",
            latitude=Decimal("38.980700"),
            longitude=Decimal("-76.937200"),
            description="Sample data: a fictional College Park venue.",
            cover_fee=Decimal("10.00"),
            image_url="https://example.com/sample-hall.jpg",
        )

        self.assertEqual(venue.name, "Sample Hall")
        self.assertEqual(venue.city, "College Park")
        self.assertEqual(venue.state, "MD")
        self.assertEqual(venue.cover_fee, Decimal("10.00"))
        self.assertEqual(venue.latitude, Decimal("38.980700"))
        self.assertEqual(venue.longitude, Decimal("-76.937200"))
        self.assertIsNotNone(venue.created_at)

    def test_cover_fee_cannot_be_negative(self):
        venue = Venue(
            name="Sample Hall",
            address="123 Sample Ave",
            city="College Park",
            state="MD",
            latitude=Decimal("38.980700"),
            longitude=Decimal("-76.937200"),
            cover_fee=Decimal("-1.00"),
        )

        with self.assertRaises(ValidationError):
            venue.full_clean()

    def test_latitude_must_be_in_range(self):
        venue = Venue(
            name="Sample Hall",
            address="123 Sample Ave",
            city="College Park",
            state="MD",
            latitude=Decimal("91"),
            longitude=Decimal("-76.937200"),
        )

        with self.assertRaises(ValidationError):
            venue.full_clean()
