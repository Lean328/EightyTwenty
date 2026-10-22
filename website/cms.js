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

// Home page blocks → hero and intro. Rotating hero: `hero` blocks keyed hero-1…hero-5 (sort_order =
// slot), title = headline ("Fuel your\nmorning." or "Fuel your | morning."), subtitle = tagline,
// image_url = dish photo. Intro: `hero` block `intro` (title + subtitle eyebrow) and `cta` block `intro-cta`.
export const HERO_SLOTS = 5;
const imageUrl = u => (/^https:\/\/[^\\]+$/.test(u || '') || /^\/(?!\/)[^\\]+$/.test(u || '')) ? u : '';
export function homeContent(page) {
  const blocks = (page && page.blocks) || [];
  const heroes = blocks.filter(b => b.type === 'hero' && /^hero(-\d+)?$/.test(b.key || ''));
  const tagline = (heroes.map(h => h.data && h.data.subtitle).find(Boolean) || '').trim();
  const slides = heroes.slice(0, HERO_SLOTS).map(h => {
    const d = h.data || {};
    const lines = String(d.title || '').split(/\s*(?:\n|\|)\s*/).map(s => s.trim()).filter(Boolean);
    return { lines:[lines[0] || '', lines.slice(1).join(' ')], image: imageUrl(d.image_url), alt: lines.join(' ') };
  });
  const intro = blocks.find(b => b.type === 'hero' && b.key === 'intro');
  const cta = blocks.find(b => b.type === 'cta' && b.key === 'intro-cta');
  return {
    tagline, slides,
    intro: intro ? { eyebrow: String(intro.data.subtitle || '').trim(), title: String(intro.data.title || '').trim() } : null,
    cta: cta && cta.data.label && route(cta.data.url) ? { label: cta.data.label, url: cta.data.url } : null,
  };
}

export const seo = (page, fallback) => ({
  title: (page && (page.seo_title || (page.title && page.title + ' | EightyTwenty'))) || fallback.title,
  description: (page && page.seo_description) || fallback.description,
});
