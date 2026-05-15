import { aiConfigFromBody, callOpenAI, compactHealthContext, healthSystemPrompt, outputText, requirePost, safeJson } from "../_shared/openai.js";

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  try {
    const payload = await callOpenAI({
      input: [
        { role: "system", content: healthSystemPrompt() },
        {
          role: "user",
          content: [
            "请根据用户今天的记录给一条晚餐或下一餐建议。",
            "目标：减少饭后困、腹胀和腹部脂肪堆积。",
            "只返回 JSON，不要 Markdown。格式：{\"advice\":\"...\",\"avoid\":[\"...\"],\"walk\":\"...\"}",
            compactHealthContext(req.body)
          ].join("\n")
        }
      ],
      text: { verbosity: "low" },
      config: aiConfigFromBody(req.body)
    });

    const parsed = safeJson(outputText(payload), {
      advice: "今晚优先鸡胸/鱼/豆腐 + 大量绿叶菜，主食减半，7:30 前结束。",
      avoid: ["奶茶", "油炸", "夜宵"],
      walk: "饭后快走 20-40 分钟。"
    });

    res.status(200).json(parsed);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "AI meal advice failed" });
  }
}
