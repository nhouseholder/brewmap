// GET /api/cities — Returns cached cities index from KV

export async function onRequest(context) {
  const { env } = context;

  try {
    const data = await env.CACHE.get('coffee:cities:index', 'json');

    if (!data?.cities?.length) {
      return json({ available: false, cities: [], message: 'No cached data yet. Harvest has not run.' });
    }

    return json({
      available: true,
      lastUpdated: data.lastUpdated,
      totalShops: data.totalShops,
      cities: data.cities,
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
      'Cache-Control': 'public, max-age=300', // 5 min browser cache
    },
  });
}
