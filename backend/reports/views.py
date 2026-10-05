from rest_framework import generics
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
        serializer.save(user=self.request.user)


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
