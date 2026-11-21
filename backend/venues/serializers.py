import math

from rest_framework import serializers
from reports.consensus import venue_consensus
from reports.models import CrowdReport
from reports.verification import is_nearby
from venues.models import Venue


class CrowdReportSerializer(serializers.ModelSerializer):
    # Optional, write-only. Used once to set verified_nearby, never saved or returned.
    latitude = serializers.FloatField(write_only=True, required=False, min_value=-90, max_value=90)
    longitude = serializers.FloatField(write_only=True, required=False, min_value=-180, max_value=180)

    class Meta:
        model = CrowdReport
        fields = ["id", "venue", "crowd_level", "wait_time", "comment", "verified_nearby", "created_at", "latitude", "longitude"]
        read_only_fields = ["id", "verified_nearby", "created_at"]

    def validate(self, attrs):
        latitude, longitude = attrs.get("latitude"), attrs.get("longitude")
        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError("Send both latitude and longitude, or neither.")
        # min/max checks let NaN through, so reject non-finite numbers explicitly.
        if latitude is not None and not (math.isfinite(latitude) and math.isfinite(longitude)):
            raise serializers.ValidationError("Latitude and longitude must be real numbers.")
        return attrs

    def create(self, validated_data):
        latitude = validated_data.pop("latitude", None)
        longitude = validated_data.pop("longitude", None)
        validated_data["verified_nearby"] = is_nearby(validated_data["venue"], latitude, longitude)
        return super().create(validated_data)


class VenueSerializer(serializers.ModelSerializer):
    reports = serializers.SerializerMethodField()
    crowd = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        fields = ["id", "name", "address", "city", "state", "latitude", "longitude", "description", "cover_fee", "image_url", "crowd", "reports"]

    def get_reports(self, obj):
        return CrowdReportSerializer(obj.preview_reports[:100], many=True).data

    def get_crowd(self, obj):
        return venue_consensus(obj.preview_reports)
