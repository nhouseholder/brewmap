// BrewMap — Website scraper for coffee shop enrichment
// Fetches a shop's website and extracts visible text content.

const USER_AGENT = 'BrewMap/5.3 (coffee-shop-discovery; +https://brewmap-app.pages.dev)';
const FETCH_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 512 * 1024; // 512KB — more than enough for a homepage

/**
 * Fetch a URL and return extracted text content.
 * @param {string} url - The URL to fetch
 * @returns {{ text: string, url: string, fetchedAt: string } | null}
 */
export async function scrapeWebsite(url) {
  if (!url) return null;

  // Normalize URL
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;

    const html = await res.text();
    const text = stripHtml(html.slice(0, MAX_BODY_BYTES));

    if (text.length < 50) return null; // Too little content

    return {
      text,
      url: normalizedUrl,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    // Timeout, DNS failure, SSL error, etc. — expected for many small shops
    return null;
  }
}

/**
 * Strip HTML tags and extract readable text.
 * Removes script, style, nav, footer, header elements first.
 */
function stripHtml(html) {
  return html
    // Remove script, style, nav, footer, header blocks entirely
    .replace(/<(script|style|nav|footer|header|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
