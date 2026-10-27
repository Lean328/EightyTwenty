// BOS backend URL (no trailing slash). Leave empty to run on the bundled mock-data.js only.
// Local previews (localhost / 127.0.0.1) talk to the Django dev server.
const PRODUCTION_API = 'https://eightytwenty-api.onrender.com';
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_BASE = isLocal ? 'http://127.0.0.1:8000' : PRODUCTION_API;

// Temporary public food/drinks presentation policy. Restore prices by setting true.
// Never changes API, POS, BOS or Catering prices.
export const SHOW_MENU_PRICES = false;
