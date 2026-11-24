import re
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from unittest import skipUnless
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.db import close_old_connections, connection
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from . import messaging
from .models import SignupSession, User, VerificationCode

EMAIL_URL = "/api/auth/signup/email/"
REGISTER_URL = "/api/auth/register/"


def details(token, **changes):
    data = dict(
        signup_token=token, username="newperson", date_of_birth="2000-01-01",
        password="RiverCamping904", confirm_password="RiverCamping904",
    )
    return {**data, **changes}


def verified_session(email="person@example.com"):
    return SignupSession.objects.create(token=secrets.token_urlsafe(32), email=email, email_verified=True)


def email_code():
    return re.search(r"\d{6}", mail.outbox[-1].body).group()


class Clock:
    """Moves timezone.now() forward without sleeping."""

    def __init__(self, test):
        self.now = timezone.now()
        patcher = patch("django.utils.timezone.now", side_effect=lambda: self.now)
        patcher.start()
        test.addCleanup(patcher.stop)

    def advance(self, **kwargs):
        self.now += timedelta(**kwargs)


class EmailStepTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.token = None

    def start(self, email):
        response = self.client.post(EMAIL_URL, {"email": email, "signup_token": self.token}, format="json")
        self.token = response.data.get("signup_token", self.token)
        return response

    def verify(self, code):
        return self.client.post(EMAIL_URL + "verify/", {"signup_token": self.token, "code": code}, format="json")

    def resend(self):
        return self.client.post(EMAIL_URL + "resend/", {"signup_token": self.token}, format="json")

    def test_valid_email_sends_a_code(self):
        response = self.start(" Person@Example.com ")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["email"], "person@example.com")
        self.assertEqual(response.data["resends_left"], 3)
        self.assertEqual(mail.outbox[-1].to, ["person@example.com"])
        self.assertRegex(mail.outbox[-1].body, r"\b\d{6}\b")

    def test_invalid_email_is_rejected(self):
        for bad in ["", "person", "person@", "@example.com", "person@example", "a b@example.com"]:
            with self.subTest(bad=bad):
                self.assertEqual(self.start(bad).status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_email_already_on_an_account_is_rejected(self):
        User.objects.create_user(
            username="existing", email="person@example.com", password="x", date_of_birth=date(2000, 1, 1),
        )
        response = self.start("PERSON@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("already linked", response.data["email"][0])
        self.assertEqual(len(mail.outbox), 0)

    def test_email_starts_the_sign_up(self):
        response = self.start("person@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(SignupSession.objects.filter(token=response.data["signup_token"]).exists())

    def test_phone_sign_up_no_longer_exists(self):
        for url in ("/api/auth/signup/phone/", "/api/auth/signup/phone/resend/", "/api/auth/signup/phone/verify/"):
            with self.subTest(url=url):
                self.assertEqual(self.client.post(url, {"phone": "301-555-0101"}, format="json").status_code, 404)

    def test_correct_code_confirms_the_email(self):
        self.start("person@example.com")
        self.assertEqual(self.verify(email_code()).status_code, 200)
        self.assertTrue(SignupSession.objects.get(token=self.token).email_verified)

    def test_changing_the_email_needs_a_new_confirmation(self):
        self.start("person@example.com")
        self.verify(email_code())
        self.start("other@example.com")
        self.assertFalse(SignupSession.objects.get(token=self.token).email_verified)

    def test_wrong_code_is_rejected_and_limited(self):
        self.start("person@example.com")
        real = email_code()
        wrong = "000000" if real != "000000" else "111111"
        for _ in range(5):
            self.assertEqual(self.verify(wrong).data["code"][0], "That code is incorrect.")
        # After 5 wrong guesses even the right code no longer works.
        self.assertIn("Too many incorrect codes", self.verify(real).data["code"][0])
        self.assertFalse(SignupSession.objects.get(token=self.token).email_verified)

    def test_code_expires_and_works_only_once(self):
        clock = Clock(self)
        self.start("person@example.com")
        code = email_code()
        clock.advance(minutes=11)
        self.assertIn("expired", self.verify(code).data["code"][0])

        self.resend()
        code = email_code()
        self.assertEqual(self.verify(code).status_code, 200)
        self.assertEqual(self.verify(code).status_code, 400)

    def test_resend_waits_a_minute_allows_three_then_waits_thirty_minutes(self):
        clock = Clock(self)
        self.start("person@example.com")
        self.assertEqual(self.resend().status_code, 429)  # Too soon after the first code.
        for left in (2, 1, 0):
            clock.advance(seconds=60)
            response = self.resend()
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["resends_left"], left)
        self.assertEqual(len(mail.outbox), 4)  # The first code plus 3 resends.

        clock.advance(minutes=29)
        blocked = self.resend()
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["resend_available_at"], (clock.now + timedelta(minutes=1)).isoformat())
        clock.advance(minutes=1)
        reopened = self.resend()
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.data["resends_left"], 3)

    def test_limits_follow_the_email_not_the_session(self):
        self.start("person@example.com")
        # A brand-new sign-up for the same email reuses the unused code instead of sending another.
        again = APIClient().post(EMAIL_URL, {"email": "person@example.com"}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_going_back_to_a_confirmed_email_skips_the_code(self):
        self.start("person@example.com")
        self.verify(email_code())
        again = self.start("person@example.com")
        self.assertTrue(again.data["verified"])
        self.assertEqual(len(mail.outbox), 1)

    def test_failed_email_does_not_use_up_a_send(self):
        with patch("users.messaging.send_code_email", side_effect=messaging.MessagingUnavailable("down")):
            response = self.start("person@example.com")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(VerificationCode.objects.exists())

    def test_resend_and_verify_need_a_sign_up(self):
        self.assertTrue(self.resend().data["restart"])
        self.assertTrue(self.verify("123456").data["restart"])


class RegistrationTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_full_flow_creates_the_account_with_the_confirmed_email(self):
        token = self.client.post(EMAIL_URL, {"email": "person@example.com"}, format="json").data["signup_token"]
        self.client.post(EMAIL_URL + "verify/", {"signup_token": token, "code": email_code()}, format="json")

        response = self.client.post(REGISTER_URL, details(token), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data, {"username": "newperson"})  # No token: the app sends people to sign in.
        user = User.objects.get()
        self.assertEqual(user.email, "person@example.com")
        self.assertTrue(user.check_password("RiverCamping904"))
        self.assertFalse(SignupSession.objects.exists())
        sign_in = self.client.post("/api/auth/sign-in/", {"login": "newperson", "password": "RiverCamping904"}, format="json")
        self.assertEqual(sign_in.status_code, 200)

    def test_account_needs_a_confirmed_email(self):
        session = SignupSession.objects.create(token=secrets.token_urlsafe(32), email="person@example.com")
        response = self.client.post(REGISTER_URL, details(session.token), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Confirm your email", response.data["non_field_errors"][0])
        self.assertFalse(User.objects.exists())

    def test_unknown_or_expired_session_is_rejected(self):
        self.assertEqual(self.client.post(REGISTER_URL, details("nope"), format="json").status_code, 400)
        session = verified_session()
        SignupSession.objects.filter(pk=session.pk).update(created_at=timezone.now() - timedelta(hours=2))
        response = self.client.post(REGISTER_URL, details(session.token), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["restart"])

    def test_email_or_phone_cannot_be_sent_directly(self):
        session = verified_session()
        for extra in ({"email": "other@example.com"}, {"phone": "301-555-0101"}):
            response = self.client.post(REGISTER_URL, details(session.token, **extra), format="json")
            self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.exists())

    @patch("users.serializers.timezone.localdate", return_value=date(2026, 11, 14))
    def test_registration_opens_on_twenty_first_birthday(self, _):
        session = verified_session()
        rejected = self.client.post(REGISTER_URL, details(session.token, date_of_birth="2005-11-15"), format="json")
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("at least 21", rejected.data["date_of_birth"][0])
        accepted = self.client.post(REGISTER_URL, details(session.token, date_of_birth="2005-11-14"), format="json")
        self.assertEqual(accepted.status_code, 201, accepted.data)

    def test_invalid_details(self):
        cases = [
            ("date_of_birth", "2999-01-01"), ("date_of_birth", "2000-02-30"), ("date_of_birth", "01/01/2000"),
            ("confirm_password", "different"), ("password", "Short1"), ("password", "lowercase123"),
            ("password", "NoNumbersHere"), ("is_superuser", True),
        ]
        session = verified_session()
        for field, value in cases:
            with self.subTest(field=field, value=value):
                cache.clear()
                data = details(session.token)
                data[field] = value
                if field == "password":
                    data["confirm_password"] = value
                self.assertEqual(self.client.post(REGISTER_URL, data, format="json").status_code, 400)
        self.assertFalse(User.objects.exists())

    def test_missing_details(self):
        session = verified_session()
        for field in details(session.token):
            with self.subTest(field=field):
                cache.clear()
                data = details(session.token)
                del data[field]
                self.assertEqual(self.client.post(REGISTER_URL, data, format="json").status_code, 400)

    def test_duplicate_username(self):
        User.objects.create_user(
            username="NewPerson", email="other@example.com", password="x", date_of_birth=date(2000, 1, 1),
        )
        response = self.client.post(REGISTER_URL, details(verified_session().token), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {"username"})

    def test_email_taken_after_confirmation(self):
        User.objects.create_user(
            username="sneaky", email="person@example.com", password="x", date_of_birth=date(2000, 1, 1),
        )
        response = self.client.post(REGISTER_URL, details(verified_session().token), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["restart"])
        self.assertEqual(User.objects.count(), 1)


@skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL")
class ConcurrentRegistrationTests(TransactionTestCase):
    def test_simultaneous_registration(self):
        cache.clear()
        from threading import Barrier
        token = verified_session().token
        barrier = Barrier(2)

        def register():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return APIClient().post(REGISTER_URL, details(token), format="json").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: register(), range(2)))
        self.assertEqual(sorted(results), [201, 400])
        self.assertEqual(User.objects.count(), 1)
