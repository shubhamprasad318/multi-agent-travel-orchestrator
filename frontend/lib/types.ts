// Mirrors orchestrator_backend/schemas.py — keep the two in sync.
// Money in plans is USD for the whole group unless the field name says otherwise;
// display it with lib/money.tsx, which converts using `TravelPlan.money`.

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
export type AgentName = "research" | "weather" | "activity" | "booking" | "itinerary" | "validator" | "revision" | "replan";
export type PackingCategory = "clothing" | "gear" | "documents" | "health" | "tech" | "other";

/** One city of a multi-city trip. The stops' nights add up to the trip's nights. */
export interface TripStop {
  destination: string;
  nights: number;
}

export interface TravelRequest {
  /** For multi-city trips the server sets this to the route, "Tokyo → Kyoto". */
  destination: string;
  /** Multi-city trips: the cities in travel order. Empty (or omitted) for one destination. */
  stops?: TripStop[];
  origin: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  budget: number; // in `currency`
  currency: string; // ISO 4217
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
  local_currency: string | null;
  sources: { title: string; url: string }[];
}

export interface WeatherDay {
  date: string;
  condition: string;
  temp_min_c: number;
  temp_max_c: number;
  precip_chance: number | null;
  /** Multi-city trips: the city this day's weather is for. */
  location?: string | null;
}

export interface PackingItem {
  item: string;
  category: PackingCategory;
  reason: string | null;
}

export interface WeatherResult {
  source: "forecast" | "climate_estimate" | "mixed";
  summary: string;
  days: WeatherDay[];
  packing_list: string[];
  advisories: string[];
  /** Categorised packing list; empty for plans made before it existed. */
  packing_items?: PackingItem[];
}

export interface Activity {
  name: string;
  category: ActivityCategory;
  description: string;
  estimated_cost: number;
  duration: string;
  best_time: string;
  location: string;
  city?: string | null;
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
  /** "recent_fare": a real fare other travellers found in the last few days (Aviasales). */
  price_source?: "estimate" | "recent_fare";
  departure_at?: string | null;
  return_at?: string | null;
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
  /** Multi-city trips: the stop this hotel is for. */
  city?: string | null;
}

/** Getting from one city of a multi-city trip to the next. */
export interface Transfer {
  from_city: string;
  to_city: string;
  date: string;
  mode: string;
  duration: string;
  cost: number;
  notes: string | null;
}

export interface BookingsResult {
  flights: Flight[];
  hotels: Hotel[];
  transfers?: Transfer[];
  notes: string[];
  prices_are_estimates: boolean;
}

export interface Slot {
  /** Stable across versions of a trip (votes and comments attach to it). Missing only on very old plans. */
  id?: string;
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
  city?: string | null;
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
  transfers?: number;
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
    stops?: TripStop[];
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
  money: MoneyInfo | null; // null only for plans made before currencies (then USD)
  errors: { agent: AgentName; message: string; retryable: boolean }[];
  trace: TraceStep[];
  version: number;
  parent_id: string | null;
  refinements: string[];
  /** The first version's id, shared by every version of the trip. */
  root_id?: string | null;
  /** Signed-in creator; null for plans made while signed out (anyone with the link can change those). */
  owner_id?: string | null;
}

/** Exchange rates frozen at planning time: units of currency per 1 USD. */
export interface MoneyInfo {
  currency: string;
  usd_rate: number;
  local_currency: string | null;
  local_usd_rate: number | null;
  rates_date: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatReply {
  answer: string;
  change_request: string | null;
  suggestions: string[];
  sources: { title: string; url: string }[];
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

// ---------------------------------------------------------------------------
// Accounts and planning together (orchestrator_backend/api/auth.py, api/collab.py)
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string | null;
  picture: string | null;
}

export interface Session {
  token: string;
  user: User;
}

export interface Person {
  id: string;
  name: string;
  picture: string | null;
}

export interface Member extends Person {
  role: "owner" | "member";
  joined_at: string | null;
}

export interface VoteTally {
  up: number;
  down: number;
  mine: -1 | 0 | 1;
  up_names: string[];
  down_names: string[];
}

export interface TripComment {
  id: string;
  slot_id: string;
  author: Person;
  text: string;
  created_at: string;
  mine: boolean;
}

export interface Collab {
  /** "open": made while signed out, anyone with the link can change it. */
  role: "owner" | "member" | "viewer" | "open";
  can_edit: boolean;
  owner: Person | null;
  members: Member[];
  invite_code: string | null;
  votes: Record<string, VoteTally>;
  comments: Record<string, TripComment[]>;
}

export interface CustomChecklistItem {
  id: string;
  item: string;
  category: PackingCategory;
}

export interface Checklist {
  checked: string[];
  custom: CustomChecklistItem[];
  updated_at: string | null;
}

/** A compact summary of one plan version, from GET /api/v1/me/trips. */
export interface TripListItem {
  id: string;
  root_id: string;
  parent_id: string | null;
  version: number;
  role: "owner" | "member" | "saved";
  destination: string;
  stops: number;
  start_date: string;
  end_date: string;
  days: number;
  travelers: number;
  created_at: string;
  estimated_total_usd: number;
  total_budget_usd: number;
  budget_status: BudgetStatus;
  score: number | null;
  validation_status: ValidationStatus | null;
  money: MoneyInfo | null;
  hotel: string | null;
  activities: number;
  refinements: number;
}

// ---------------------------------------------------------------------------
// Evaluation runs (orchestrator_backend/evals/run_evals.py output)
// ---------------------------------------------------------------------------

export interface EvalSummary {
  cases: number;
  success_rate: number | null;
  check_pass_rate: number | null;
  checks: Record<string, number | null>;
  mean_validator_score: number | null;
  approved_rate: number | null;
  revised_rate: number | null;
  judge: Record<string, number | null>;
  mean_judge_score: number | null;
  mean_latency_s: number | null;
  mean_tokens: number | null;
  mean_llm_calls: number | null;
}

export interface EvalMeta {
  created_at?: string;
  model?: string;
  grounding?: boolean;
  revision_enabled?: boolean;
  judge?: boolean;
}

export interface EvalRecord {
  id: string;
  ok: boolean;
  error: string | null;
  latency_s: number;
  tokens?: number;
  llm_calls?: number;
  validator_score?: number | null;
  validator_status?: ValidationStatus | null;
  revisions?: number;
  budget_status?: BudgetStatus;
  partial?: boolean;
  checks?: { name: string; passed: boolean | null; detail: string }[];
  judge?: Record<string, { score: number; rationale: string }> | { error: string } | null;
}

export interface EvalRunSummary {
  id: string;
  meta: EvalMeta;
  summary: EvalSummary;
}

export interface EvalRun extends EvalRunSummary {
  records: EvalRecord[];
}
