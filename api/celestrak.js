export default async function handler(req, res) {
  try {
    const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', {
      headers: {
        'User-Agent': 'OrbitLens-App/1.0 (your-email@example.com)' 
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from CelesTrak' });
    }

    const data = await response.text();
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}