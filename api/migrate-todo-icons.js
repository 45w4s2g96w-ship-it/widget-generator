const HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const TODO_DB_ID = '37651f4140c5805e875cdc92a5715d21';

export default async function handler(req, res) {
  let updated = 0;
  let errors = [];
  let cursor;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const r = await fetch(`https://api.notion.com/v1/databases/${TODO_DB_ID}/query`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.object === 'error') return res.status(500).json({ error: d.message });

    for (const page of d.results) {
      const cur = page.icon;
      if (cur?.type === 'emoji' && cur.emoji === '▪️') continue;
      try {
        const pr = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
          method: 'PATCH', headers: HEADERS,
          body: JSON.stringify({ icon: { type: 'emoji', emoji: '▪️' } }),
        });
        const pd = await pr.json();
        if (pd.object === 'error') throw new Error(pd.message);
        updated++;
      } catch (e) {
        errors.push({ id: page.id, error: e.message });
      }
    }

    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);

  return res.status(200).json({ updated, errors });
}
