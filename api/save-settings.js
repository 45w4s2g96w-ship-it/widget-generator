export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { pageId, title, color, accent, font, source_db_id, source_property, embed_link } = req.body;
  if (!pageId) return res.status(400).json({ error: 'pageId required' });

  const token = process.env.NOTION_TOKEN;

  const richText = (value) => ({
    rich_text: [{ text: { content: value || '' } }]
  });

  try {
    const patchRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: richText(title),
          color: richText(color),
          accent: richText(accent),
          font: richText(font),
          source_db_id: richText(source_db_id),
          source_property: richText(source_property),
          ...(embed_link !== undefined ? { embed_link: { url: embed_link || null } } : {}),
        }
      })
    });
    const data = await patchRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
