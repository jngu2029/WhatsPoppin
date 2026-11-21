"""Sending verification codes by text message and email.

Text messages go through Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
TWILIO_FROM_NUMBER are set. In local development (DEBUG) without Twilio, the
message is printed to the server console instead. Email uses Django's email
settings, which print to the console in development unless EMAIL_HOST is set.
"""

import base64
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("whatspoppin.messaging")

# Text messages "sent" while SMS_BACKEND is "memory" (used by tests).
outbox = []


class MessagingUnavailable(Exception):
    pass


def send_sms(phone, body):
    """phone is a US number in 123-456-7890 format."""
    backend = settings.SMS_BACKEND
    if backend == "memory":
        outbox.append({"to": phone, "body": body})
    elif backend == "console":
        logger.warning("Text message to %s: %s", phone, body)
    elif backend == "twilio":
        _send_twilio(phone, body)
    else:
        raise MessagingUnavailable("Text messages aren't set up on this server yet.")


def _send_twilio(phone, body):
    sid, token = settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN
    request = urllib.request.Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        data=urllib.parse.urlencode({
            "To": "+1" + phone.replace("-", ""),
            "From": settings.TWILIO_FROM_NUMBER,
            "Body": body,
        }).encode(),
        headers={"Authorization": "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode()},
    )
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except (urllib.error.URLError, TimeoutError) as error:
        logger.error("Twilio send failed: %s", error)
        raise MessagingUnavailable("We couldn't send a text message right now. Try again shortly.")


def send_code_email(email, code):
    try:
        send_mail(
            "Your WhatsPoppin verification code",
            f"Your WhatsPoppin verification code is {code}. It expires in 10 minutes.\n\n"
            "If you didn't try to create an account, you can ignore this email.",
            settings.DEFAULT_FROM_EMAIL,
            [email],
        )
    except Exception as error:  # SMTP and connection errors vary by backend.
        logger.error("Verification email failed: %s", error)
        raise MessagingUnavailable("We couldn't send an email right now. Try again shortly.")
