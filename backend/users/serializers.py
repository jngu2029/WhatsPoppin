import re
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers
from .models import User


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)

    class Meta:
        model = User
        fields = ["username", "email", "phone", "date_of_birth", "password", "confirm_password"]

    def validate_username(self, value):
        value = User.normalize_username(value.strip())
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is unavailable.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is unavailable. Try signing in.")
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
            validate_password(password, User(username=attrs["username"], email=attrs["email"]))
        except DjangoValidationError as exc:
            errors.setdefault("password", []).extend(exc.messages)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        return User.objects.create_user(**validated_data)
