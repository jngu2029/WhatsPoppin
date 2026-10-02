from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from users.models import User


class UserModelTests(TestCase):
    def test_create_user_stores_profile_fields(self):
        user = User.objects.create_user(
            username="sample_alex",
            email="Alex.Sample@Example.com",
            password="sample-password",
            first_name="Alex",
            last_name="Sample",
            phone="301-555-0101",
            date_of_birth=date(2004, 3, 15),
        )

        self.assertEqual(settings.AUTH_USER_MODEL, "users.User")
        self.assertEqual(user.username, "sample_alex")
        self.assertEqual(user.email, "alex.sample@example.com")
        self.assertEqual(user.first_name, "Alex")
        self.assertEqual(user.last_name, "Sample")
        self.assertEqual(user.phone, "301-555-0101")
        self.assertEqual(user.date_of_birth, date(2004, 3, 15))
        self.assertIsNotNone(user.created_at)

    def test_password_is_hashed(self):
        raw_password = "sample-password"
        user = User.objects.create_user(
            username="sample_jordan",
            email="jordan.sample@example.com",
            password=raw_password,
            phone="301-555-0101",
            date_of_birth=date(2004, 3, 15),
        )

        self.assertNotEqual(user.password, raw_password)
        self.assertNotIn(raw_password, user.password)
        self.assertTrue(user.password.startswith("pbkdf2_sha256$"))
        self.assertTrue(user.check_password(raw_password))
        self.assertFalse(user.check_password("wrong-password"))

    def test_email_is_required(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(
                username="sample_riley",
                email="",
                password="sample-password",
                phone="301-555-0101",
                date_of_birth=date(2004, 3, 15),
            )

    def test_email_must_be_unique(self):
        User.objects.create_user(
            username="sample_alex",
            email="Alex@Example.com",
            password="sample-password",
            phone="301-555-0101",
            date_of_birth=date(2004, 3, 15),
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                User.objects.create_user(
                    username="sample_alex_2",
                    email="alex@example.com",
                    password="sample-password",
                    phone="301-555-0101",
                    date_of_birth=date(2004, 3, 15),
                )

    def test_date_of_birth_cannot_be_in_the_future(self):
        user = User(
            username="sample_future",
            email="future.sample@example.com",
            phone="301-555-0101",
            date_of_birth=date(2999, 1, 1),
        )
        user.set_password("sample-password")

        with self.assertRaises(ValidationError):
            user.full_clean()

    def test_date_of_birth_is_required(self):
        user = User(
            username="sample_no_dob",
            email="no_dob.sample@example.com",
            phone="301-555-0101",
        )
        user.set_password("sample-password")
        with self.assertRaises(ValidationError):
            user.full_clean()

    def test_phone_is_required(self):
        user = User(
            username="sample_no_phone",
            email="no_phone.sample@example.com",
            date_of_birth=date(2004, 3, 15),
        )
        user.set_password("sample-password")
        with self.assertRaises(ValidationError) as cm:
            user.full_clean()
        self.assertIn("phone", cm.exception.message_dict)

    def test_phone_accepts_valid_format(self):
        user = User(
            username="sample_valid_phone",
            email="valid_phone.sample@example.com",
            phone="123-456-7890",
            date_of_birth=date(2004, 3, 15),
        )
        user.set_password("sample-password")
        user.full_clean()

    def test_phone_rejects_invalid_format(self):
        user = User(
            username="sample_invalid_phone",
            email="invalid_phone.sample@example.com",
            phone="not-a-phone",
            date_of_birth=date(2004, 3, 15),
        )
        user.set_password("sample-password")
        with self.assertRaises(ValidationError) as cm:
            user.full_clean()
        self.assertIn("phone", cm.exception.message_dict)