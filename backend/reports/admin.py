from django.contrib import admin

from .models import CrowdReport


@admin.register(CrowdReport)
class CrowdReportAdmin(admin.ModelAdmin):
    list_display = ("venue", "user", "crowd_level", "wait_time", "created_at")
    search_fields = ("comment", "user__username", "user__email", "venue__name")
    list_filter = ("crowd_level", "wait_time", "venue")
    ordering = ("-created_at",)
    autocomplete_fields = ("venue", "user")
    readonly_fields = ("created_at",)
