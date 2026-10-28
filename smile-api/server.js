// Smile preview API for the Pompano design preview.
// Receives a selfie, asks the image model to change only the teeth, returns the preview.
// Photos are never written to disk or logged. Staff-only: requires SMILE_PASSCODE.
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const KEY = process.env.OPENAI_API_KEY || '';
const PASS = process.env.SMILE_PASSCODE || '';
const MODEL = process.env.SMILE_MODEL || 'gpt-image-1';
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://pompano-preview.onrender.com').split(',');

const KEEP = 'Keep the face, skin, eyes, expression, lips, facial hair, hair, glasses, clothing, lighting, background, colors and camera framing exactly the same. Photorealistic dental result.';
const LOOKS = {
  natural: 'Edit this exact photo. Change ONLY the teeth: make them a natural, healthy, complete smile after professional dental work: evenly aligned upper and lower teeth, natural shade (about A1), realistic tooth shapes with slight translucency at the edges, healthy gums, proportional to the face and age. Not overly white. ' + KEEP,
  bright: 'Edit this exact photo. Change ONLY the teeth: a bright, ideal cosmetic smile as from porcelain veneers or a full-arch restoration: bright white (shade BL2), even, symmetrical, well-proportioned upper and lower teeth with healthy gums. ' + KEEP,
  gaps: 'Edit this exact photo. Change ONLY the teeth: keep this person\'s own natural teeth and tooth shapes, fill any missing teeth with matching implant crowns, gently straighten crowded or uneven teeth, and lightly whiten to a natural shade. It should still clearly look like their own smile, just complete, straighter and brighter. ' + KEEP,
};

const hits = new Map(); // ip -> [timestamps]
function limited(ip) {
  const now = Date.now(), win = 60 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > 30;
}
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function send(res, code, obj, origin) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const origin = ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0];
  if (req.method === 'OPTIONS') return send(res, 204, {}, origin);
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, configured: !!KEY && !!PASS }, origin);
  if (req.method !== 'POST' || req.url !== '/api/smile') return send(res, 404, { error: 'Not found' }, origin);

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return send(res, 429, { error: 'Too many previews for now. Try again in an hour.' }, origin);
  if (!KEY || !PASS) return send(res, 503, { error: 'The smile preview is not switched on yet.' }, origin);

  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 12e6) return send(res, 413, { error: 'That photo is too large.' }, origin); }
  let data;
  try { data = JSON.parse(body); } catch { return send(res, 400, { error: 'Something went wrong reading the photo.' }, origin); }
  if (!same(data.code || '', PASS)) return send(res, 401, { error: 'That staff code is not right.' }, origin);
  const prompt = LOOKS[data.look] || LOOKS.natural;
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data.image || '');
  if (!m) return send(res, 400, { error: 'Please choose a photo.' }, origin);

  try {
    const form = new FormData();
    form.append('model', MODEL);
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('quality', 'high');
    form.append('input_fidelity', 'high');
    form.append('n', '1');
    form.append('image', new Blob([Buffer.from(m[2], 'base64')], { type: 'image/' + m[1] }), 'selfie.' + (m[1] === 'jpeg' ? 'jpg' : m[1]));
    const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY }, body: form });
    const j = await r.json();
    if (!r.ok) {
      console.error('image API error', r.status, j && j.error && j.error.message); // no photo data logged
      const msg = r.status === 400 && /safety|moderation/i.test(JSON.stringify(j)) ? 'This photo could not be processed. Try another selfie.' : 'The preview could not be made right now. Please try again.';
      return send(res, 502, { error: msg }, origin);
    }
    return send(res, 200, { image: 'data:image/png;base64,' + j.data[0].b64_json }, origin);
  } catch (e) {
    console.error('preview failed', e.message);
    return send(res, 502, { error: 'The preview could not be made right now. Please try again.' }, origin);
  }
}).listen(PORT, () => console.log('smile api on ' + PORT + ' model ' + MODEL));
