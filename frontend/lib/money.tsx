"use client";

import { createContext, useContext, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TravelPlan } from "@/lib/types";

// Plans store every amount in USD; this converts for display using the rates
// frozen into the plan (`TravelPlan.money`) at planning time.

export interface Money {
  /** The traveller's currency, e.g. "INR". */
  currency: string;
  /** The destination's currency when it differs from the traveller's, else null. */
  localCurrency: string | null;
  /** USD amount -> traveller's currency, e.g. "₹4,150". */
  format: (usd: number) => string;
  /** USD amount -> destination currency, e.g. "¥7,800", or null when not shown. */
  formatLocal: (usd: number) => string | null;
  /** USD amount -> number in the traveller's currency. */
  convert: (usd: number) => number;
}

function formatter(currency: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
}

export function moneyFor(plan: Pick<TravelPlan, "money">): Money {
  const info = plan.money;
  const currency = info?.currency ?? "USD";
  const rate = info?.usd_rate ?? 1;
  const main = formatter(currency);
  const hasLocal = !!(info?.local_currency && info.local_usd_rate && info.local_currency !== currency);
  const local = hasLocal ? formatter(info!.local_currency!) : null;
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    currency,
    localCurrency: hasLocal ? info!.local_currency : null,
    convert: (usd) => safe(usd) * rate,
    format: (usd) => main.format(safe(usd) * rate),
    formatLocal: (usd) => (local ? local.format(safe(usd) * info!.local_usd_rate!) : null),
  };
}

const MoneyContext = createContext<Money>(moneyFor({ money: null }));

export function MoneyProvider({ plan, children }: { plan: Pick<TravelPlan, "money">; children: React.ReactNode }) {
  const money = useMemo(() => moneyFor(plan), [plan]);
  return <MoneyContext.Provider value={money}>{children}</MoneyContext.Provider>;
}

export function useMoney(): Money {
  return useContext(MoneyContext);
}

/**
 * An amount in the traveller's currency, with the local-currency equivalent
 * after it ("₹4,150 · ¥7,800"). `free` renders 0 as "Free".
 */
export function Price({
  usd,
  local = true,
  free = false,
  className,
  localClassName,
}: {
  usd: number;
  local?: boolean;
  free?: boolean;
  className?: string;
  localClassName?: string;
}) {
  const money = useMoney();
  if (free && usd <= 0) return <span className={className}>Free</span>;
  const localText = local ? money.formatLocal(usd) : null;
  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>
      {money.format(usd)}
      {localText && (
        <span className={cn("ml-1.5 text-[0.8em] text-ink-muted", localClassName)} title={`Approx. in ${money.localCurrency}`}>
          · {localText}
        </span>
      )}
    </span>
  );
}

// --------------------------------------------------------------------------- //
// Choosing a currency in the form
// --------------------------------------------------------------------------- //

export const CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "INR", name: "Indian rupee" },
  { code: "JPY", name: "Japanese yen" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "AUD", name: "Australian dollar" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "AED", name: "UAE dirham" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "CHF", name: "Swiss franc" },
  { code: "HKD", name: "Hong Kong dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "KRW", name: "South Korean won" },
  { code: "THB", name: "Thai baht" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "PHP", name: "Philippine peso" },
  { code: "VND", name: "Vietnamese dong" },
  { code: "PKR", name: "Pakistani rupee" },
  { code: "BDT", name: "Bangladeshi taka" },
  { code: "LKR", name: "Sri Lankan rupee" },
  { code: "NPR", name: "Nepalese rupee" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "DKK", name: "Danish krone" },
  { code: "PLN", name: "Polish złoty" },
  { code: "TRY", name: "Turkish lira" },
  { code: "ZAR", name: "South African rand" },
  { code: "EGP", name: "Egyptian pound" },
  { code: "NGN", name: "Nigerian naira" },
  { code: "KES", name: "Kenyan shilling" },
  { code: "BRL", name: "Brazilian real" },
  { code: "MXN", name: "Mexican peso" },
];

// Region (from the browser locale, e.g. "en-IN" -> "IN") to currency.
const REGION_CURRENCY: Record<string, string> = {
  US: "USD", GB: "GBP", IN: "INR", JP: "JPY", CN: "CNY", AU: "AUD", CA: "CAD", SG: "SGD", AE: "AED",
  SA: "SAR", CH: "CHF", HK: "HKD", NZ: "NZD", KR: "KRW", TH: "THB", MY: "MYR", ID: "IDR", PH: "PHP",
  VN: "VND", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  TR: "TRY", ZA: "ZAR", EG: "EGP", NG: "NGN", KE: "KES", BR: "BRL", MX: "MXN",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", PT: "EUR",
  FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", HR: "EUR",
};

// Time zones that identify a country when the browser language has no region ("en").
const ZONE_CURRENCY: Record<string, string> = {
  "Asia/Kolkata": "INR", "Asia/Calcutta": "INR", "Asia/Tokyo": "JPY", "Asia/Singapore": "SGD",
  "Asia/Dubai": "AED", "Europe/London": "GBP", "Australia/Sydney": "AUD", "Asia/Karachi": "PKR",
  "Asia/Dhaka": "BDT", "Asia/Kathmandu": "NPR", "Asia/Colombo": "LKR",
};

/** Best guess at the user's currency from their browser; USD if unknown. */
export function detectCurrency(): string {
  if (typeof navigator === "undefined") return "USD";
  for (const lang of navigator.languages ?? [navigator.language]) {
    const region = lang.split("-")[1]?.toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ZONE_CURRENCY[zone]) return ZONE_CURRENCY[zone];
  } catch {
    /* ignore */
  }
  return "USD";
}

export function currencySymbol(code: string): string {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? code
    );
  } catch {
    return code;
  }
}
