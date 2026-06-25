export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const color = req.query.color || '#1a1a1a';

  const prompt = `You are a retro UI color palette designer.
Given the user's chosen titlebar color "${color}", suggest exactly 3 distinct color palettes for a widget UI.

Each palette needs 4 colors:
- winColor: titlebar bg (dark/strong tone, can differ from ${color} but harmonize)
- accent: button/highlight color (complementary or analogous, NOT too similar to winColor)
- windowBg: widget background (very light — near white, cream, or very pale)
- ink: text color (very dark, high contrast on windowBg)
- description: short Korean label max 8 chars (e.g. "다크 퍼플", "빈티지 그린")

Make the 3 palettes clearly different from each other.
Return ONLY valid JSON, no explanation:
{"palettes":[{"winColor":"#...","accent":"#...","windowBg":"#...","ink":"#...","description":"..."},{"winColor":"#...","accent":"#...","windowBg":"#...","ink":"#...","description":"..."},{"winColor":"#...","accent":"#...","windowBg":"#...","ink":"#...","description":"..."}]}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const d = await resp.json();
  if (d.type === 'error') return res.status(500).json({ error: d.error.message });

  const text = d.content?.[0]?.text || '';
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    return res.status(200).json(parsed);
  } catch(e) {
    return res.status(500).json({ error: 'JSON 파싱 실패', raw: text.slice(0, 200) });
  }
}
