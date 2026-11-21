from datetime import date

from django.core.cache import cache
from rest_framework.test import APITestCase

from .models import User

URL = "/api/auth/sign-in/"
PASSWORD = "RiverCamping904"


class SignInTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.alex = User.objects.create_user(
            username="alex", email="alex@example.com", password=PASSWORD,
            phone="301-555-0101", date_of_birth=date(2000, 1, 1),
        )
        self.sam = User.objects.create_user(
            username="sam", email="sam@example.com", password="OtherPassword123",
            phone="301-555-0102", date_of_birth=date(2000, 1, 1),
        )

    def sign_in(self, login, password=PASSWORD, field="login"):
        return self.client.post(URL, {field: login, "password": password}, format="json")

    def test_username_signs_in(self):
        response = self.sign_in("alex")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "alex")
        self.assertTrue(response.data["token"])

    def test_email_signs_in_to_its_own_account(self):
        response = self.sign_in("alex@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "alex")

    def test_username_and_email_are_case_insensitive_and_trimmed(self):
        self.assertEqual(self.sign_in("  ALEX ").status_code, 200)
        self.assertEqual(self.sign_in(" Alex@Example.COM ").status_code, 200)

    def test_older_clients_sending_username_still_work(self):
        self.assertEqual(self.sign_in("alex@example.com", field="username").status_code, 200)

    def test_email_only_works_with_the_password_of_the_account_it_is_linked_to(self):
        # Sam's email with Alex's password must not sign in to either account.
        response = self.sign_in("sam@example.com", PASSWORD)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["non_field_errors"][0], "Incorrect username, email, or password.")

    def test_invalid_email_is_rejected_before_any_lookup(self):
        for bad in ["alex@", "@example.com", "alex@example", "alex@@example.com", "a b@example.com"]:
            response = self.sign_in(bad)
            self.assertEqual(response.status_code, 400, bad)
            self.assertEqual(response.data["login"][0], "Enter a valid email address.", bad)

    def test_unknown_accounts_and_wrong_passwords_get_the_same_message(self):
        messages = {
            self.sign_in("nobody").data["non_field_errors"][0],
            self.sign_in("nobody@example.com").data["non_field_errors"][0],
            self.sign_in("alex", "WrongPassword1").data["non_field_errors"][0],
            self.sign_in("alex@example.com", "WrongPassword1").data["non_field_errors"][0],
        }
        self.assertEqual(messages, {"Incorrect username, email, or password."})

    def test_blank_login_is_rejected(self):
        self.assertEqual(self.sign_in("   ").status_code, 400)
        self.assertEqual(self.client.post(URL, {"password": PASSWORD}, format="json").status_code, 400)

    def test_inactive_account_cannot_sign_in(self):
        self.alex.is_active = False
        self.alex.save(update_fields=["is_active"])
        self.assertEqual(self.sign_in("alex@example.com").status_code, 400)
