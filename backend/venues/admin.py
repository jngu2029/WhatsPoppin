from django.contrib import admin

from .models import Venue


@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ("name", "city", "state", "cover_fee", "created_at")
    search_fields = ("name", "address", "city")
    list_filter = ("city", "state")
    ordering = ("name",)
