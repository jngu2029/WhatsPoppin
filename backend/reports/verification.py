"""Check that a reporter was physically near the venue when they submitted.

The reporter's coordinates are used for this one comparison and then thrown
away. Only the yes/no result is stored (CrowdReport.verified_nearby).
"""

from math import asin, cos, radians, sin, sqrt

# GPS is rough indoors and in dense areas, so this is deliberately generous.
NEARBY_METERS = 150

EARTH_RADIUS_METERS = 6_371_000


def distance_meters(lat1, lon1, lat2, lon2):
    """Great-circle (haversine) distance between two points, in meters."""
    lat1, lon1, lat2, lon2 = map(radians, (float(lat1), float(lon1), float(lat2), float(lon2)))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * asin(sqrt(a))


def is_nearby(venue, latitude, longitude):
    """True when the given position is within NEARBY_METERS of the venue."""
    if latitude is None or longitude is None:
        return False
    return distance_meters(venue.latitude, venue.longitude, latitude, longitude) <= NEARBY_METERS
