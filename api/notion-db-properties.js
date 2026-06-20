export default async function handler(req, res) {
  const { db_id } = req.query;
  if (!db_id) return res.status(400).json({ error: 'db_id required' });

  const token = process.env.NOTION_TOKEN;

  try {
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${db_id}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
    });
    const db = await dbRes.json();
    if (!dbRes.ok) return res.status(dbRes.status).json({ error: db.message || 'Notion API error' });

    const properties = Object.entries(db.properties).map(([name, prop]) => ({ name, type: prop.type }));
    res.status(200).json({ properties });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
