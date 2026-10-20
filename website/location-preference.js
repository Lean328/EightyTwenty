// A customer's explicit choice wins over the first-visit default and preview props.
const LOCATION_KEY = 'e82-location-v1';

export function preferredLocation(locations, previewDefault) {
  let saved;
  try { saved = window.localStorage.getItem(LOCATION_KEY); } catch {}
  const valid = id => locations.some(location => location.id === id);
  return [saved, previewDefault, 'phillip'].find(valid) || locations[0]?.id || 'phillip';
}

export function rememberLocation(id) {
  try { window.localStorage.setItem(LOCATION_KEY, id); } catch {}
}

// Copy first: API/cache order and all other locations' relative order are preserved.
export function phillipFirst(locations) {
  return locations.slice().sort((a, b) => (b.id === 'phillip') - (a.id === 'phillip'));
}
