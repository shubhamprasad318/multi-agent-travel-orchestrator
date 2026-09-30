import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
// Variable serif with optical sizing and a "soft" axis for the editorial headlines.
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", axes: ["opsz", "SOFT"] });

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: "Research, weather, activities, bookings and a day-by-day itinerary, planned and checked by a team of AI agents.",
  keywords: ["travel", "AI", "planning", "itinerary", "vacation"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={cn(sans.variable, serif.variable, "font-sans antialiased bg-paper text-ink")}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-ink focus:text-paper focus:px-4 focus:py-2 focus:rounded"
        >
          Skip to content
        </a>
        <div className="relative min-h-screen flex flex-col">
          <Navbar />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
