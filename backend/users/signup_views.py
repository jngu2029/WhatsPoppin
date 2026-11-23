"""Step-by-step sign-up: confirm an email, then a phone number, then create the account.

Each step sends the signup_token returned by the first step. The same three
views serve both channels:

    POST /api/auth/signup/<phone|email>/         {signup_token?, phone|email} -> sends a code
    POST /api/auth/signup/<phone|email>/resend/  {signup_token}               -> sends a new code
    POST /api/auth/signup/<phone|email>/verify/  {signup_token, code}         -> confirms it
"""

import secrets

from django.core.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import messaging, verification
from .models import SignupSession, User, VerificationCode

PHONE, EMAIL = VerificationCode.PHONE, VerificationCode.EMAIL


def find_session(token):
    """The unexpired sign-up session for this token, or None."""
    if not token or not isinstance(token, str):
        return None
    session = SignupSession.objects.filter(token=token).first()
    if session is None or session.is_expired():
        return None
    return session


def expired_response():
    return Response(
        {"non_field_errors": ["Your sign-up has expired. Start again with your email."], "restart": True},
        status=400,
    )


def limited_response(error):
    detail = (
        "This phone number has received the most codes allowed today. Try again tomorrow."
        if error.daily
        else "Please wait before requesting another code."
    )
    return Response(
        {
            "detail": detail,
            "resend_available_at": error.available_at.isoformat(),
            "resends_left": 0,
        },
        status=429,
    )


class SignupStep(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "signup"
    channel = None  # Set by as_view(channel=...)

    def destination(self, session):
        return session.phone if self.channel == PHONE else session.email

    def send(self, session):
        """Send a code to the session's phone or email. Returns the response."""
        destination = self.destination(session)
        if self.channel == PHONE:
            deliver = lambda code: messaging.send_sms(  # noqa: E731
                destination, f"Your WhatsPoppin code is {code}. It expires in 10 minutes."
            )
        else:
            deliver = lambda code: messaging.send_code_email(destination, code)  # noqa: E731
        try:
            record = verification.issue_code(self.channel, destination, deliver)
        except verification.SendLimited as error:
            return limited_response(error)
        except messaging.MessagingUnavailable as error:
            return Response({"detail": str(error)}, status=503)
        return Response({"signup_token": session.token, self.channel: destination, **verification.status(record)})


class SignupStart(SignupStep):
    """Check the phone number or email, then send it a code."""

    def post(self, request):
        session = find_session(request.data.get("signup_token"))
        raw = request.data.get(self.channel)
        try:
            if self.channel == PHONE:
                value = verification.normalize_phone(raw)
                taken = User.objects.filter(phone=value).exists()
            else:
                value = verification.normalize_email(raw)
                taken = User.objects.filter(email__iexact=value).exists()
        except ValidationError:
            message = "Enter a valid 10-digit US phone number." if self.channel == PHONE else "Enter a valid email address."
            return Response({self.channel: [message]}, status=400)
        if taken:
            noun = "phone number" if self.channel == PHONE else "email address"
            return Response({self.channel: [f"This {noun} is already linked to an account. Try signing in."]}, status=400)

        if self.channel == EMAIL:
            # Email is the first step, so it starts the sign-up.
            if session is None:
                session = SignupSession.objects.create(token=secrets.token_urlsafe(32))
            if session.email != value:
                # A different email starts the rest of sign-up over.
                session.email, session.email_verified = value, False
                session.phone, session.phone_verified = "", False
                session.save()
        else:
            if session is None:
                return expired_response()
            if not session.email_verified:
                return Response({"non_field_errors": ["Confirm your email first."]}, status=400)
            if value not in session.phones_tried:
                if len(session.phones_tried) >= SignupSession.MAX_PHONES:
                    return Response(
                        {"phone": [
                            f"You've tried {SignupSession.MAX_PHONES} phone numbers. "
                            "Use one of those, or start sign-up over to try another."
                        ]},
                        status=400,
                    )
                session.phones_tried = [*session.phones_tried, value]
                session.save(update_fields=["phones_tried"])
            if session.phone != value:
                session.phone, session.phone_verified = value, False
                session.save()

        # Already confirmed on this sign-up (the person went back a step): no new code needed.
        if getattr(session, f"{self.channel}_verified"):
            return Response({"signup_token": session.token, self.channel: value, "verified": True})
        # Going back and forward with the same number shouldn't burn a resend.
        record = verification.pending_code(self.channel, value)
        if record is not None:
            return Response({"signup_token": session.token, self.channel: value, **verification.status(record)})
        return self.send(session)


class SignupResend(SignupStep):
    def post(self, request):
        session = find_session(request.data.get("signup_token"))
        if session is None:
            return expired_response()
        if not self.destination(session):
            return Response({"non_field_errors": [f"Enter your {self.channel} first."]}, status=400)
        return self.send(session)


class SignupVerify(SignupStep):
    throttle_scope = "signup_verify"

    def post(self, request):
        session = find_session(request.data.get("signup_token"))
        if session is None:
            return expired_response()
        destination = self.destination(session)
        if not destination:
            return Response({"non_field_errors": [f"Enter your {self.channel} first."]}, status=400)
        try:
            verification.check_code(self.channel, destination, request.data.get("code"))
        except verification.CodeRejected as error:
            return Response({"code": [str(error)]}, status=400)
        setattr(session, f"{self.channel}_verified", True)
        session.save(update_fields=[f"{self.channel}_verified"])
        return Response({"verified": True, self.channel: destination})
