from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("title", "venue", "start_time", "end_time", "dj_name", "music_genre")
    search_fields = ("title", "dj_name", "music_genre", "venue__name")
    list_filter = ("music_genre", "venue")
    date_hierarchy = "start_time"
    ordering = ("start_time",)
    autocomplete_fields = ("venue",)
