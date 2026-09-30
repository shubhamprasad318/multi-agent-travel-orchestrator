// Kept separate from TripMap so server components can use it without loading Leaflet.
export const DAY_COLORS = ["#C0502B", "#1F5C5B", "#C9962E", "#6B4E71", "#3C6E47", "#B5485D", "#2F5D8A", "#8A6A3B"];

export const dayColor = (day: number) => DAY_COLORS[(day - 1) % DAY_COLORS.length];
