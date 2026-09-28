from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase

from favorites.models import Favorite
from users.models import User
from venues.models import Venue


class FavoriteModelTests(TestCase):
    def setUp(self):
        self.alex = User.objects.create_user(
            username="sample_alex",
            email="alex.sample@example.com",
            password="sample-password",
        )
        self.jordan = User.objects.create_user(
            username="sample_jordan",
            email="jordan.sample@example.com",
            password="sample-password",
        )
        self.hall = Venue.objects.create(
            name="Sample Hall",
            address="123 Sample Ave",
            city="College Park",
            state="MD",
            latitude=Decimal("38.980700"),
            longitude=Decimal("-76.937200"),
        )
        self.club = Venue.objects.create(
            name="Sample Club",
            address="450 Sample Ave",
            city="College Park",
            state="MD",
            latitude=Decimal("38.982100"),
            longitude=Decimal("-76.934800"),
        )

    def test_favorite_links_user_and_venue(self):
        favorite = Favorite.objects.create(user=self.alex, venue=self.hall)

        self.assertEqual(favorite.user, self.alex)
        self.assertEqual(favorite.venue, self.hall)
        self.assertEqual(list(self.alex.favorites.all()), [favorite])
        self.assertEqual(list(self.hall.favorites.all()), [favorite])
        self.assertIsNotNone(favorite.created_at)

    def test_same_user_cannot_favorite_a_venue_twice(self):
        Favorite.objects.create(user=self.alex, venue=self.hall)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Favorite.objects.create(user=self.alex, venue=self.hall)

        self.assertEqual(Favorite.objects.filter(user=self.alex, venue=self.hall).count(), 1)

    def test_different_users_can_favorite_the_same_venue(self):
        Favorite.objects.create(user=self.alex, venue=self.hall)
        Favorite.objects.create(user=self.jordan, venue=self.hall)
        Favorite.objects.create(user=self.alex, venue=self.club)

        self.assertEqual(self.hall.favorites.count(), 2)
        self.assertEqual(self.alex.favorites.count(), 2)
