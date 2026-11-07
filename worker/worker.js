const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const buckets = new Map();
const ALLOWED_ORIGINS = [
  "https://felipemedina.cl",
  "https://www.felipemedina.cl",
  "https://mecanismos-de-compra.pages.dev",
  "https://felipemedinaromero-beep.github.io",
];
const ALLOWED_ORIGIN = ALLOWED_ORIGINS[0];

function cors(request) {
  const origin = request.headers.get("Origin");
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function response(data, status, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function isLimited(request) {
  const key = request.headers.get("CF-Connecting-IP") || "anonymous";
  const now = Date.now();
  let item = buckets.get(key);
  if (!item || now - item.started >= 60000) {
    item = { started: now, count: 0 };
    buckets.set(key, item);
  }
  item.count += 1;
  return item.count > 20;
}

function clean(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function isComplex(query) {
  return /(normativ|ley|reglament|decreto|art[ií]culo|causal|riesgo|recomiend|compara|diferencia|estrateg|informe|interpret|vigenc|responsab|sanci[oó]n|fragment)/i.test(query);
}

async function runWorkersAI(env, prompt) {
  if (!env.AI) return null;
  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content:
          "Responde en español de Chile, de forma breve y útil. No inventes cifras ni normas. Si faltan antecedentes, dilo. Máximo 4 viñetas o 2 párrafos.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 320,
    temperature: 0.2,
  });
  const t = result && (result.response || (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content));
  return String(t || "").trim() || null;
}

async function runClaude(env, prompt) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const result = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 420,
      temperature: 0.2,
      system:
        "Eres el asistente del panel público Mecanismos de Compra de Chile. Responde en español de Chile. Sé directo: entrega primero la respuesta y luego como máximo 3 viñetas de fundamento o próximos pasos. No repitas la pregunta. No inventes cifras, fechas, artículos ni fuentes. Los datos numéricos exactos solo pueden venir del panel o del contexto entregado. Si la consulta pide una cifra que no está en el contexto, indica que no puedes confirmarla. Para normativa, recomienda verificar el texto oficial vigente.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!result.ok) throw new Error(`anthropic_${result.status}`);
  const data = await result.json();
  return String((data && data.content && data.content[0] && data.content[0].text) || "").trim() || null;
}

export default {
  async fetch(request, env) {
    const origin = cors(request);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin || ALLOWED_ORIGIN,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      return response({ ok: true, service: "mecanismos-de-compra-ai" }, 200, origin);
    }
    if (url.pathname !== "/api/assistant" || request.method !== "POST") {
      return response({ error: "Ruta no disponible" }, 404, origin);
    }
    if (!origin) return response({ error: "Origen no autorizado" }, 403, null);
    if (isLimited(request)) {
      return response({ error: "Límite temporal alcanzado. Intenta nuevamente en un minuto." }, 429, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return response({ error: "Solicitud inválida" }, 400, origin);
    }

    const query = clean(body && body.query, 300);
    const context = clean(body && body.context, 500);
    if (!query) return response({ error: "Falta la pregunta" }, 400, origin);

    const prompt = `Contexto de pantalla: ${context || "no informado"}\nPregunta: ${query}`;
    try {
      let answer = null;
      if (isComplex(query)) answer = await runClaude(env, prompt);
      if (!answer) answer = await runWorkersAI(env, prompt);
      if (!answer && env.ANTHROPIC_API_KEY) answer = await runClaude(env, prompt);
      if (!answer) return response({ error: "El servicio de IA no está disponible en este momento." }, 503, origin);
      return response({ answer }, 200, origin);
    } catch (error) {
      console.error("assistant_error", error && error.message || error);
      try {
        const answer = await runWorkersAI(env, prompt);
        if (answer) return response({ answer }, 200, origin);
      } catch (_) {}
      return response({ error: "No pude generar una respuesta ahora. Intenta nuevamente." }, 502, origin);
    }
  },
};
