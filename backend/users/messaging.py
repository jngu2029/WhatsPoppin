"""Sending verification codes by email, using Django's email settings.

Local development prints emails to the server console unless EMAIL_HOST is set.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("whatspoppin.messaging")


class MessagingUnavailable(Exception):
    pass


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
