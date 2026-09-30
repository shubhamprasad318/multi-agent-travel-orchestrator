"""Deterministic budget arithmetic. Models estimate prices; code adds them up."""

from config import VALIDATION_CONFIG
from schemas import BookingsResult, BudgetBreakdown, Itinerary, TravelRequest


def selected_flight_cost(bookings: BookingsResult | None) -> float:
    # Flights are sorted cheapest-first; the cheapest one is budgeted.
    return bookings.flights[0].total_price if bookings and bookings.flights else 0.0


def selected_lodging_cost(bookings: BookingsResult | None) -> float:
    # Hotels keep the model's order (best match first); the first one is budgeted.
    return bookings.hotels[0].total_price if bookings and bookings.hotels else 0.0


def ground_budget(request: TravelRequest, bookings: BookingsResult | None) -> float:
    """Money left for activities, food and local transport."""
    return max(0.0, request.budget - selected_flight_cost(bookings) - selected_lodging_cost(bookings))


def compute_budget(
    request: TravelRequest, bookings: BookingsResult | None, itinerary: Itinerary | None
) -> BudgetBreakdown:
    flights = selected_flight_cost(bookings)
    lodging = selected_lodging_cost(bookings)
    activities = sum(slot.cost for day in itinerary.days for slot in day.slots) if itinerary else 0.0
    food = sum(meal.cost for day in itinerary.days for meal in day.meals) if itinerary else 0.0
    total = flights + lodging + activities + food
    variance_pct = (total - request.budget) / request.budget * 100

    if itinerary is None:
        status = "Unknown"
    elif variance_pct <= 0:
        status = "Within Budget"
    elif variance_pct <= VALIDATION_CONFIG["budget_tolerance"] * 100:
        status = "Slightly Over"
    else:
        status = "Over Budget"

    return BudgetBreakdown(
        total_budget=round(request.budget, 2),
        flights=round(flights, 2),
        lodging=round(lodging, 2),
        activities=round(activities, 2),
        food=round(food, 2),
        estimated_total=round(total, 2),
        remaining=round(request.budget - total, 2),
        variance_pct=round(variance_pct, 1),
        status=status,
    )


def budget_score(budget: BudgetBreakdown) -> int:
    """0-100 feasibility score: full marks within budget, -3 points per % over."""
    if budget.status == "Unknown":
        return 50
    if budget.variance_pct <= 0:
        return 100
    return max(0, round(100 - budget.variance_pct * 3))
