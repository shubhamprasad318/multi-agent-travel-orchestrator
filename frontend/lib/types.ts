// Mirrors orchestrator_backend/schemas.py — keep the two in sync.
// Money is USD for the whole group unless the field name says otherwise.

export type Pace = "relaxed" | "moderate" | "fast";
export type Accommodation = "budget" | "mid-range" | "luxury";
export type ActivityCategory =
  | "must_do"
  | "food"
  | "hidden_gem"
  | "nightlife"
  | "day_trip"
  | "culture"
  | "nature"
  | "wellness"
  | "shopping";
export type BudgetStatus = "Within Budget" | "Slightly Over" | "Over Budget" | "Unknown";
export type ValidationStatus = "Approved" | "Needs Review" | "Rejected";
export type AgentName = "research" | "weather" | "activity" | "booking" | "itinerary" | "validator" | "revision";

export interface TravelRequest {
  destination: string;
  origin: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  budget: number;
  travelers: number;
  preferences: {
    interests: string[];
    pace: Pace;
    accommodation: Accommodation;
  };
}

export interface ResearchResult {
  overview: string;
  highlights: string[];
  neighborhoods: { name: string; description: string; good_for: string }[];
  cultural_tips: string[];
  safety_tips: string[];
  getting_around: string;
  best_time_to_visit: string;
  sources: { title: string; url: string }[];
}

export interface WeatherDay {
  date: string;
  condition: string;
  temp_min_c: number;
  temp_max_c: number;
  precip_chance: number | null;
}

export interface WeatherResult {
  source: "forecast" | "climate_estimate" | "mixed";
  summary: string;
  days: WeatherDay[];
  packing_list: string[];
  advisories: string[];
}

export interface Activity {
  name: string;
  category: ActivityCategory;
  description: string;
  estimated_cost: number;
  duration: string;
  best_time: string;
  location: string;
}

export interface Flight {
  airline: string;
  departure_airport: string;
  arrival_airport: string;
  stops: number;
  duration: string;
  price_per_person: number;
  total_price: number;
  search_url: string;
}

export interface Hotel {
  name: string;
  area: string;
  type: string;
  rating: number | null;
  price_per_night: number;
  rooms: number;
  nights: number;
  total_price: number;
  amenities: string[];
  search_url: string;
}

export interface BookingsResult {
  flights: Flight[];
  hotels: Hotel[];
  notes: string[];
  prices_are_estimates: boolean;
}

export interface Slot {
  period: "morning" | "afternoon" | "evening";
  start_time: string;
  activity: string;
  location: string;
  cost: number;
  lat: number | null;
  lng: number | null;
}

export interface Meal {
  type: "breakfast" | "lunch" | "dinner";
  suggestion: string;
  cuisine: string;
  cost: number;
}

export interface DayPlan {
  day: number;
  date: string;
  theme: string;
  slots: Slot[];
  meals: Meal[];
  backup_options: string[];
  weather_note: string | null;
  total_cost: number;
}

export interface Itinerary {
  days: DayPlan[];
  highlights: string[];
  tips: string[];
}

export interface BudgetBreakdown {
  total_budget: number;
  flights: number;
  lodging: number;
  activities: number;
  food: number;
  estimated_total: number;
  remaining: number;
  variance_pct: number;
  status: BudgetStatus;
}

export interface Validation {
  overall_score: number;
  status: ValidationStatus;
  category_scores: Record<string, number>;
  issues: string[];
  recommendations: string[];
  revisions: number;
}

export interface TravelPlan {
  id: string;
  status: "complete" | "partial";
  created_at: string;
  request: TravelRequest;
  trip: {
    destination: string;
    origin: string | null;
    start_date: string;
    end_date: string;
    days: number;
    nights: number;
    travelers: number;
  };
  research: ResearchResult | null;
  weather: WeatherResult | null;
  activities: { activities: Activity[] } | null;
  bookings: BookingsResult | null;
  itinerary: Itinerary | null;
  budget: BudgetBreakdown;
  validation: Validation | null;
  errors: { agent: AgentName; message: string; retryable: boolean }[];
  trace: TraceStep[];
  version: number;
  parent_id: string | null;
  refinements: string[];
}

export interface TraceStep {
  agent: AgentName;
  status: "completed" | "failed";
  started_ms: number;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  llm_calls: number;
  grounded: boolean;
  sources: number;
  detail: string | null;
}

export interface ProgressEvent {
  type: "progress";
  agent: AgentName;
  status: "started" | "completed" | "failed";
  started_ms?: number;
  step?: TraceStep; // present on completed / failed
}
