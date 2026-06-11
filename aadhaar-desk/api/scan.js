const Anthropic = require('@anthropic-ai/sdk');

const PROMPT = `You are an Aadhaar card OCR system. Extract all data from both sides of this Indian Aadhaar card.

STRICT RULES:
1. Aadhaar number: ALWAYS mask the first 8 digits with X. Format EXACTLY as "XXXX XXXX XXXX" where the last group is the actual last 4 digits.
2. If phone number is not printed on the card, return an empty string.
3. The address comes from the BACK side of the card.
4. Return ONLY raw JSON — no markdown, no explanation.

Required JSON format:
{
  "name": "full name as printed",
  "dob": "DD/MM/YYYY",
  "gender": "Male|Female|Transgender",
  "aadhaarMasked": "XXXX XXXX XXXX",
  "phone": "",
  "address": "full address from back side",
  "pincode": "6 digit pincode",
  "confidence": "high|medium|low"
}`;

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image format');
  return { mediaType: match[1], data: match[2] };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { front, back } = req.body || {};
  if (!front || !back) {
    return res.status(400).json({ error: 'Both front and back images are required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
  }

  let frontImg, backImg;
  try {
    frontImg = parseDataUrl(front);
    backImg  = parseDataUrl(back);
  } catch {
    return res.status(400).json({ error: 'Invalid image data — expected base64 data URLs' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: frontImg.mediaType, data: frontImg.data } },
          { type: 'image', source: { type: 'base64', media_type: backImg.mediaType,  data: backImg.data  } },
          { type: 'text', text: PROMPT }
        ]
      }]
    });

    const raw = message.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
    const data = JSON.parse(raw);
    return res.status(200).json(data);
  } catch (err) {
    const msg = err.message || 'Failed to process card';
    return res.status(500).json({ error: msg });
  }
};
