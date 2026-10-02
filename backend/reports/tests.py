from decimal import Decimal
from datetime import date

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from reports.models import CrowdLevel, CrowdReport, WaitTime
from users.models import User
from venues.models import Venue


class CrowdReportModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="sample_alex",
            email="alex.sample@example.com",
            password="sample-password",
            phone="301-555-0101",
            date_of_birth=date(2004, 3, 15),
        )
        self.venue = Venue.objects.create(
            name="Sample Hall",
            address="123 Sample Ave",
            city="College Park",
            state="MD",
            latitude=Decimal("38.980700"),
            longitude=Decimal("-76.937200"),
        )

    def test_report_links_user_and_venue(self):
        report = CrowdReport.objects.create(
            venue=self.venue,
            user=self.user,
            crowd_level=CrowdLevel.PACKED,
            wait_time=WaitTime.MINUTES_20_30,
            comment="Sample data: the line is long.",
        )

        self.assertEqual(report.user, self.user)
        self.assertEqual(report.venue, self.venue)
        self.assertEqual(list(self.user.crowd_reports.all()), [report])
        self.assertEqual(list(self.venue.crowd_reports.all()), [report])
        self.assertEqual(report.get_crowd_level_display(), "Packed")
        self.assertEqual(report.get_wait_time_display(), "20-30 minutes")
        self.assertIsNotNone(report.created_at)

    def test_crowd_level_choices(self):
        self.assertEqual(
            [(choice.value, choice.label) for choice in CrowdLevel],
            [
                (0, "Empty"),
                (1, "Light"),
                (2, "Moderate"),
                (3, "Busy"),
                (4, "Crowded"),
                (5, "Packed"),
            ],
        )

        report = CrowdReport(
            venue=self.venue,
            user=self.user,
            crowd_level=9,
            wait_time=WaitTime.NOT_SURE,
        )
        with self.assertRaises(ValidationError):
            report.full_clean()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CrowdReport.objects.create(
                    venue=self.venue,
                    user=self.user,
                    crowd_level=9,
                    wait_time=WaitTime.NOT_SURE,
                )

    def test_wait_time_choices(self):
        self.assertEqual(
            [(choice.value, choice.label) for choice in WaitTime],
            [
                (0, "0-5 minutes"),
                (1, "5-10 minutes"),
                (2, "10-20 minutes"),
                (3, "20-30 minutes"),
                (4, "30+ minutes"),
                (5, "Not sure"),
            ],
        )

        report = CrowdReport(
            venue=self.venue,
            user=self.user,
            crowd_level=CrowdLevel.MODERATE,
            wait_time=99,
        )
        with self.assertRaises(ValidationError):
            report.full_clean()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CrowdReport.objects.create(
                    venue=self.venue,
                    user=self.user,
                    crowd_level=CrowdLevel.MODERATE,
                    wait_time=99,
                )
