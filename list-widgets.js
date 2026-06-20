export default async function handler(req, res) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.SETTINGS_DB_ID;

  try {
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      }
    });
    const db = await dbRes.json();
    const titleKey = Object.keys(db.properties).find(
      (key) => db.properties[key].type === 'title'
    );

    const queryRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    const queryData = await queryRes.json();

    const widgetIds = (queryData.results || [])
      .map((page) => page.properties[titleKey]?.title?.[0]?.plain_text)
      .filter(Boolean);

    res.status(200).json({ widgets: widgetIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
