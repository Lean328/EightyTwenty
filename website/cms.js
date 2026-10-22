// BOS CMS for the public site: SiteSettings (bootstrap SETTINGS) and published pages
// (/api/v1/public/pages/{slug}). Everything falls back to the built-in copy while the CMS is empty.
import { API_BASE } from './config.js';

// Site view → CMS page slug (SEO for every view; the legal pages also take their body from it).
export const VIEW_SLUGS = { home:'home', menu:'menu', locations:'locations', reserve:'bookings', catering:'catering', about:'about', wholesale:'wholesale', giftcards:'gift-cards', privacy:'privacy', refund:'refunds', accessibility:'accessibility', cookies:'cookies' };
export const LEGAL_VIEWS = ['privacy', 'refund', 'accessibility', 'cookies'];
const SLUG_VIEWS = Object.assign(Object.fromEntries(Object.keys(VIEW_SLUGS).map(v => [v, v])), Object.fromEntries(Object.entries(VIEW_SLUGS).map(([v, s]) => [s, v])));

const pages = new Map();
// One request per slug per visit; resolves the page or null (missing, draft or offline).
export function fetchPage(slug) {
  if (!pages.has(slug)) pages.set(slug, (async () => {
    if (!API_BASE) return null;
    try { const res = await fetch(API_BASE + '/api/v1/public/pages/' + encodeURIComponent(slug), { cache:'no-cache' }); return res.ok ? await res.json() : null; } catch { return null; }
  })());
  return pages.get(slug);
}

// Published page summaries arrive with bootstrap; null means an older API that doesn't list them.
export const pageList = settings => settings && Array.isArray(settings.pages) ? settings.pages : null;
export const published = (settings, slug) => (pageList(settings) || []).find(p => p.slug === slug) || null;

// CMS links are an https URL or a site path: '/privacy' → view, '/our-story' → CMS page view.
export function route(url) {
  const u = String(url || '');
  if (/^https:\/\//.test(u)) return { href:u };
  const slug = u.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  if (!slug) return { view:'home' };
  if (SLUG_VIEWS[slug]) return { view:SLUG_VIEWS[slug] };
  return /^[a-z0-9-]+$/.test(slug) ? { view:'page', slug } : null;
}

export const navItems = (settings, menu) => ((settings && settings.navigation) || []).filter(n => n.menu === menu && !n.parent && route(n.url));

export function social(settings, name, fallback) {
  const links = (settings && settings.social_links) || {};
  const key = Object.keys(links).find(k => k.trim().toLowerCase() === name);
  return key && /^https:\/\//.test(links[key]) ? links[key] : fallback;
}

export const seo = (page, fallback) => ({
  title: (page && (page.seo_title || (page.title && page.title + ' | EightyTwenty'))) || fallback.title,
  description: (page && page.seo_description) || fallback.description,
});
