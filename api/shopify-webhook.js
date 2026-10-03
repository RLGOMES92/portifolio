export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
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
