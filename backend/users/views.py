from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView


class SignIn(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        from .serializers import SignInSerializer
        serializer = SignInSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "username": user.username, "first_name": user.first_name})


class SignOut(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=204)


class Register(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        """Create the account from a sign-up session whose phone and email are both confirmed."""
        from django.db import IntegrityError, transaction
        from .serializers import RegistrationSerializer
        from .models import SignupSession, User
        from .signup_views import expired_response, find_session

        session = find_session(request.data.get("signup_token"))
        if session is None:
            return expired_response()
        if not (session.phone_verified and session.email_verified):
            return Response({"non_field_errors": ["Confirm your phone number and email first."]}, status=400)

        serializer = RegistrationSerializer(data=request.data, context={"session": session})
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                # Someone may have used this phone or email since it was confirmed.
                if User.objects.select_for_update().filter(phone=session.phone).exists():
                    return Response({"non_field_errors": ["This phone number is already linked to an account."], "restart": True}, status=400)
                if User.objects.filter(email__iexact=session.email).exists():
                    return Response({"non_field_errors": ["This email address is already linked to an account."], "restart": True}, status=400)
                user = serializer.save()
                SignupSession.objects.filter(pk=session.pk).delete()
        except IntegrityError:
            # Two requests raced: the other one created the account (or took the username) first.
            if User.objects.filter(email__iexact=session.email).exists():
                return Response({"non_field_errors": ["This email address is already linked to an account."], "restart": True}, status=400)
            if User.objects.filter(username__iexact=serializer.validated_data["username"]).exists():
                return Response({"username": ["This username is unavailable."]}, status=400)
            raise
        # The app sends people to the sign-in page next, so no token is issued here.
        return Response({"username": user.username}, status=201)
