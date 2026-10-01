// Picks an icon for free text from the planner (a stop, a meal, a weather condition) by keyword.
// Purely decorative: an unmatched name falls back to a neutral icon.

import {
  BedDouble,
  BookOpen,
  Camera,
  Castle,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Croissant,
  Footprints,
  Landmark,
  Moon,
  Mountain,
  Music,
  Palette,
  PawPrint,
  Sailboat,
  ShoppingBag,
  Snowflake,
  Sparkles,
  Sun,
  Sunset,
  Ticket,
  TrainFront,
  TreePine,
  Utensils,
  UtensilsCrossed,
  Waves,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { Meal } from "@/lib/types";

const STOP_ICONS: [RegExp, LucideIcon][] = [
  [/check[\s-]?(in|out)|hotel|resort|rest\b/i, BedDouble],
  [/airport|flight|station|train|transfer|depart/i, TrainFront],
  [/boat|cruise|kayak|ferry|sail/i, Sailboat],
  [/zoo|wildlife|safari|sanctuary|bird|aquarium/i, PawPrint],
  [/beach|lake|river|waterfall|falls|confluence|sea\b|coast|dam\b/i, Waves],
  [/hill|mountain|peak|trek|hike|valley|viewpoint/i, Mountain],
  [/park|garden|forest|nature|botanical|picnic/i, TreePine],
  [/temple|shrine|church|mosque|cathedral|gurudwara|monastery|pagoda|mandir/i, Landmark],
  [/fort|palace|castle|heritage|ruins/i, Castle],
  [/museum|gallery|exhibition|art\b|craft|studio|design/i, Palette],
  [/library|book|centre of excellence|center of excellence|university/i, BookOpen],
  [/market|bazaar|shopping|mall|boutique|store/i, ShoppingBag],
  [/food|street food|dinner|lunch|breakfast|cafe|restaurant|tasting|dhaba|cooking/i, Utensils],
  [/bar\b|pub|wine|brewery|nightlife|club/i, Wine],
  [/music|concert|show|theatre|theater|cinema|dance|light show|fountain/i, Music],
  [/sunset|sunrise/i, Sunset],
  [/night|evening|pandal|festival|puja|fair/i, Sparkles],
  [/walk|stroll|tour|explore|wander/i, Footprints],
  [/photo|view|lookout/i, Camera],
  [/ticket|entry/i, Ticket],
];

export function stopIcon(activity: string): LucideIcon {
  return STOP_ICONS.find(([pattern]) => pattern.test(activity))?.[1] ?? Camera;
}

export const MEAL_ICONS: Record<Meal["type"], LucideIcon> = {
  breakfast: Croissant,
  lunch: UtensilsCrossed,
  dinner: Moon,
};

export function weatherIcon(condition: string): LucideIcon {
  if (/thunder|storm|lightning/i.test(condition)) return CloudLightning;
  if (/rain|shower|drizzle|monsoon/i.test(condition)) return CloudRain;
  if (/snow|sleet|flurr/i.test(condition)) return Snowflake;
  if (/fog|mist|haze|smog/i.test(condition)) return CloudFog;
  if (/partly|mostly sunny|sun and cloud|intervals/i.test(condition)) return CloudSun;
  if (/cloud|overcast|grey|gray/i.test(condition)) return Cloud;
  return Sun;
}
