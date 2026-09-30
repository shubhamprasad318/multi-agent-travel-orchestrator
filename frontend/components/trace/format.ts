export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function formatTokens(tokens: number): string {
  if (tokens === 0) return "0 tok";
  return tokens < 1000 ? `${tokens} tok` : `${(tokens / 1000).toFixed(1)}k tok`;
}
