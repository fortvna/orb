import { createServerFn } from "@tanstack/react-start";

export const askMentor = createServerFn({ method: "POST" })
  .validator((input: { question: string; context: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Mentor is unavailable in this environment." };

    const question = data.question.slice(0, 800);
    const context = data.context.slice(0, 5000);

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 900,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content:
              "You are Orb Mentor. You write and validate mechanical playbooks with a trader. No hype. No advice sermons. When the user is drafting a playbook, always finish with a JSON block tagged playbook: {name, setup, kind (orb|ib|gap|vwap|fvg|custom), symbol, session, thesis, rules[], invalidation, targetR, windowStart (minutes from midnight ET), windowEnd}. Otherwise point at leaks in their stats.",
          },
          {
            role: "user",
            content: `Desk context:\n${context}\n\nQuestion:\n${question}`,
          },
        ],
      }),
    });

    if (!res.ok) return { ok: false as const, error: `Mentor error ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true as const, text: body.choices?.[0]?.message?.content ?? "" };
  });
