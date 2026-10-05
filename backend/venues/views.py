"""Public venue discovery, including the most recent crowd reports."""
from django.db.models import Prefetch
from rest_framework import generics
from rest_framework.permissions import AllowAny
from reports.models import CrowdReport
from venues.models import Venue
from venues.serializers import VenueSerializer


class VenueList(generics.ListAPIView):
    serializer_class = VenueSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        return Venue.objects.prefetch_related(Prefetch(
            "crowd_reports", queryset=CrowdReport.objects.order_by("-created_at")[:100],
            to_attr="preview_reports",
        ))
