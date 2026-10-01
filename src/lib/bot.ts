// Adapter for April's custom chatbot. If BOT_ENDPOINT is set we POST the
// message and expect {reply: string}. Otherwise a canned fallback is used.

export async function botReply(message: string, ctx: { name?: string; email?: string }): Promise<string> {
  const endpoint = process.env.BOT_ENDPOINT;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, user: ctx }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.reply) return String(data.reply);
      }
    } catch (e) {
      console.error("bot endpoint failed", e);
    }
  }
  return "Wreck 'em! Raider Red here — I've flagged an advisor to jump in and help you out. In the meantime, you can check your checklist on the portal dashboard.";
}
