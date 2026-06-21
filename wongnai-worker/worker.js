export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id || !/^[0-9]{7}[A-Za-z]{2}$/.test(id)) {
      return Response.json({ error: 'Invalid restaurant ID' }, {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const wongnaiUrl = `https://www.wongnai.com/restaurants/${encodeURIComponent(id)}`;

    let res;
    try {
      res = await fetch(wongnaiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
      });
    } catch (e) {
      return Response.json({ error: 'Failed to fetch Wongnai' }, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!res.ok) {
      return Response.json({ error: 'Restaurant not found', status: res.status }, {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Collect JSON-LD blocks and page title
    let title = '';

    const transformed = new HTMLRewriter()
      .on('title', {
        text(chunk) { title += chunk.text; },
      })
      .transform(res);

    // Read body fully to let HTMLRewriter run
    const html = await transformed.text();

    // Extract all JSON-LD blocks via regex (simpler than tracking element end)
    const ldPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    const data = { url: wongnaiUrl };

    while ((match = ldPattern.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item['@type'] === 'Restaurant' || item['@type'] === 'FoodEstablishment') {
            data.name = item.name || null;
            data.phone = item.telephone || null;

            const addr = item.address;
            if (typeof addr === 'string') {
              data.address = addr;
            } else if (addr && typeof addr === 'object') {
              data.address = [addr.streetAddress, addr.addressLocality, addr.addressRegion]
                .filter(Boolean).join(', ') || null;
            }

            // openingHours: string or string[]
            const hours = item.openingHours;
            if (Array.isArray(hours) && hours.length) {
              data.openingHours = hours;
            } else if (typeof hours === 'string' && hours) {
              data.openingHours = [hours];
            }

            // openingHoursSpecification: [{dayOfWeek, opens, closes}]
            const spec = item.openingHoursSpecification;
            if (!data.openingHours && Array.isArray(spec) && spec.length) {
              const dayMap = {
                'Monday':'จ', 'Tuesday':'อ', 'Wednesday':'พ', 'Thursday':'พฤ',
                'Friday':'ศ', 'Saturday':'ส', 'Sunday':'อา',
                'http://schema.org/Monday':'จ', 'http://schema.org/Tuesday':'อ',
                'http://schema.org/Wednesday':'พ', 'http://schema.org/Thursday':'พฤ',
                'http://schema.org/Friday':'ศ', 'http://schema.org/Saturday':'ส',
                'http://schema.org/Sunday':'อา',
              };
              data.openingHours = spec.map(s => {
                const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek])
                  .map(d => dayMap[d] || d).join(',');
                return `${days} ${s.opens || '?'}–${s.closes || '?'}`;
              });
            }

            const geo = item.geo;
            if (geo) {
              data.lat = geo.latitude || null;
              data.lng = geo.longitude || null;
            }

            data.image = Array.isArray(item.image) ? item.image[0] : (item.image || null);
            data.rating = item.aggregateRating?.ratingValue || null;
            data.ratingCount = item.aggregateRating?.reviewCount || null;
            break;
          }
        }
      } catch (_) { /* skip malformed JSON */ }
    }

    // Fallback: use page title if name missing
    if (!data.name && title) {
      data.name = title.replace(/\s*[-|]\s*Wongnai.*/i, '').trim() || null;
    }

    return Response.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  },
};
