"""URL configuration for the WhatsPoppin backend."""

from django.contrib import admin
from django.urls import path
from venues.views import VenueList
from reports.views import ReportCreate, MyReports
from favorites.views import FavoriteList, FavoriteDetail
from users.views import SignIn, SignOut

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/venues/", VenueList.as_view()),
    path("api/reports/", ReportCreate.as_view()),
    path("api/reports/mine/", MyReports.as_view()),
    path("api/favorites/", FavoriteList.as_view()),
    path("api/favorites/<int:venue_id>/", FavoriteDetail.as_view()),
    path("api/auth/sign-in/", SignIn.as_view()),
    path("api/auth/sign-out/", SignOut.as_view()),
]
