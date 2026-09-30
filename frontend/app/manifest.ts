import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Served at /manifest.webmanifest: makes the app installable ("Add to Home Screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.short,
    description: BRAND.tagline,
    start_url: "/trips",
    scope: "/",
    display: "standalone",
    background_color: "#F6F1E7",
    theme_color: "#C0502B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
