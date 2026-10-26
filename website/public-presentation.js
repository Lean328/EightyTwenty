// Apply after selecting API, localStorage or bundled data, so stale content stays hidden.
// Keep the underlying records and all other cafés intact.
export function publicLocations(locations) {
  return locations.filter(location => location.id !== 'akuna');
}
