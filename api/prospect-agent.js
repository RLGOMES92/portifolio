export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  const expected = process.env.CRON_SECRET;
  const auth = req.headers?.authorization;
  if (!expected || auth !== `Bearer ${expected}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return res.status(200).json({ ok: true, test: "agent-route-online" });
}
