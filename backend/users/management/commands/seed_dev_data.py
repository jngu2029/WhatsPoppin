"""Load fictional College Park sample data for local development."""

from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from events.models import Event
from favorites.models import Favorite
from reports.models import CrowdLevel, CrowdReport, WaitTime
from users.models import User
from venues.models import Venue

# Fictional password for the local sample accounts only.
# It is not a credential for any real system.
SAMPLE_PASSWORD = "sample-password"


class Command(BaseCommand):
    help = (
        "Create fictional users, venues, events, crowd reports, and favorites "
        "for local development. Safe to run more than once."
    )

    def handle(self, *args, **options):
        alex = self._user(
            username="sample_alex",
            email="alex.sample@example.com",
            first_name="Alex",
            last_name="Sample",
            phone="301-555-0101",
            date_of_birth=date(2004, 3, 15),
        )
        jordan = self._user(
            username="sample_jordan",
            email="jordan.sample@example.com",
            first_name="Jordan",
            last_name="Sample",
            phone="301-555-0102",
            date_of_birth=date(2003, 11, 2),
        )
        riley = self._user(
            username="sample_riley",
            email="riley.sample@example.com",
            first_name="Riley",
            last_name="Sample",
            phone="301-555-0103",
            date_of_birth=date(2005, 7, 21),
        )

        hall = self._venue(
            name="Sample Hall",
            address="123 Sample Ave",
            latitude=Decimal("38.980700"),
            longitude=Decimal("-76.937200"),
            description="Sample data: a fictional College Park bar used for development.",
            cover_fee=Decimal("10.00"),
            image_url="https://example.com/sample-hall.jpg",
        )
        club = self._venue(
            name="Sample Club",
            address="450 Sample Ave",
            latitude=Decimal("38.982100"),
            longitude=Decimal("-76.934800"),
            description="Sample data: a fictional College Park club used for development.",
            cover_fee=Decimal("15.00"),
            image_url="https://example.com/sample-club.jpg",
        )
        lounge = self._venue(
            name="Sample Lounge",
            address="800 Sample Lane",
            latitude=Decimal("38.978400"),
            longitude=Decimal("-76.939500"),
            description="Sample data: a fictional College Park lounge used for development.",
            cover_fee=Decimal("0.00"),
            image_url="https://example.com/sample-lounge.jpg",
        )

        tonight = timezone.now().replace(minute=0, second=0, microsecond=0)
        self._event(
            venue=hall,
            title="Sample Friday Night",
            description="Sample data: a fictional hip-hop night.",
            start_time=tonight + timedelta(days=1, hours=3),
            end_time=tonight + timedelta(days=1, hours=7),
            dj_name="DJ Sample Spin",
            music_genre="Hip Hop",
            image_url="https://example.com/sample-friday.jpg",
        )
        self._event(
            venue=club,
            title="Sample Saturday Set",
            description="Sample data: a fictional dance night.",
            start_time=tonight + timedelta(days=2, hours=4),
            end_time=tonight + timedelta(days=2, hours=8),
            dj_name="DJ Test Track",
            music_genre="EDM",
            image_url="https://example.com/sample-saturday.jpg",
        )
        self._event(
            venue=lounge,
            title="Sample Open Decks",
            description="Sample data: a fictional low-key night.",
            start_time=tonight + timedelta(days=3, hours=2),
            end_time=tonight + timedelta(days=3, hours=5),
            dj_name="DJ Placeholder",
            music_genre="R&B",
            image_url="https://example.com/sample-open-decks.jpg",
        )

        self._report(
            user=alex,
            venue=hall,
            crowd_level=CrowdLevel.CROWDED,
            wait_time=WaitTime.MINUTES_20_30,
            comment="Sample data: busy, but the line is moving.",
        )
        self._report(
            user=jordan,
            venue=club,
            crowd_level=CrowdLevel.MODERATE,
            wait_time=WaitTime.MINUTES_5_10,
            comment="Sample data: easy to get in right now.",
        )
        self._report(
            user=riley,
            venue=hall,
            crowd_level=CrowdLevel.PACKED,
            wait_time=WaitTime.MINUTES_30_PLUS,
            comment="Sample data: packed and the wait is long.",
        )

        self._favorite(alex, hall)
        self._favorite(alex, club)
        self._favorite(jordan, club)
        self._favorite(riley, lounge)

        self.stdout.write(
            self.style.SUCCESS(
                "Sample data is ready. Users sample_alex, sample_jordan, and "
                f"sample_riley can sign in with the password {SAMPLE_PASSWORD}."
            )
        )

    def _user(self, username, email, **profile):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email, **profile},
        )
        if created:
            user.set_password(SAMPLE_PASSWORD)
            user.save(update_fields=["password"])
        return user

    def _venue(self, name, address, latitude, longitude, description, cover_fee, image_url):
        venue, _created = Venue.objects.get_or_create(
            name=name,
            defaults={
                "address": address,
                "city": "College Park",
                "state": "MD",
                "latitude": latitude,
                "longitude": longitude,
                "description": description,
                "cover_fee": cover_fee,
                "image_url": image_url,
            },
        )
        return venue

    def _event(self, venue, title, **fields):
        event, _created = Event.objects.get_or_create(
            venue=venue,
            title=title,
            defaults=fields,
        )
        return event

    def _report(self, user, venue, crowd_level, wait_time, comment):
        report, _created = CrowdReport.objects.get_or_create(
            user=user,
            venue=venue,
            comment=comment,
            defaults={
                "crowd_level": crowd_level,
                "wait_time": wait_time,
            },
        )
        return report

    def _favorite(self, user, venue):
        favorite, _created = Favorite.objects.get_or_create(user=user, venue=venue)
        return favorite
