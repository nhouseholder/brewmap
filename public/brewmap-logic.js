(function attachBrewMapLogic(global) {
  function clampScore(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function sanitizeFlavorTags(flavorTags, allowedTags, flavorProfile, limit = 5) {
    const allowed = new Set(Array.isArray(allowedTags) ? allowedTags : []);
    const safeTags = [];
    const seen = new Set();

    if (Array.isArray(flavorTags)) {
      for (const entry of flavorTags) {
        const tag = typeof entry?.tag === 'string' ? entry.tag : '';
        if (!allowed.has(tag) || seen.has(tag)) continue;
        safeTags.push({ tag, score: clampScore(entry.score) });
        seen.add(tag);
        if (safeTags.length >= limit) break;
      }
    }

    if (safeTags.length > 0) return safeTags;
    if (!flavorProfile || typeof flavorProfile !== 'object') return [];

    return Object.entries(flavorProfile)
      .filter(([tag]) => allowed.has(tag))
      .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
      .slice(0, limit)
      .map(([tag, score]) => ({ tag, score: clampScore(score) }));
  }

  function getShopSourceMeta(shop = {}) {
    const hasWebsiteFlavor = shop.flavorSource === 'website' ||
      (Array.isArray(shop.beanOrigins) && shop.beanOrigins.length > 0) ||
      Boolean(shop.websiteTastingNotes);
    const hasReviewFlavor = shop.flavorSource === 'yelp-reviews';
    const hasYelpRating = shop.dataSource === 'yelp' || shop.yelpRating != null || shop.yelpReviewCount != null;
    const verified = hasWebsiteFlavor || hasReviewFlavor || hasYelpRating;

    let trustScore = 0;
    if (hasWebsiteFlavor) trustScore += 12;
    if (hasReviewFlavor) trustScore += 5;
    if (hasYelpRating) trustScore += 4;
    if (Array.isArray(shop.beanOrigins) && shop.beanOrigins.length > 0) trustScore += 1;
    trustScore += Math.min(3, Math.round((Number(shop.reviewCount) || 0) / 150));

    let label = 'Estimated';
    let tone = 'estimated';
    if (hasWebsiteFlavor) {
      label = 'Website verified';
      tone = 'website';
    } else if (hasReviewFlavor && hasYelpRating) {
      label = 'Review backed';
      tone = 'reviews';
    } else if (hasReviewFlavor) {
      label = 'Flavor from reviews';
      tone = 'reviews';
    } else if (hasYelpRating) {
      label = 'Yelp rated';
      tone = 'yelp';
    }

    return {
      verified,
      trustScore,
      tone,
      label,
      hasWebsiteFlavor,
      hasReviewFlavor,
      hasYelpRating,
    };
  }

  function isVerifiedShop(shop) {
    return getShopSourceMeta(shop).verified;
  }

  function compareByTrust(a, b) {
    const metaA = getShopSourceMeta(a);
    const metaB = getShopSourceMeta(b);
    return metaB.trustScore - metaA.trustScore ||
      (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0) ||
      (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
      (Number(a.distance) || Number.POSITIVE_INFINITY) - (Number(b.distance) || Number.POSITIVE_INFINITY);
  }

  function matchesRoastFilter(roastLevel, filterLevel) {
    if (!filterLevel) return true;
    if (!roastLevel) return false;

    const normalized = roastLevel.toLowerCase();
    if (filterLevel === 'light') return normalized === 'light' || normalized === 'medium-light';
    if (filterLevel === 'medium') return normalized === 'medium' || normalized === 'medium-light' || normalized === 'medium-dark';
    if (filterLevel === 'dark') return normalized === 'dark' || normalized === 'medium-dark';
    return normalized.includes(filterLevel);
  }

  function isFreshUpdate(updatedAt) {
    if (!updatedAt) return false;
    const timestamp = new Date(updatedAt).getTime();
    if (!Number.isFinite(timestamp)) return false;
    return Date.now() - timestamp <= 7 * 24 * 60 * 60 * 1000;
  }

  function buildFeaturedSections(shops, options = {}) {
    const list = Array.isArray(shops) ? shops.filter(Boolean) : [];
    const sections = [];

    const verified = list.filter(isVerifiedShop).sort(compareByTrust).slice(0, 3);
    if (verified.length > 0) {
      sections.push({
        id: 'verified',
        title: 'Best Verified Nearby',
        subtitle: 'Real reviews and website tasting data first',
        shops: verified,
      });
    }

    const reviewed = list
      .filter(shop => {
        const meta = getShopSourceMeta(shop);
        return meta.hasYelpRating || meta.hasReviewFlavor;
      })
      .sort((a, b) => (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0) || compareByTrust(a, b))
      .slice(0, 3);
    if (reviewed.length > 0) {
      sections.push({
        id: 'reviewed',
        title: 'Most Reviewed',
        subtitle: 'Crowd-backed standouts worth checking first',
        shops: reviewed,
      });
    }

    if (isFreshUpdate(options.updatedAt)) {
      const fresh = [...list]
        .sort((a, b) => (Number(a.distance) || Number.POSITIVE_INFINITY) - (Number(b.distance) || Number.POSITIVE_INFINITY) || compareByTrust(a, b))
        .slice(0, 3);
      if (fresh.length > 0) {
        sections.push({
          id: 'fresh',
          title: 'New In Cache',
          subtitle: options.source === 'discovered' ? 'Freshly discovered for this city' : 'Updated recently and ready to explore',
          shops: fresh,
        });
      }
    }

    if (Array.isArray(options.activeFlavorTags) && options.activeFlavorTags.length > 0) {
      const matches = [...list]
        .filter(shop => Number(shop._matchPct) > 0)
        .sort((a, b) => (Number(b._matchPct) || 0) - (Number(a._matchPct) || 0) || compareByTrust(a, b))
        .slice(0, 3);
      if (matches.length > 0) {
        sections.push({
          id: 'match',
          title: 'Flavor Match For You',
          subtitle: 'Based on the flavor profile you selected',
          shops: matches,
        });
      }
    }

    return sections;
  }

  const QUICK_INTENTS = [
    { id: 'verified', label: 'Most verified', verifiedOnly: true, sort: 'verified', roast: '', flavors: [], search: '' },
    { id: 'dark-roast', label: 'Dark roast', verifiedOnly: false, sort: 'verified', roast: 'dark', flavors: ['dark', 'chocolatey'], search: '' },
    { id: 'fruity-espresso', label: 'Fruity espresso', verifiedOnly: true, sort: 'flavor', roast: '', flavors: ['fruity', 'bright'], search: 'espresso' },
    { id: 'smooth-cappuccino', label: 'Smooth cappuccino', verifiedOnly: true, sort: 'flavor', roast: '', flavors: ['smooth', 'sweet'], search: 'cappuccino' },
    { id: 'most-reviewed', label: 'Most reviewed', verifiedOnly: false, sort: 'reviews', roast: '', flavors: [], search: '' },
  ];

  function getQuickIntents() {
    return QUICK_INTENTS.map(intent => ({ ...intent, flavors: [...intent.flavors] }));
  }

  global.BrewMapLogic = {
    sanitizeFlavorTags,
    getShopSourceMeta,
    isVerifiedShop,
    compareByTrust,
    matchesRoastFilter,
    buildFeaturedSections,
    getQuickIntents,
  };
})(window);