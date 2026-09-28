from django.contrib import admin

from .models import Favorite


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "venue", "created_at")
    search_fields = ("user__username", "user__email", "venue__name")
    list_filter = ("venue",)
    ordering = ("-created_at",)
    autocomplete_fields = ("user", "venue")
    readonly_fields = ("created_at",)
