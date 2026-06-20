export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { id, title, color, accent, font, type, source_db_id, source_property } = req.body;
  if (!id) return res.status(400).json({ error: 'widget id required' });

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.SETTINGS_DB_ID;

  const richText = (value) => ({ rich_text: [{ text: { content: value || '' } }] });

  try {
    // 1. title 속성 이름 찾기
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      }
    });
    const db = await dbRes.json();
    const titleKey = Object.keys(db.properties).find((key) => db.properties[key].type === 'title');

    // 2. 새 행 생성
    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          [titleKey]: { title: [{ text: { content: id } }] },
          title: richText(title),
          color: richText(color),
          accent: richText(accent),
          font: richText(font),
          type: richText(type),
          source_db_id: richText(source_db_id),
          source_property: richText(source_property)
        }
      })
    });
    const data = await createRes.json();

    if (!createRes.ok) return res.status(createRes.status).json({ error: data.message || 'Notion API error' });

    res.status(200).json({ pageId: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
