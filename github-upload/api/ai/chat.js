import { aiConfigFromBody, baseUrl, compactHealthContext, getApiKey, healthSystemPrompt, modelName, requirePost } from "../_shared/openai.js";

export const config = {
  maxDuration: 30
};

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const config = aiConfigFromBody(req.body);
  const apiKey = getApiKey(config);
  if (!apiKey) {
    res.status(503).send("OPENAI_API_KEY is not configured");
    return;
  }

  try {
    const compatible = config.provider === "openai-compatible" || !baseUrl(config).includes("api.openai.com");
    const response = await fetch(`${baseUrl(config)}${compatible ? "/chat/completions" : "/responses"}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        compatible
          ? {
              model: modelName(config),
              stream: true,
              temperature: 0.4,
              messages: [
                { role: "system", content: healthSystemPrompt() },
                {
                  role: "user",
                  content: [
                    "用户正在使用 30 天瘦肚子健康计划 PWA。",
                    "请用中文回答，简短、具体、可执行。",
                    `用户问题：${req.body?.message || ""}`,
                    `健康上下文：${compactHealthContext(req.body)}`
                  ].join("\n")
                }
              ]
            }
          : {
              model: modelName(config),
              store: false,
              stream: true,
              input: [
                { role: "system", content: healthSystemPrompt() },
                {
                  role: "user",
                  content: [
                    "用户正在使用 30 天瘦肚子健康计划 PWA。",
                    "请用中文回答，简短、具体、可执行。",
                    `用户问题：${req.body?.message || ""}`,
                    `健康上下文：${compactHealthContext(req.body)}`
                  ].join("\n")
                }
              ]
            }
      )
    });

    if (!response.ok || !response.body) {
      res.status(response.status).send(await response.text());
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const data = dataLine.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const chatDelta = parsed.choices?.[0]?.delta?.content;
          if (chatDelta) {
            res.write(chatDelta);
          } else if (parsed.type === "response.output_text.delta" && parsed.delta) {
            res.write(parsed.delta);
          }
        } catch {
          // Ignore non-JSON stream housekeeping.
        }
      }
    }

    res.end();
  } catch (error) {
    res.status(500).send(error.message || "AI chat failed");
  }
}
