import re
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers
from .models import User


class RegistrationSerializer(serializers.ModelSerializer):
    """
    The last sign-up step. The email is not sent here: it comes from the
    sign-up session (context["session"]), where it was confirmed with a code.
    """

    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
    signup_token = serializers.CharField(write_only=True, max_length=64)

    class Meta:
        model = User
        fields = [
            "username", "first_name", "last_name", "date_of_birth",
            "password", "confirm_password", "signup_token",
        ]
        extra_kwargs = {
            "username": {"trim_whitespace": False},
            "first_name": {"required": False, "allow_blank": True, "trim_whitespace": False},
            "last_name": {"required": False, "allow_blank": True, "trim_whitespace": False},
        }

    def validate_first_name(self, value):
        if value and not value.isalpha():
            raise serializers.ValidationError("Use letters only.")
        return value

    validate_last_name = validate_first_name

    def validate_username(self, value):
        if re.search(r"\s", value):
            raise serializers.ValidationError("Usernames cannot contain spaces.")
        value = User.normalize_username(value)
        if not re.fullmatch(r"[\w]+", value):
            raise serializers.ValidationError("Use only letters, numbers, and underscores.")
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is unavailable.")
        return value

    def validate_password(self, value):
        if re.search(r"\s", value):
            raise serializers.ValidationError("Passwords cannot contain spaces.")
        return value

    def validate_date_of_birth(self, value):
        today = timezone.localdate()
        if value > today:
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        if age < 21:
            raise serializers.ValidationError("You must be at least 21 to create an account.")
        return value

    def validate(self, attrs):
        errors = {}
        unknown = set(self.initial_data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({"non_field_errors": ["Unexpected account fields."]})
        password = attrs["password"]
        if len(password) < 10 or not re.search(r"[A-Z]", password) or not re.search(r"[0-9]", password):
            errors["password"] = ["Use at least 10 characters, one uppercase letter, and one number."]
        if password != attrs["confirm_password"]:
            errors["confirm_password"] = ["Passwords do not match."]
        try:
            validate_password(password, User(username=attrs["username"], email=self.context["session"].email))
        except DjangoValidationError as exc:
            errors.setdefault("password", []).extend(exc.messages)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        validated_data.pop("signup_token")
        session = self.context["session"]
        return User.objects.create_user(**validated_data, email=session.email)


class SignInSerializer(serializers.Serializer):
    """
    Sign in with a username or an email address plus the password.

    Anything containing "@" is treated as an email: it must be a valid address
    and must belong to the account whose password is given. Wrong passwords and
    unknown usernames/emails get the same message, so the form can't be used to
    check which accounts exist.
    """

    # "login" is the field the app sends. "username" is still accepted for older clients.
    login = serializers.CharField(required=False, max_length=254)
    username = serializers.CharField(required=False, max_length=254)
    password = serializers.CharField(trim_whitespace=False, max_length=128)

    INVALID = "Incorrect username, email, or password."

    def validate(self, attrs):
        from django.contrib.auth import authenticate
        from django.core.validators import validate_email

        login = (attrs.get("login") or attrs.get("username") or "").strip()
        if not login:
            raise serializers.ValidationError({"login": ["Enter your username or email."]})

        if "@" in login:
            try:
                validate_email(login)
            except DjangoValidationError:
                raise serializers.ValidationError({"login": ["Enter a valid email address."]})
            account = User.objects.filter(email__iexact=login).first()
        else:
            account = User.objects.filter(username__iexact=login).first()

        if account is None:
            # Hash anyway so an unknown account takes as long as a wrong password.
            User().set_password(attrs["password"])
            raise serializers.ValidationError(self.INVALID)

        # authenticate() checks the password against this exact account, so an
        # email only signs in to the account it is linked to. It also rejects
        # inactive accounts.
        user = authenticate(
            request=self.context.get("request"),
            username=account.username,
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError(self.INVALID)
        attrs["user"] = user
        return attrs
