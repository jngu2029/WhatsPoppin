from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from events.models import Event
from venues.models import Venue


class EventModelTests(TestCase):
    def setUp(self):
        self.venue = Venue.objects.create(
            name="Sample Hall",
            address="123 Sample Ave",
            city="College Park",
            state="MD",
            latitude=Decimal("38.980700"),
            longitude=Decimal("-76.937200"),
        )
        self.start = timezone.now() + timedelta(days=1)

    def test_event_belongs_to_venue(self):
        event = Event.objects.create(
            venue=self.venue,
            title="Sample Friday Night",
            description="Sample data: a fictional event.",
            start_time=self.start,
            end_time=self.start + timedelta(hours=4),
            dj_name="DJ Sample Spin",
            music_genre="Hip Hop",
            image_url="https://example.com/sample-friday.jpg",
        )

        self.assertEqual(event.venue, self.venue)
        self.assertEqual(list(self.venue.events.all()), [event])
        self.assertIsNotNone(event.created_at)

    def test_end_time_must_be_after_start_time(self):
        event = Event(
            venue=self.venue,
            title="Sample Bad Times",
            start_time=self.start,
            end_time=self.start,
        )

        with self.assertRaises(ValidationError):
            event.full_clean()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Event.objects.create(
                    venue=self.venue,
                    title="Sample Bad Times",
                    start_time=self.start,
                    end_time=self.start,
                )
