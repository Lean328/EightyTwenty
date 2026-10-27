// Apply after selecting API, localStorage or bundled data, so stale content stays hidden.
// Keep the underlying records and all other cafés intact.
export function publicLocations(locations) {
  return locations.filter(location => location.id !== 'akuna');
}

// Menu copy also contains surcharges ("GFO +$1", "Pulled Lamb +2").
// Format only display text; retain the original names, descriptions and prices in data.
export function menuText(value, showPrices) {
  if (showPrices) return value;
  return String(value || '')
    .replace(/\s*(?:\+\s*)?(?:AUD\s*|A)?\$\s*\d[\d,]*(?:\.\d+)?|\s*\+\s*\d+(?:\.\d+)?(?![\w.])/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([),.;])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}
