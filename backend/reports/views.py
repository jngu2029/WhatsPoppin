from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import Throttled
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from reports.models import CrowdReport
from venues.serializers import CrowdReportSerializer


class ReportCreate(generics.CreateAPIView):
    serializer_class = CrowdReportSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reports"

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            serializer.save(user=user)
            return

        with transaction.atomic():
            # Serialize submissions by this account so concurrent requests
            # cannot both pass the cooldown check on PostgreSQL.
            get_user_model().objects.select_for_update().get(pk=user.pk)
            now = timezone.now()
            latest = CrowdReport.objects.filter(
                user=user, venue=serializer.validated_data["venue"],
                created_at__gt=now - timedelta(minutes=5),
            ).first()
            if latest:
                wait = (latest.created_at + timedelta(minutes=5) - now).total_seconds()
                raise Throttled(wait=wait, detail="You can report at this venue once every 5 minutes.")
            serializer.save(user=user)


class MyReports(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = CrowdReport.objects.filter(user=request.user)[:100]
        def level(value):
            return 0 if value <= 1 else 1 if value == 2 else 2 if value <= 4 else 3
        return Response([{
            "id": str(row.id), "venueId": row.venue_id, "level": level(row.crowd_level),
            "createdAt": row.created_at.isoformat(), "wait": None if row.wait_time == 5 else row.wait_time,
            "mine": True,
        } for row in rows])
