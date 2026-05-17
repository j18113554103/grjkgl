import { aiConfigFromBody, callOpenAI, compactHealthContext, healthSystemPrompt, outputText, requirePost, safeJson } from "../_shared/openai.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const context = compactHealthContext(req.body);
    const payload = await callOpenAI({
      input: [
        { role: "system", content: healthSystemPrompt() },
        {
          role: "user",
          content: [
            "请基于以下健康记录生成今日复盘。",
            "只返回 JSON，不要 Markdown。",
            "格式：{\"title\":\"今日复盘\",\"completion\":64,\"highlights\":[\"...\"],\"risks\":[\"...\"],\"nextAction\":\"...\"}",
            context
          ].join("\n")
        }
      ],
      text: { verbosity: "low" },
      config: aiConfigFromBody(req.body)
    });

    const parsed = safeJson(outputText(payload), {
      title: "今日复盘",
      completion: req.body?.completion || 0,
      highlights: ["午餐和饭后走路是今天最值得优先抓住的动作。"],
      risks: [],
      nextAction: "补水 300ml，然后完成最近一项未完成任务。"
    });

    res.status(200).json(parsed);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "AI summary failed" });
  }
}
