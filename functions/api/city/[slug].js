// GET /api/city/:slug — Returns all cached shops for a city

export async function onRequest(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug) {
    return json({ available: false, message: 'Missing city slug' }, 400);
  }

  try {
    // Fetch shops data
    const data = await env.CACHE.get(`coffee:city:${slug}:shops`, 'json');

    if (!data) {
      // Check if city meta exists (harvest ran but no shops found)
      const meta = await env.CACHE.get(`coffee:city:${slug}:meta`, 'json');
      if (meta) {
        return json({
          available: true,
          city: slug,
          label: meta.name,
          lat: meta.lat,
          lng: meta.lng,
          updatedAt: meta.lastUpdated,
          shopCount: 0,
          shops: [],
        });
      }

      return json({
        available: false,
        message: `No data for "${slug}". Data updates weekly on Sundays.`,
        shops: [],
      });
    }

    return json({
      available: true,
      city: data.city,
      label: data.label,
      lat: data.lat,
      lng: data.lng,
      updatedAt: data.updatedAt,
      shopCount: data.shopCount,
      shops: data.shops || [],
    });
  } catch (err) {
    return json({ available: false, error: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
