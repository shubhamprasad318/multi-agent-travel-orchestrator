"""Sanity checks for model-provided coordinates."""

import math
from statistics import median

# Day trips can go far, but not this far from the rest of the itinerary.
MAX_DISTANCE_KM = 300


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _valid(lat: float, lng: float) -> bool:
    return -90 <= lat <= 90 and -180 <= lng <= 180 and not (abs(lat) < 1e-6 and abs(lng) < 1e-6)


def plausible_points(points: list[tuple[float, float]]) -> list[bool]:
    """For each (lat, lng), whether it is valid and near the itinerary's centre.

    The centre is the per-axis median, so a few bad points can't drag it away.
    """
    valid = [_valid(lat, lng) for lat, lng in points]
    good = [p for p, ok in zip(points, valid) if ok]
    if not good:
        return valid
    centre_lat = median(p[0] for p in good)
    centre_lng = median(p[1] for p in good)
    return [ok and haversine_km(lat, lng, centre_lat, centre_lng) <= MAX_DISTANCE_KM for (lat, lng), ok in zip(points, valid)]
