"""Tests for the report-trust features: location check and crowd consensus."""

from datetime import date, timedelta

from django.core.cache import cache
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from reports.consensus import venue_consensus, weighted_median
from reports.models import CrowdReport
from reports.verification import NEARBY_METERS, distance_meters
from users.models import User
from venues.models import Venue

NOW = timezone.now()
BAR = (38.9800, -76.9380)


def report(user_id, minutes_ago, level, verified=True):
    return CrowdReport(
        user_id=user_id,
        crowd_level=level,
        verified_nearby=verified,
        created_at=NOW - timedelta(minutes=minutes_ago),
    )


class DistanceTests(SimpleTestCase):
    def test_known_distances(self):
        self.assertEqual(distance_meters(*BAR, *BAR), 0)
        # 0.001 degrees of latitude is about 111 m.
        self.assertAlmostEqual(distance_meters(38.98, -76.938, 38.981, -76.938), 111.2, delta=1)


class LocationVerificationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="reporter", email="r@example.com", password="pw-12345-xyz",
            date_of_birth=date(2000, 1, 1), phone="301-555-0101",
        )
        self.venue = Venue.objects.create(
            name="Test Bar", address="1 Test St", city="College Park", state="MD",
            latitude=str(BAR[0]), longitude=str(BAR[1]),
        )
        self.client.force_authenticate(self.user)

    def post(self, **extra):
        CrowdReport.objects.all().delete()  # skip the 5 minute cooldown
        return self.client.post(
            "/api/reports/", {"venue": self.venue.id, "crowd_level": 3, "wait_time": 5, **extra}, format="json"
        )

    def test_near_the_venue_is_verified(self):
        response = self.post(latitude=BAR[0] + 0.0005, longitude=BAR[1])  # ~55 m
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["verified_nearby"])
        self.assertTrue(CrowdReport.objects.get().verified_nearby)

    def test_far_from_the_venue_is_accepted_but_unverified(self):
        far = BAR[0] + (NEARBY_METERS * 3) / 111_000
        response = self.post(latitude=far, longitude=BAR[1])
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["verified_nearby"])

    def test_no_location_is_accepted_but_unverified(self):
        response = self.post()
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["verified_nearby"])

    def test_client_cannot_set_verified_flag(self):
        response = self.post(verified_nearby=True)
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["verified_nearby"])

    def test_coordinates_are_not_stored_or_returned(self):
        response = self.post(latitude=BAR[0], longitude=BAR[1])
        self.assertNotIn("latitude", response.data)
        self.assertNotIn("longitude", response.data)
        field_names = {f.name for f in CrowdReport._meta.get_fields()}
        self.assertFalse({"latitude", "longitude"} & field_names)

    def test_bad_coordinates_are_rejected(self):
        self.assertEqual(self.post(latitude=BAR[0]).status_code, 400)  # only one of the pair
        self.assertEqual(self.post(latitude=91, longitude=0).status_code, 400)
        self.assertEqual(self.post(latitude=0, longitude=181).status_code, 400)
        self.assertEqual(self.post(latitude="nan", longitude="nan").status_code, 400)
        self.assertEqual(self.post(latitude="inf", longitude=0).status_code, 400)

    def test_venue_list_returns_consensus(self):
        self.post(latitude=BAR[0], longitude=BAR[1])
        venue = self.client.get("/api/venues/").data[0]
        self.assertEqual(venue["crowd"]["level"], 3)
        self.assertEqual(venue["crowd"]["report_count"], 1)
        self.assertTrue(venue["reports"][0]["verified_nearby"])


class ConsensusTests(SimpleTestCase):
    def test_no_recent_reports(self):
        self.assertIsNone(venue_consensus([], NOW)["level"])
        self.assertIsNone(venue_consensus([report(1, 45, 4)], NOW)["level"])

    def test_single_report_is_used(self):
        result = venue_consensus([report(1, 2, 4)], NOW)
        self.assertEqual(result["level"], 4)
        self.assertEqual(result["report_count"], 1)
        self.assertEqual(result["confidence"], "low")

    def test_one_fake_report_is_outvoted(self):
        honest = [report(i, 3 + i, 1) for i in range(2, 6)]
        fake = report(99, 0, 5)  # newest, and the most extreme
        self.assertEqual(venue_consensus(honest + [fake], NOW)["level"], 1)

    def test_one_user_counts_once(self):
        # One person posting "Packed" repeatedly cannot out-vote two other people.
        spam = [report(1, m, 5) for m in (1, 2, 3, 4)]
        others = [report(2, 5, 1), report(3, 6, 1)]
        result = venue_consensus(spam + others, NOW)
        self.assertEqual(result["report_count"], 3)
        self.assertEqual(result["level"], 1)

    def test_a_users_newest_report_replaces_their_older_one(self):
        result = venue_consensus([report(1, 20, 1), report(1, 2, 4)], NOW)
        self.assertEqual(result["level"], 4)
        self.assertEqual(result["report_count"], 1)

    def test_old_reports_are_ignored(self):
        result = venue_consensus([report(1, 31, 5), report(2, 5, 1)], NOW)
        self.assertEqual(result["level"], 1)
        self.assertEqual(result["report_count"], 1)

    def test_verified_reports_outweigh_unverified(self):
        two_unverified = [report(1, 3, 1, verified=False), report(2, 3, 1, verified=False)]
        one_verified = [report(3, 3, 5, verified=True)]
        self.assertEqual(venue_consensus(two_unverified + one_verified, NOW)["level"], 5)

    def test_newer_reports_outweigh_older_ones(self):
        result = venue_consensus([report(1, 28, 1), report(2, 1, 4)], NOW)
        self.assertEqual(result["level"], 4)

    def test_even_split_averages_the_middle(self):
        self.assertEqual(weighted_median([(1, 1), (3, 1)]), 2)
        self.assertEqual(weighted_median([(1, 1), (3, 1), (5, 1)]), 3)
        self.assertEqual(weighted_median([(0, 1), (5, 3)]), 5)

    def test_confidence_grows_with_agreeing_fresh_reports(self):
        many = [report(i, 1, 3) for i in range(1, 5)]
        self.assertEqual(venue_consensus(many, NOW)["confidence"], "high")
