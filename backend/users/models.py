from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class UserManager(DjangoUserManager):
    """Create users with Django's password hashing and a required email."""

    def _create_user_object(self, username, email, password, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address.")
        email = self.normalize_email(email).lower()
        return super()._create_user_object(username, email, password, **extra_fields)


class User(AbstractUser):
    """
    Account for someone using WhatsPoppin.

    Password storage comes from Django's authentication framework.
    Call User.objects.create_user() or the admin so the password is hashed.
    created_at is the application timestamp. Django also stores date_joined.
    """

    email = models.EmailField("email address", unique=True)
    phone = models.CharField(max_length=20, required=True, blank=False)
    date_of_birth = models.DateField(required=True, blank=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    class Meta:
        ordering = ["username"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(email=""),
                name="user_email_not_blank",
            ),
        ]

    def clean(self):
        super().clean()
        if self.date_of_birth and self.date_of_birth > timezone.localdate():
            raise ValidationError(
                {"date_of_birth": "Date of birth cannot be in the future."}
            )

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email).lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.email})"
