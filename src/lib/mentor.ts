import { createServerFn } from "@tanstack/react-start";

export const askMentor = createServerFn({ method: "POST" })
  .validator((input: { question: string; context: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Mentor is unavailable in this environment." };

    const question = data.question.slice(0, 800);
    const context = data.context.slice(0, 4000);

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 700,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are Orb Mentor, a terse trading coach. Use only the trader's stats and fills provided. No hype. No financial advice disclaimer sermons. Point at specific leaks (time of day, setup, size, revenge patterns). Speak in short paragraphs and bullets.",
          },
          {
            role: "user",
            content: `Journal context:\n${context}\n\nQuestion:\n${question}`,
          },
        ],
      }),
    });

    if (!res.ok) return { ok: false as const, error: `Mentor error ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true as const, text: body.choices?.[0]?.message?.content ?? "" };
  });
