from datetime import date
from django.core.cache import cache
from rest_framework.test import APITestCase
from users.models import User
from venues.models import Venue
from reports.models import CrowdReport


class MobileAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="reporter", email="reporter@example.com", password="test-password", date_of_birth=date(2000, 1, 1), phone="301-555-0101")
        self.other = User.objects.create_user(username="other", email="other@example.com", password="test-password", date_of_birth=date(2000, 1, 1), phone="301-555-0102")
        self.venue = Venue.objects.create(name="Test Bar", address="Test Street", city="College Park", state="MD", latitude="38.98", longitude="-76.93")

    def login(self):
        response = self.client.post("/api/auth/sign-in/", {"username": "reporter", "password": "test-password"})
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        return response.data["token"]

    def test_public_discovery_and_authenticated_report(self):
        self.assertEqual(self.client.get("/api/venues/").status_code, 200)
        self.assertEqual(self.client.post("/api/reports/", {"venue": self.venue.id, "crowd_level": 3, "wait_time": 5}).status_code, 401)
        self.login()
        response = self.client.post("/api/reports/", {"venue": self.venue.id, "crowd_level": 3, "wait_time": 5, "user": self.other.id})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(CrowdReport.objects.get().user, self.user)
        venue = self.client.get("/api/venues/").data[0]
        self.assertEqual(venue["reports"][0]["crowd_level"], 3)
        mine = self.client.get("/api/reports/mine/").data[0]
        self.assertEqual(mine["level"], 2)
        self.assertIsNone(mine["wait"])
        self.assertTrue(mine["mine"])

    def test_report_validation(self):
        self.login()
        for level in [-1, 6, "packed"]:
            self.assertEqual(self.client.post("/api/reports/", {"venue": self.venue.id, "crowd_level": level, "wait_time": 5}).status_code, 400)
        self.assertEqual(self.client.post("/api/reports/", {"venue": 9999, "crowd_level": 1, "wait_time": 5}).status_code, 400)

    def test_favorites_are_private_and_idempotent(self):
        self.login()
        path = f"/api/favorites/{self.venue.id}/"
        for _ in range(2):
            self.assertEqual(self.client.put(path).status_code, 200)
        self.assertEqual(self.client.get("/api/favorites/").data, [self.venue.id])
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/favorites/").data, [])
        self.client.delete(path)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/favorites/").data, [self.venue.id])
        self.assertEqual(self.client.delete(path).status_code, 204)
        self.assertEqual(self.client.get("/api/favorites/").data, [])

    def test_signout_revokes_token(self):
        self.login()
        self.assertEqual(self.client.post("/api/auth/sign-out/").status_code, 204)
        self.assertEqual(self.client.get("/api/favorites/").status_code, 401)

    def test_bad_login(self):
        self.assertEqual(self.client.post("/api/auth/sign-in/", {"username": "reporter", "password": "wrong"}).status_code, 400)
