from rest_framework import serializers
from reports.models import CrowdReport
from venues.models import Venue


class CrowdReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = CrowdReport
        fields = ["id", "venue", "crowd_level", "wait_time", "comment", "created_at"]
        read_only_fields = ["id", "created_at"]


class VenueSerializer(serializers.ModelSerializer):
    reports = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        fields = ["id", "name", "address", "city", "state", "latitude", "longitude", "description", "cover_fee", "image_url", "reports"]

    def get_reports(self, obj):
        return CrowdReportSerializer(obj.preview_reports[:100], many=True).data
