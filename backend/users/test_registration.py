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

PHONE_URL = "/api/auth/signup/phone/"
EMAIL_URL = "/api/auth/signup/email/"
REGISTER_URL = "/api/auth/register/"


def details(token, **changes):
    data = dict(
        signup_token=token, username="newperson", date_of_birth="2000-01-01",
        password="RiverCamping904", confirm_password="RiverCamping904",
    )
    return {**data, **changes}


def verified_session(phone="301-555-0101", email="person@example.com"):
    return SignupSession.objects.create(
        token=secrets.token_urlsafe(32), phone=phone, phone_verified=True, email=email, email_verified=True,
    )


def new_token(email="person@example.com"):
    """A sign-up that has finished the email steps, ready for the phone steps."""
    return SignupSession.objects.create(
        token=secrets.token_urlsafe(32), email=email, email_verified=True,
    ).token


def sms_code():
    return re.search(r"\d{6}", messaging.outbox[-1]["body"]).group()


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


class PhoneStepTests(APITestCase):
    def setUp(self):
        cache.clear()
        messaging.outbox.clear()

    def start_phone(self, phone):
        """Start the phone step on a fresh sign-up whose email is confirmed."""
        return self.client.post(PHONE_URL, {"phone": phone, "signup_token": new_token()}, format="json")

    def test_email_must_be_confirmed_first(self):
        session = SignupSession.objects.create(token=secrets.token_urlsafe(32), email="person@example.com")
        response = self.client.post(PHONE_URL, {"phone": "301-555-0101", "signup_token": session.token}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data["non_field_errors"][0])
        self.assertEqual(messaging.outbox, [])

    def test_no_sign_up_yet_is_rejected(self):
        response = self.client.post(PHONE_URL, {"phone": "301-555-0101"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["restart"])

    def test_valid_number_sends_a_text_with_a_code(self):
        response = self.start_phone("(301) 555-0101")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["phone"], "301-555-0101")
        self.assertEqual(response.data["resends_left"], 3)
        self.assertTrue(response.data["signup_token"])
        self.assertEqual(messaging.outbox[-1]["to"], "301-555-0101")
        self.assertRegex(messaging.outbox[-1]["body"], r"\b\d{6}\b")

    def test_invalid_numbers_are_rejected_and_nothing_is_sent(self):
        for bad in ["", "123", "301-555-010", "301-555-01011", "101-555-0101", "301-155-0101", "abc-def-ghij"]:
            with self.subTest(bad=bad):
                response = self.start_phone(bad)
                self.assertEqual(response.status_code, 400)
                self.assertIn("phone", response.data)
        self.assertEqual(messaging.outbox, [])

    def test_number_already_on_an_account_is_rejected(self):
        User.objects.create_user(
            username="existing", email="e@example.com", password="x", phone="301-555-0101", date_of_birth=date(2000, 1, 1),
        )
        response = self.start_phone("3015550101")
        self.assertEqual(response.status_code, 400)
        self.assertIn("already linked", response.data["phone"][0])
        self.assertEqual(messaging.outbox, [])

    def test_correct_code_confirms_the_number(self):
        token = self.start_phone("301-555-0101").data["signup_token"]
        response = self.client.post(PHONE_URL + "verify/", {"signup_token": token, "code": sms_code()}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(SignupSession.objects.get(token=token).phone_verified)

    def test_wrong_code_is_rejected_and_limited(self):
        token = self.start_phone("301-555-0101").data["signup_token"]
        real = sms_code()
        wrong = "000000" if real != "000000" else "111111"
        for _ in range(5):
            response = self.client.post(PHONE_URL + "verify/", {"signup_token": token, "code": wrong}, format="json")
            self.assertEqual(response.data["code"][0], "That code is incorrect.")
        # After 5 wrong guesses even the right code no longer works.
        response = self.client.post(PHONE_URL + "verify/", {"signup_token": token, "code": real}, format="json")
        self.assertIn("Too many incorrect codes", response.data["code"][0])
        self.assertFalse(SignupSession.objects.get(token=token).phone_verified)

    def test_code_expires_and_works_only_once(self):
        clock = Clock(self)
        token = self.start_phone("301-555-0101").data["signup_token"]
        code = sms_code()
        clock.advance(minutes=11)
        response = self.client.post(PHONE_URL + "verify/", {"signup_token": token, "code": code}, format="json")
        self.assertIn("expired", response.data["code"][0])

        self.client.post(PHONE_URL + "resend/", {"signup_token": token}, format="json")
        code = sms_code()
        self.assertEqual(self.client.post(PHONE_URL + "verify/", {"signup_token": token, "code": code}, format="json").status_code, 200)
        self.assertEqual(self.client.post(PHONE_URL + "verify/", {"signup_token": token, "code": code}, format="json").status_code, 400)

    def test_resend_waits_a_minute_allows_three_then_waits_thirty_minutes(self):
        clock = Clock(self)
        token = self.start_phone("301-555-0101").data["signup_token"]
        resend = lambda: self.client.post(PHONE_URL + "resend/", {"signup_token": token}, format="json")  # noqa: E731

        self.assertEqual(resend().status_code, 429)  # Too soon after the first code.
        for left in (2, 1, 0):
            clock.advance(seconds=60)
            response = resend()
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["resends_left"], left)
        self.assertEqual(len(messaging.outbox), 4)  # The first code plus 3 resends.

        clock.advance(minutes=29)
        blocked = resend()
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["resend_available_at"], (clock.now + timedelta(minutes=1)).isoformat())
        clock.advance(minutes=1)
        reopened = resend()
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.data["resends_left"], 3)

    def test_limits_follow_the_number_not_the_session(self):
        Clock(self)
        self.start_phone("301-555-0101")
        # A brand-new sign-up for the same number still has to wait.
        self.assertEqual(APIClient().post(PHONE_URL, {"phone": "301-555-0101", "signup_token": new_token()}, format="json").status_code, 200)
        self.assertEqual(len(messaging.outbox), 1)  # The unused code is reused, not resent.

    def test_reentering_the_same_number_does_not_send_again(self):
        token = self.start_phone("301-555-0101").data["signup_token"]
        again = self.client.post(PHONE_URL, {"phone": "301-555-0101", "signup_token": token}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["signup_token"], token)
        self.assertEqual(len(messaging.outbox), 1)

    def test_going_back_to_a_confirmed_number_skips_the_code(self):
        token = self.start_phone("301-555-0101").data["signup_token"]
        self.client.post(PHONE_URL + "verify/", {"signup_token": token, "code": sms_code()}, format="json")
        again = self.client.post(PHONE_URL, {"phone": "301-555-0101", "signup_token": token}, format="json")
        self.assertTrue(again.data["verified"])
        self.assertEqual(len(messaging.outbox), 1)
        # A different number has to be confirmed again.
        changed = self.client.post(PHONE_URL, {"phone": "301-555-0102", "signup_token": token}, format="json")
        self.assertNotIn("verified", changed.data)
        self.assertFalse(SignupSession.objects.get(token=token).phone_verified)

    def test_one_sign_up_can_try_at_most_three_numbers(self):
        token = new_token()
        for number in ("301-555-0101", "301-555-0102", "301-555-0103"):
            response = self.client.post(PHONE_URL, {"phone": number, "signup_token": token}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            token = response.data["signup_token"]
        fourth = self.client.post(PHONE_URL, {"phone": "301-555-0104", "signup_token": token}, format="json")
        self.assertEqual(fourth.status_code, 400)
        self.assertIn("You've tried 3 phone numbers", fourth.data["phone"][0])
        self.assertEqual(len(messaging.outbox), 3)
        # Going back to a number already tried is still fine.
        again = self.client.post(PHONE_URL, {"phone": "301-555-0101", "signup_token": token}, format="json")
        self.assertEqual(again.status_code, 200)

    def test_a_number_gets_at_most_ten_texts_a_day(self):
        clock = Clock(self)
        state = {"token": self.start_phone("301-555-0101").data["signup_token"]}

        def resend():
            response = self.client.post(PHONE_URL + "resend/", {"signup_token": state["token"]}, format="json")
            if response.data.get("restart"):  # Sign-ups last an hour, so start a new one like a person would.
                response = self.start_phone("301-555-0101")
                state["token"] = response.data.get("signup_token", state["token"])
            return response

        # Each round is up to 4 texts, then the 30 minute wait: 4 + 4 + 2 = 10.
        sent = 1
        while sent < 10:
            clock.advance(minutes=31 if sent % 4 == 0 else 1)
            response = resend()
            self.assertEqual(response.status_code, 200, (sent, response.data))
            sent += 1
        self.assertEqual(response.data["resends_left"], 0)
        self.assertEqual(len(messaging.outbox), 10)

        clock.advance(minutes=31)  # Past every other wait, but still the same day.
        blocked = resend()
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("most codes allowed today", blocked.data["detail"])
        # A brand-new sign-up for the same number is blocked too.
        self.assertEqual(APIClient().post(PHONE_URL, {"phone": "301-555-0101", "signup_token": new_token()}, format="json").status_code, 429)
        self.assertEqual(len(messaging.outbox), 10)

        clock.advance(hours=24)
        self.assertEqual(resend().status_code, 200)
        self.assertEqual(len(messaging.outbox), 11)

    def test_email_has_no_daily_limit(self):
        from .verification import DAILY_LIMIT
        self.assertNotIn(VerificationCode.EMAIL, DAILY_LIMIT)

    def test_failed_text_does_not_use_up_a_send(self):
        with patch("users.messaging.send_sms", side_effect=messaging.MessagingUnavailable("down")):
            response = self.start_phone("301-555-0101")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(VerificationCode.objects.exists())


class EmailStepTests(APITestCase):
    def setUp(self):
        cache.clear()
        messaging.outbox.clear()
        self.token = None

    def start(self, email):
        response = self.client.post(EMAIL_URL, {"email": email, "signup_token": self.token}, format="json")
        self.token = response.data.get("signup_token", self.token)
        return response

    def test_valid_email_sends_a_code(self):
        response = self.start(" Person@Example.com ")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["email"], "person@example.com")
        self.assertEqual(mail.outbox[-1].to, ["person@example.com"])
        self.assertRegex(mail.outbox[-1].body, r"\b\d{6}\b")

    def test_invalid_email_is_rejected(self):
        for bad in ["", "person", "person@", "@example.com", "person@example", "a b@example.com"]:
            with self.subTest(bad=bad):
                self.assertEqual(self.start(bad).status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_email_already_on_an_account_is_rejected(self):
        User.objects.create_user(
            username="existing", email="person@example.com", password="x", phone="301-555-0199", date_of_birth=date(2000, 1, 1),
        )
        response = self.start("PERSON@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("already linked", response.data["email"][0])

    def test_email_starts_the_sign_up(self):
        response = self.start("person@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(SignupSession.objects.filter(token=response.data["signup_token"]).exists())

    def test_changing_the_email_resets_the_phone_step(self):
        self.start("person@example.com")
        self.client.post(EMAIL_URL + "verify/", {"signup_token": self.token, "code": email_code()}, format="json")
        SignupSession.objects.filter(token=self.token).update(phone="301-555-0101", phone_verified=True)
        self.start("other@example.com")
        session = SignupSession.objects.get(token=self.token)
        self.assertEqual((session.phone, session.phone_verified, session.email_verified), ("", False, False))

    def test_correct_code_confirms_the_email(self):
        self.start("person@example.com")
        response = self.client.post(EMAIL_URL + "verify/", {"signup_token": self.token, "code": email_code()}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(SignupSession.objects.get(token=self.token).email_verified)

    def test_email_resend_has_the_same_limits(self):
        clock = Clock(self)
        self.start("person@example.com")
        resend = lambda: self.client.post(EMAIL_URL + "resend/", {"signup_token": self.token}, format="json")  # noqa: E731
        self.assertEqual(resend().status_code, 429)
        for _ in range(3):
            clock.advance(seconds=60)
            self.assertEqual(resend().status_code, 200)
        clock.advance(seconds=60)
        self.assertEqual(resend().status_code, 429)
        clock.advance(minutes=30)
        self.assertEqual(resend().status_code, 200)


class RegistrationTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_full_flow_creates_the_account_with_the_confirmed_phone_and_email(self):
        messaging.outbox.clear()
        token = self.client.post(EMAIL_URL, {"email": "person@example.com"}, format="json").data["signup_token"]
        self.client.post(EMAIL_URL + "verify/", {"signup_token": token, "code": email_code()}, format="json")
        self.client.post(PHONE_URL, {"signup_token": token, "phone": "301-555-0101"}, format="json")
        self.client.post(PHONE_URL + "verify/", {"signup_token": token, "code": sms_code()}, format="json")

        response = self.client.post(REGISTER_URL, details(token), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data, {"username": "newperson"})  # No token: the app sends people to sign in.
        user = User.objects.get()
        self.assertEqual((user.phone, user.email), ("301-555-0101", "person@example.com"))
        self.assertTrue(user.check_password("RiverCamping904"))
        self.assertFalse(SignupSession.objects.exists())
        sign_in = self.client.post("/api/auth/sign-in/", {"login": "newperson", "password": "RiverCamping904"}, format="json")
        self.assertEqual(sign_in.status_code, 200)

    def test_account_needs_both_confirmations(self):
        for phone_ok, email_ok in [(False, False), (True, False), (False, True)]:
            with self.subTest(phone_ok=phone_ok, email_ok=email_ok):
                session = verified_session()
                session.phone_verified, session.email_verified = phone_ok, email_ok
                session.save()
                self.assertEqual(self.client.post(REGISTER_URL, details(session.token), format="json").status_code, 400)
        self.assertFalse(User.objects.exists())

    def test_unknown_or_expired_session_is_rejected(self):
        self.assertEqual(self.client.post(REGISTER_URL, details("nope"), format="json").status_code, 400)
        session = verified_session()
        SignupSession.objects.filter(pk=session.pk).update(created_at=timezone.now() - timedelta(hours=2))
        response = self.client.post(REGISTER_URL, details(session.token), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["restart"])

    def test_phone_and_email_cannot_be_sent_directly(self):
        session = verified_session()
        response = self.client.post(REGISTER_URL, details(session.token, email="other@example.com"), format="json")
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
            username="NewPerson", email="other@example.com", password="x", phone="301-555-0199", date_of_birth=date(2000, 1, 1),
        )
        response = self.client.post(REGISTER_URL, details(verified_session().token), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {"username"})

    def test_phone_or_email_taken_after_confirmation(self):
        User.objects.create_user(
            username="sneaky", email="person@example.com", password="x", phone="301-555-0199", date_of_birth=date(2000, 1, 1),
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
