const HEADERS = {
  Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const DIARY_DB_ID    = '37451f4140c5808e9141c8804e892661';
const TODO_DB_ID     = '37651f4140c5805e875cdc92a5715d21';
const CART_DB_ID     = '37751f4140c580598f09f7903db2248f';
const IDEA_DB_ID     = '37a51f4140c580e4bcf9f6279769ae26';
const BOOKMARK_DB_ID = '638c790c1ad7406ca8bfbe87d965e687';

function getSeoulNow() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  return now;
}

function pad(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const now = getSeoulNow();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function calcQuadrant(dueDateStr, today) {
  if (!dueDateStr) return '4사분면';
  const d = dueDateStr.slice(0, 10);
  if (d <= today) return '1사분면';
  const sevenDays = new Date(getSeoulNow());
  sevenDays.setDate(sevenDays.getDate() + 6);
  if (d <= sevenDays.toLocaleDateString('sv-SE')) return '2사분면';
  const thirtyDays = new Date(getSeoulNow());
  thirtyDays.setDate(thirtyDays.getDate() + 29);
  if (d <= thirtyDays.toLocaleDateString('sv-SE')) return '3사분면';
  return '4사분면';
}

async function notionFetch(url, method, body) {
  const r = await fetch(url, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json();
  if (d.object === 'error') throw new Error(`Notion error: ${d.message}`);
  return d;
}

async function routeDiary(text) {
  const today = todayStr();
  const now = getSeoulNow();
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const qd = await notionFetch(
    `https://api.notion.com/v1/databases/${DIARY_DB_ID}/query`,
    'POST',
    { filter: { property: '날짜', date: { equals: today } } }
  );

  let pageId = qd.results?.[0]?.id;
  if (!pageId) {
    const cd = await notionFetch('https://api.notion.com/v1/pages', 'POST', {
      parent: { database_id: DIARY_DB_ID },
      properties: { '날짜': { date: { start: today } } },
    });
    pageId = cd.id;
  }

  await notionFetch(`https://api.notion.com/v1/blocks/${pageId}/children`, 'PATCH', {
    children: [{
      type: 'quote',
      quote: {
        rich_text: [
          { type: 'text', text: { content: timeStr }, annotations: { color: 'gray' } },
          { type: 'text', text: { content: '\n' + text } },
        ],
      },
    }],
  });
}

async function routeTodo(text, dueDate, todoMemo) {
  const today = todayStr();
  const quadrant = calcQuadrant(dueDate, today);
  const properties = {
    '이름': { title: [{ text: { content: text } }] },
    '추가일': { date: { start: today } },
    '완료': { checkbox: false },
    '사분면': { select: { name: quadrant } },
  };
  if (dueDate) properties['마감일'] = { date: { start: dueDate } };
  if (todoMemo) properties['메모'] = { rich_text: [{ text: { content: todoMemo } }] };
  await notionFetch('https://api.notion.com/v1/pages', 'POST', {
    parent: { database_id: TODO_DB_ID },
    icon: { type: 'emoji', emoji: '▪️' },
    properties,
  });
}

async function routeCart(text, cartType) {
  const properties = { '이름': { title: [{ text: { content: text } }] } };
  if (cartType) properties['종류'] = { select: { name: cartType } };
  await notionFetch('https://api.notion.com/v1/pages', 'POST', { parent: { database_id: CART_DB_ID }, properties });
}

async function routeIdea(text, area) {
  const properties = { '이름': { title: [{ text: { content: text } }] } };
  if (area) properties['영역'] = { select: { name: area } };
  await notionFetch('https://api.notion.com/v1/pages', 'POST', { parent: { database_id: IDEA_DB_ID }, properties });
}

async function routeBookmark(text, title, link) {
  const properties = {
    '제목': { title: [{ text: { content: title } }] },
    '내용': { rich_text: [{ text: { content: text } }] },
  };
  if (link) properties['링크'] = { url: link };
  await notionFetch('https://api.notion.com/v1/pages', 'POST', { parent: { database_id: BOOKMARK_DB_ID }, properties });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { memoId, text, target, dueDate, todoMemo, cartType, ideaArea, bookmarkTitle, bookmarkLink } = req.body;
  if (!text || !target) return res.status(400).json({ error: 'text, target required' });

  try {
    switch (target) {
      case 'DIARY':    await routeDiary(text); break;
      case 'TO-DO':    await routeTodo(text, dueDate, todoMemo); break;
      case 'CART':     await routeCart(text, cartType); break;
      case 'IDEA':     await routeIdea(text, ideaArea); break;
      case 'BOOKMARK': await routeBookmark(text, bookmarkTitle, bookmarkLink); break;
      case 'ETC': break;
      default:
        return res.status(400).json({ error: `unknown target: ${target}` });
    }

    if (memoId) {
      const properties = { '분류': { select: { name: target } } };
      try {
        await notionFetch(`https://api.notion.com/v1/pages/${memoId}`, 'PATCH', { properties });
      } catch (patchErr) {
        console.error('memo patch failed:', patchErr.message);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('memo-route error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
