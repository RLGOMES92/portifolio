const ZOHO_WEBTOLEAD = "https://crm.zoho.com/crm/WebToLeadForm";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY2;

function authorized(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const authorization =
    typeof request.headers?.get === "function"
      ? request.headers.get("authorization")
      : request.headers?.authorization;

  return authorization === `Bearer ${expected}`;
}

function cleanJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\`\`\`/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");

  if (start < 0 || end < start) {
    throw new Error("Resposta do agente não contém JSON válido.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

async function discoverProspects() {
  const city = process.env.PROSPECT_CITY || "São Paulo";
  const niches =
    process.env.PROSPECT_NICHES ||
    "clínicas e consultórios, escritórios, restaurantes e alimentação, imobiliárias, prestadores de serviços, academias e estúdios, comércio local, e-commerce";

  const prompt = `Você é o agente de prospecção B2B da Rodrigopaz.dev, empresa brasileira que vende sites profissionais, landing pages, automações, sistemas web e agentes de IA.

Faça pesquisa pública na web para encontrar até 5 empresas reais em ${city}, Brasil, dentro destes segmentos: ${niches}.

Priorize empresas que tenham sinais públicos de oportunidade digital: site inexistente, site claramente desatualizado, experiência mobile ruim, ausência de CTA/WhatsApp, processo comercial manual ou oportunidade evidente de automação/IA. Não invente dados. Use apenas informações públicas encontradas na web.

Para cada empresa, retorne:
- company
- website
- city
- segment
- contact_name (somente se estiver publicamente identificado)
- email (somente se estiver publicamente disponível)
- phone (somente se estiver publicamente disponível)
- opportunity
- recommended_service (Site profissional, Landing Page de Alta Conversão, Sistema Web Personalizado, Automação e Integrações ou Soluções com Inteligência Artificial)
- evidence_url
- evidence_summary
- outreach_draft

A abordagem deve ser consultiva, curta e personalizada, sem prometer resultado, sem inventar preço e sem fingir que já houve contato. Não gere listas de spam. Se não houver evidência suficiente, descarte a empresa.

Responda SOMENTE com um array JSON.`;

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content:
            "Você é um agente de pesquisa comercial B2B. Privacidade, precisão e relevância vêm antes de volume.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI respondeu ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return cleanJson(data.output_text);
}

async function createZohoLead(prospect) {
  const lastName = String(prospect.company || "Prospect").slice(0, 80);
  const need = [
    "PROSPECÇÃO IA — não contatado automaticamente.",
    `Oportunidade: ${prospect.opportunity || "Oportunidade digital identificada."}`,
    `Evidência: ${prospect.evidence_summary || "Pesquisa pública."}`,
    `Fonte: ${prospect.evidence_url || "não informada"}`,
    `Rascunho de abordagem: ${prospect.outreach_draft || ""}`,
  ].join("\n");

  const form = new URLSearchParams({
    xnQsjsdp: process.env.ZOHO_WEBTOLEAD_XNQSJSDP,
    zc_gad: "",
    xmIwtLD: process.env.ZOHO_WEBTOLEAD_XMIWTLD,
    actionType: "TGVhZHM=",
    returnURL:
      process.env.ZOHO_WEBTOLEAD_RETURN_URL ||
      "https://portifolio-rodrigos-projects-5f32f252.vercel.app/obrigado.html",
    "First Name": prospect.contact_name || "Prospect",
    "Last Name": lastName,
    Company: prospect.company || lastName,
    Email: prospect.email || "",
    Phone: prospect.phone || "",
    LEADCF1: prospect.recommended_service || "Site profissional",
    LEADCF2: prospect.segment || "Outro",
    LEADCF3: need.slice(0, 1000),
    LEADCF4: "Ainda não definido",
    "Lead Source": "Prospecção IA",
  });

  const response = await fetch(ZOHO_WEBTOLEAD, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    redirect: "manual",
  });

  if (!(response.ok || (response.status >= 300 && response.status < 400))) {
    throw new Error(`Zoho WebToLead respondeu ${response.status}`);
  }

  return true;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  if (!authorized(request)) {
    return response.status(401).json({ ok: false, error: "Unauthorized" });
  }

  console.log("[prospect-agent] execução autorizada iniciada");

  if (
    !OPENAI_KEY ||
    !process.env.ZOHO_WEBTOLEAD_XNQSJSDP ||
    !process.env.ZOHO_WEBTOLEAD_XMIWTLD
  ) {
    console.error("[prospect-agent] variáveis obrigatórias ausentes");
    return response.status(503).json({
      ok: false,
      error: "Agente ainda precisa das variáveis de ambiente do OpenAI e WebToLead do Zoho.",
    });
  }

  try {
    const prospects = await discoverProspects();
    const list = Array.isArray(prospects) ? prospects.slice(0, 5) : [];

    console.log(`[prospect-agent] prospects encontrados: ${list.length}`);

    const results = [];

    for (const prospect of list) {
      try {
        await createZohoLead(prospect);
        console.log(`[prospect-agent] lead criado no Zoho: ${prospect.company}`);
        results.push({ company: prospect.company, status: "created" });
      } catch (error) {
        console.error(
          `[prospect-agent] erro ao criar lead ${prospect.company}: ${error.message}`
        );
        results.push({
          company: prospect.company,
          status: "error",
          error: error.message,
        });
      }
    }

    console.log(
      `[prospect-agent] execução concluída: ${results.filter((item) => item.status === "created").length} leads criados`
    );

    return response.status(200).json({
      ok: true,
      found: list.length,
      results,
      note:
        "Leads são registrados no Zoho para revisão humana; nenhum contato externo é enviado automaticamente.",
    });
  } catch (error) {
    console.error(`[prospect-agent] execução falhou: ${error.message}`);
    return response.status(500).json({ ok: false, error: error.message });
  }
}
