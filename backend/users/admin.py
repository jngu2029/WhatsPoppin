from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "phone",
        "is_active",
        "created_at",
    )
    search_fields = ("username", "email", "first_name", "last_name", "phone")
    list_filter = ("is_active", "is_staff")
    readonly_fields = ("created_at",)
    ordering = ("username",)

    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Profile", {"fields": ("phone", "date_of_birth", "created_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "username",
                    "email",
                    "usable_password",
                    "password1",
                    "password2",
                    "first_name",
                    "last_name",
                    "phone",
                    "date_of_birth",
                ),
            },
        ),
    )
