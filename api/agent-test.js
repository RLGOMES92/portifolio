export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY2;
  if (!key) return res.status(503).json({ ok: false, openai: "missing" });
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", input: "Responda apenas: OK", max_output_tokens: 10 })
    });
    const body = await r.json();
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, openai_status: r.status, output: r.ok ? body.output_text : undefined, error: r.ok ? undefined : body.error?.message });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}