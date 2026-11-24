from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower
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
    date_of_birth = models.DateField(blank=False, null=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    class Meta:
        ordering = ["username"]
        constraints = [
            models.UniqueConstraint(Lower("username"), name="user_username_ci_unique"),
            models.UniqueConstraint(Lower("email"), name="user_email_ci_unique"),
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


class SignupSession(models.Model):
    """
    One person's progress through the sign-up steps.

    The app holds the random token and sends it with each step. An account can
    only be created once the email on this session has been confirmed with a code.
    """

    LIFETIME = timezone.timedelta(hours=1)

    token = models.CharField(max_length=64, unique=True)
    email = models.EmailField(blank=True)
    email_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() - self.created_at > self.LIFETIME

    def __str__(self):
        return f"Sign-up for {self.email or 'no email yet'}"


class VerificationCode(models.Model):
    """
    The current code for one email address, plus its send limits.

    There is one row per email, so the resend limits apply to the email
    itself, not to a sign-up session that could be restarted.
    """

    EMAIL = "email"
    CHANNELS = [(EMAIL, "Email")]

    channel = models.CharField(max_length=5, choices=CHANNELS)
    destination = models.CharField(max_length=254)
    code_hash = models.CharField(max_length=64, blank=True)
    expires_at = models.DateTimeField()
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    last_sent_at = models.DateTimeField()
    resends = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["channel", "destination"], name="one_code_per_destination"),
        ]

    def __str__(self):
        return f"{self.channel} code for {self.destination}"
