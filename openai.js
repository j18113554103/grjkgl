const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export function requirePost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }
  return true;
}

export function getApiKey(config = {}) {
  return config.apiKey || process.env.OPENAI_API_KEY;
}

export function modelName(config = {}) {
  return config.model || process.env.OPENAI_MODEL || "gpt-5";
}

export function baseUrl(config = {}) {
  return (config.baseUrl || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
}

function wantsChatCompletions(config = {}) {
  return config.provider === "openai-compatible" || !baseUrl(config).includes("api.openai.com");
}

export function healthSystemPrompt() {
  return [
    "你是一个中文个人健康管理 AI 教练。",
    "你的建议只用于生活方式管理，不能替代医生、诊断、处方或治疗。",
    "用户目标是 30 天改善饭后困、腹胀、腰围和日常精神状态。",
    "优先给可执行、克制、温和、安全的建议。",
    "遇到疾病、用药、孕期、胸痛、晕厥、严重低血糖等情况，建议咨询医生。"
  ].join("\n");
}

export async function callOpenAI({ input, text, config }) {
  const apiKey = getApiKey(config);
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is not configured");
    error.statusCode = 503;
    throw error;
  }

  if (wantsChatCompletions(config)) {
    const messages = input.map((item) => ({
      role: item.role,
      content: item.content
    }));
    const response = await fetch(`${baseUrl(config)}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName(config),
        messages,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      const error = new Error(await response.text());
      error.statusCode = response.status;
      throw error;
    }

    return response.json();
  }

  const response = await fetch(`${baseUrl(config)}/responses`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelName(config),
      input,
      text,
      store: false
    })
  });

  if (!response.ok) {
    const error = new Error(await response.text());
    error.statusCode = response.status;
    throw error;
  }

  return response.json();
}

export function outputText(payload) {
  if (typeof payload.choices?.[0]?.message?.content === "string") {
    return payload.choices[0].message.content;
  }
  if (typeof payload.output_text === "string") return payload.output_text;
  const pieces = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) pieces.push(content.text);
    }
  }
  return pieces.join("");
}

export function safeJson(text, fallback) {
  try {
    const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

export function compactHealthContext(body) {
  const today = body?.today || body?.context?.today;
  const recent = body?.recent || body?.context?.recent || [];
  return JSON.stringify({
    completion: body?.completion || body?.context?.completion,
    today: today
      ? {
          date: today.date,
          waterMl: today.waterMl,
          waistCm: today.waistCm,
          weightKg: today.weightKg,
          tasks: today.tasks?.map((task) => ({
            title: task.title,
            completed: task.completed,
            time: task.time,
            note: task.note || ""
          })),
          foodChoices: today.foodChoices?.filter((choice) => choice.selected).map((choice) => choice.label),
          exercises: today.exercises?.map((exercise) => ({
            name: exercise.name,
            completed: exercise.completed
          })),
          waterTargetMet: today.waterTargetMet,
          baselineWaistCm: today.baselineWaistCm
        }
      : null,
    recent,
    model: body?.aiConfig?.model || body?.context?.aiConfig?.model
  });
}

export function aiConfigFromBody(body = {}) {
  const raw = body.aiConfig || body.context?.aiConfig || {};
  return {
    provider: raw.provider,
    model: raw.model,
    baseUrl: raw.baseUrl,
    apiKey: raw.apiKey
  };
}
