import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

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
  if (!hmacHeader) {
    return res.status(401).json({ ok: false, error: "Missing webhook signature" });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    console.error("Failed to read webhook body", error);
    return res.status(400).json({ ok: false, error: "Invalid request body" });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  const provided = Buffer.from(String(hmacHeader), "utf8");
  const calculated = Buffer.from(expected, "utf8");

  if (
    provided.length !== calculated.length ||
    !crypto.timingSafeEqual(provided, calculated)
  ) {
    console.warn("Invalid Shopify webhook signature");
    return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
  }

  let body = {};
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    console.error("Invalid JSON from Shopify webhook", error);
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const topic = req.headers["x-shopify-topic"] || "";
  const shop = req.headers["x-shopify-shop-domain"] || "";

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
