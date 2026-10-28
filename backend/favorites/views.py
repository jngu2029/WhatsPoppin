from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from favorites.models import Favorite
from venues.models import Venue


class FavoriteList(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(list(Favorite.objects.filter(user=request.user).values_list("venue_id", flat=True)))


class FavoriteDetail(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, venue_id):
        venue = get_object_or_404(Venue, pk=venue_id)
        Favorite.objects.get_or_create(user=request.user, venue=venue)
        return Response({"venue": venue.id, "saved": True})

    def delete(self, request, venue_id):
        Favorite.objects.filter(user=request.user, venue_id=venue_id).delete()
        return Response(status=204)
