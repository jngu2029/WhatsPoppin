"""Verification codes for sign-up: issuing, rate limiting, and checking them.

Limits for each phone number or email address:
* a code is valid for CODE_LIFETIME and allows MAX_ATTEMPTS wrong guesses;
* a new code can be sent at most once per RESEND_COOLDOWN;
* after MAX_RESENDS resends, the next one waits LOCKOUT;
* a phone number gets at most DAILY_LIMIT[PHONE] texts per day, counted
  from the first text of that day.
"""

import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from .models import VerificationCode
from . import messaging

CODE_LIFETIME = timedelta(minutes=10)
RESEND_COOLDOWN = timedelta(minutes=1)
MAX_RESENDS = 3
LOCKOUT = timedelta(minutes=30)
MAX_ATTEMPTS = 5
DAY = timedelta(days=1)
# Texts cost money and can be abused to spam a number, so phones get a daily cap.
DAILY_LIMIT = {VerificationCode.PHONE: 10}
VERIFY_PREFIX = "twilio:"


def uses_twilio_verify(channel):
    return (
        channel == VerificationCode.PHONE
        and settings.SMS_BACKEND == "twilio"
        and bool(settings.TWILIO_VERIFY_SERVICE_SID)
    )


class SendLimited(Exception):
    def __init__(self, available_at, daily=False):
        super().__init__("Too many codes requested.")
        self.available_at = available_at
        self.daily = daily


def _daily_window(record, now):
    """(sends so far today, when today's window ends), or (0, None) if no window is running."""
    if record.day_started_at is None or now - record.day_started_at >= DAY:
        return 0, None
    return record.day_sends, record.day_started_at + DAY


class CodeRejected(Exception):
    pass


def normalize_phone(raw):
    """Return a US phone number as 123-456-7890, or raise ValidationError."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    # US numbers: 10 digits, and neither the area code nor the exchange starts with 0 or 1.
    if len(digits) != 10 or digits[0] in "01" or digits[3] in "01":
        raise ValidationError("Enter a valid 10-digit US phone number.")
    return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"


def normalize_email(raw):
    """Return a lowercase email address, or raise ValidationError."""
    value = (raw or "").strip().lower()
    validate_email(value)
    return value


def _hash(channel, destination, code):
    message = f"{channel}:{destination}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def status(record):
    """What the app needs to show the resend button."""
    now = timezone.now()
    locked = record.locked_until is not None and record.locked_until > now
    available_at = record.locked_until if locked else record.last_sent_at + RESEND_COOLDOWN
    resends_left = 0 if locked else MAX_RESENDS - record.resends
    limit = DAILY_LIMIT.get(record.channel)
    if limit:
        sent_today, window_end = _daily_window(record, now)
        if sent_today >= limit:
            available_at, resends_left = max(available_at, window_end), 0
        else:
            resends_left = min(resends_left, limit - sent_today)
    return {"resend_available_at": available_at.isoformat(), "resends_left": resends_left}


def pending_code(channel, destination):
    """The record for a code that was sent and can still be used, if any."""
    record = VerificationCode.objects.filter(channel=channel, destination=destination).first()
    if (
        record and record.code_hash and record.expires_at > timezone.now()
        and record.code_hash.startswith(VERIFY_PREFIX) == uses_twilio_verify(channel)
    ):
        return record
    return None


def issue_code(channel, destination, deliver):
    """
    Create a new code and pass it to deliver(code), enforcing the send limits.

    If delivery fails, everything rolls back, so a failed text or email
    doesn't use up one of the person's resends.
    """
    now = timezone.now()
    with transaction.atomic():
        record = (
            VerificationCode.objects.select_for_update()
            .filter(channel=channel, destination=destination)
            .first()
        )
        if record is None:
            record = VerificationCode(channel=channel, destination=destination, resends=0)
        limit = DAILY_LIMIT.get(channel)
        if limit:
            sent_today, window_end = _daily_window(record, now)
            if sent_today >= limit:
                raise SendLimited(window_end, daily=True)
            if window_end is None:  # First text of a new day.
                record.day_started_at, record.day_sends = now, 0
            record.day_sends += 1
        if record.pk is not None:
            if record.locked_until and record.locked_until > now:
                raise SendLimited(record.locked_until)
            if record.locked_until:  # The 30 minute wait is over: start fresh.
                record.locked_until = None
                record.resends = 0
            elif now < record.last_sent_at + RESEND_COOLDOWN:
                raise SendLimited(record.last_sent_at + RESEND_COOLDOWN)
            # A send soon after the last one is a resend. After a long gap the count starts over.
            elif now - record.last_sent_at < LOCKOUT:
                record.resends += 1
            else:
                record.resends = 0

        if uses_twilio_verify(channel):
            # Verify can resend the same challenge. Keep its guess count.
            challenge = VERIFY_PREFIX + messaging.send_phone_code(destination)
            if record.code_hash != challenge:
                record.failed_attempts = 0
            record.code_hash = challenge
        else:
            code = f"{secrets.randbelow(10**6):06d}"
            record.code_hash = _hash(channel, destination, code)
            record.failed_attempts = 0
        record.expires_at = now + CODE_LIFETIME
        record.last_sent_at = now
        if record.resends >= MAX_RESENDS:
            record.locked_until = now + LOCKOUT
        record.save()
        if not uses_twilio_verify(channel):
            deliver(code)
    return record


def check_code(channel, destination, code):
    """Raise CodeRejected unless code is the current code for destination. Each code works once."""
    code = re.sub(r"\s", "", code) if isinstance(code, str) else ""
    # Decide inside the transaction but raise after it commits. Raising inside
    # would roll back the failed-attempt count and remove the guess limit.
    problem = None
    with transaction.atomic():
        record = (
            VerificationCode.objects.select_for_update()
            .filter(channel=channel, destination=destination)
            .first()
        )
        if (
            record is None or not record.code_hash or record.expires_at <= timezone.now()
            or record.code_hash.startswith(VERIFY_PREFIX) != uses_twilio_verify(channel)
        ):
            problem = "This code has expired. Request a new one."
        elif record.failed_attempts >= MAX_ATTEMPTS:
            problem = "Too many incorrect codes. Request a new one."
        else:
            approved = False
            if re.fullmatch(r"[0-9]{6}", code):
                if uses_twilio_verify(channel):
                    approved = messaging.check_phone_code(
                        record.code_hash.removeprefix(VERIFY_PREFIX), code
                    )
                else:
                    approved = hmac.compare_digest(
                        _hash(channel, destination, code), record.code_hash
                    )
            if approved:
                record.code_hash = ""
                record.save(update_fields=["code_hash"])
            else:
                record.failed_attempts += 1
                record.save(update_fields=["failed_attempts"])
                problem = "That code is incorrect."
    if problem:
        raise CodeRejected(problem)
