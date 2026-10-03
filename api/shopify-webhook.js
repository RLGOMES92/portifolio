import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("SHOPIFY_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ ok: false, error: "Webhook secret not configured" });
  }

  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  const rawBody =
    typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body || {});

  if (!hmacHeader) {
    return res.status(401).json({ ok: false, error: "Missing webhook signature" });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const provided = Buffer.from(String(hmacHeader), "utf8");
  const calculated = Buffer.from(expected, "utf8");

  if (
    provided.length !== calculated.length ||
    !crypto.timingSafeEqual(provided, calculated)
  ) {
    return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
  }

  const topic = req.headers["x-shopify-topic"] || "";
  const shop = req.headers["x-shopify-shop-domain"] || "";
  const body = req.body || {};

  console.log("Shopify webhook received", {
    topic,
    shop,
    orderId: body.id || null,
    orderNumber: body.name || null
  });

  return res.status(200).json({
    ok: true,
    received: true,
    topic,
    shop
  });
}
