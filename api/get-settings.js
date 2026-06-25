export default async function handler(req, res) {
  const { widgetId } = req.query;
  if (!widgetId) return res.status(400).json({ error: 'widgetId required' });

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.SETTINGS_DB_ID;

  try {
    // 1. DB 스키마에서 '제목(title)' 속성의 실제 이름을 찾는다 (한글/영문 무관하게 동작)
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

    // 2. widgetId(=제목)로 해당 행 찾기
    const queryRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: { property: titleKey, title: { equals: widgetId } }
      })
    });
    const queryData = await queryRes.json();
    const page = queryData.results?.[0];

    if (!page) return res.status(404).json({ error: 'widget not found in settings db' });

    const getText = (prop) => prop?.rich_text?.[0]?.plain_text || '';

    const getUrl = (prop) => prop?.url || '';
    res.status(200).json({
      pageId: page.id,
      title: getText(page.properties.title),
      color: getText(page.properties.color),
      accent: getText(page.properties.accent),
      font: getText(page.properties.font),
      source_db_id: getText(page.properties.source_db_id),
      source_property: getText(page.properties.source_property),
      embed_link: getUrl(page.properties.embed_link),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
