/**
 * Rodrigopazdev — WhatsApp AI sales webhook
 * Vercel Serverless Function
 *
 * Required production environment variables:
 * META_VERIFY_TOKEN
 * META_ACCESS_TOKEN
 * META_PHONE_NUMBER_ID
 * OPENAI_API_KEY
 *
 * Optional:
 * OPENAI_MODEL (default: gpt-5-mini)
 */
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

function json(res, status, body) {
  res.status(status).json(body);
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function sendWhatsAppText(to, text) {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error("META_ACCESS_TOKEN or META_PHONE_NUMBER_ID is not configured.");

  const response = await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: text.slice(0, 4096) },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Meta send failed: ${response.status} ${detail}`);
  }
  return response.json();
}

async function generateReply(message, customerName) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");

  const system = `Você é o agente comercial da Rodrigopazdev, atendendo clientes pelo WhatsApp.
Nome da empresa/marca: Rodrigopazdev.
Especialidade: desenvolvimento Full Stack, sites profissionais de alta conversão, landing pages, sistemas web, automações e soluções com IA.
Tom: humano, profissional, objetivo e cordial. Nunca diga que é humano.
Objetivo: entender a necessidade, responder dúvidas, qualificar o potencial cliente e conduzir para orçamento.
Faça no máximo uma pergunta de qualificação por mensagem.
Quando fizer sentido, peça: nome, empresa/segmento, serviço desejado e prazo.
Não invente preços, prazos ou funcionalidades. Se perguntarem preço, diga que o orçamento é personalizado e encaminhe para a página de orçamento: https://portifolio-rodrigos-projects-5f32f252.vercel.app/orcamento.html
WhatsApp comercial: https://wa.me/5511983179592
Se a pessoa quiser falar diretamente com Rodrigo, informe que pode chamar pelo WhatsApp comercial.
Mensagem do cliente: ${message}
Nome informado pelo WhatsApp: ${customerName || "não informado"}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: system,
      max_output_tokens: 350,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  return data.output_text || "Olá! Posso te ajudar com seu projeto. Você procura um site, sistema, automação ou solução com IA?";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
      mode === "subscribe" &&
      token &&
      challenge &&
      token === process.env.META_VERIFY_TOKEN
    ) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const body = await readBody(req);
    const entries = body.entry || [];

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const message of value.messages || []) {
          if (message.type !== "text" || !message.from) continue;

          const text = message.text?.body?.trim();
          if (!text) continue;

          const contact = (value.contacts || []).find(
            (item) => item.wa_id === message.from
          );
          const customerName = contact?.profile?.name || "";

          const reply = await generateReply(text, customerName);
          await sendWhatsAppText(message.from, reply);
        }
      }
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    // Always acknowledge Meta to avoid repeated delivery storms.
    return json(res, 200, { ok: false, error: "processing_failed" });
  }
}
