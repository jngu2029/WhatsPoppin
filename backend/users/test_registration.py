from concurrent.futures import ThreadPoolExecutor
from datetime import date
from unittest import skipUnless
from unittest.mock import patch
from django.db import connection, close_old_connections
from django.core.cache import cache
from django.test import TransactionTestCase
from rest_framework.test import APITestCase, APIClient
from .models import User


def payload():
    return dict(username="newperson", email="person@example.com", phone="301-555-0101", date_of_birth="2000-01-01", password="RiverCamping904", confirm_password="RiverCamping904")

class RegistrationTests(APITestCase):
    def setUp(self):
        cache.clear()

    @patch("users.serializers.timezone.localdate", return_value=date(2026, 11, 14))
    def test_registration_opens_on_twenty_first_birthday(self, _):
        url = "/api/auth/register/"
        rejected = self.client.post(url, {**payload(), "date_of_birth": "2005-11-15"})
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("at least 21", rejected.data["date_of_birth"][0])
        self.assertFalse(User.objects.exists())

        accepted = self.client.post(url, {**payload(), "date_of_birth": "2005-11-14"})
        self.assertEqual(accepted.status_code, 201, accepted.data)

    def test_success_and_login(self):
        data = payload()
        response = self.client.post("/api/auth/register/", data)
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get()
        self.assertTrue(user.check_password(data["password"]))
        self.assertNotEqual(user.password, data["password"])
        self.assertNotIn("password", response.data)
        self.assertEqual(self.client.post("/api/auth/sign-in/", data).status_code, 200)

    def test_invalid_fields(self):
        for field, value in [("email", "bad"), ("phone", "123"), ("date_of_birth", "2999-01-01"), ("date_of_birth", "2000-02-30"), ("confirm_password", "different"), ("password", "Short1"), ("password", "lowercase123"), ("password", "NoNumbersHere"), ("is_superuser", True)]:
            with self.subTest(field=field, value=value):
                cache.clear()
                data = payload(); data[field] = value
                self.assertEqual(self.client.post("/api/auth/register/", data).status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    def test_missing_fields(self):
        for field in payload():
            cache.clear()
            data = payload(); del data[field]
            self.assertEqual(self.client.post("/api/auth/register/", data).status_code, 400)

    def test_duplicates(self):
        self.client.post("/api/auth/register/", payload())
        for changes in [{}, {"username":"NEWPERSON", "email":"other@example.com"}, {"username":"different", "email":"PERSON@EXAMPLE.COM"}]:
            self.assertEqual(self.client.post("/api/auth/register/", {**payload(), **changes}).status_code, 400)
        self.assertEqual(User.objects.count(), 1)

@skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL")
class ConcurrentRegistrationTests(TransactionTestCase):
    def test_simultaneous_registration(self):
        cache.clear()
        from threading import Barrier
        barrier = Barrier(2)
        def register():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return APIClient().post("/api/auth/register/", payload()).status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: register(), range(2)))
        self.assertEqual(sorted(results), [201, 400])
        self.assertEqual(User.objects.count(), 1)
