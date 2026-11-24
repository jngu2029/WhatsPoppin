"""Step-by-step sign-up: confirm an email with a code, then create the account.

Each step after the first sends the signup_token returned by the first step.

    POST /api/auth/signup/email/         {signup_token?, email}  -> sends a code
    POST /api/auth/signup/email/resend/  {signup_token}          -> sends a new code
    POST /api/auth/signup/email/verify/  {signup_token, code}    -> confirms it
"""

import secrets

from django.core.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import messaging, verification
from .models import SignupSession, User, VerificationCode

EMAIL = VerificationCode.EMAIL


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
    return Response(
        {
            "detail": "Please wait before requesting another code.",
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

    def send(self, session):
        """Email a code to the session's address. Returns the response."""
        email = session.email
        try:
            record = verification.issue_code(
                EMAIL, email, lambda code: messaging.send_code_email(email, code)
            )
        except verification.SendLimited as error:
            return limited_response(error)
        except messaging.MessagingUnavailable as error:
            return Response({"detail": str(error)}, status=503)
        return Response({"signup_token": session.token, "email": email, **verification.status(record)})


class SignupStart(SignupStep):
    """Check the email, then send it a code. Starts the sign-up if there isn't one yet."""

    def post(self, request):
        session = find_session(request.data.get("signup_token"))
        try:
            email = verification.normalize_email(request.data.get("email"))
        except ValidationError:
            return Response({"email": ["Enter a valid email address."]}, status=400)
        if User.objects.filter(email__iexact=email).exists():
            return Response({"email": ["This email address is already linked to an account. Try signing in."]}, status=400)

        if session is None:
            session = SignupSession.objects.create(token=secrets.token_urlsafe(32))
        if session.email != email:
            session.email, session.email_verified = email, False
            session.save()

        # Already confirmed on this sign-up (the person went back a step): no new code needed.
        if session.email_verified:
            return Response({"signup_token": session.token, "email": email, "verified": True})
        # Going back and forward with the same email shouldn't burn a resend.
        record = verification.pending_code(EMAIL, email)
        if record is not None:
            return Response({"signup_token": session.token, "email": email, **verification.status(record)})
        return self.send(session)


class SignupResend(SignupStep):
    def post(self, request):
        session = find_session(request.data.get("signup_token"))
        if session is None:
            return expired_response()
        if not session.email:
            return Response({"non_field_errors": ["Enter your email first."]}, status=400)
        return self.send(session)


class SignupVerify(SignupStep):
    throttle_scope = "signup_verify"

    def post(self, request):
        session = find_session(request.data.get("signup_token"))
        if session is None:
            return expired_response()
        if not session.email:
            return Response({"non_field_errors": ["Enter your email first."]}, status=400)
        try:
            verification.check_code(EMAIL, session.email, request.data.get("code"))
        except verification.CodeRejected as error:
            return Response({"code": [str(error)]}, status=400)
        session.email_verified = True
        session.save(update_fields=["email_verified"])
        return Response({"verified": True, "email": session.email})
