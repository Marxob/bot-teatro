// ----------------------
// 📅 SPETTACOLI
// ----------------------
async function getSpettacoli() {
  try {
    const res = await fetch("https://www.tordinonateatro.it/feeds/posts/default?alt=json");
    const data = await res.json();

    function stripHtml(html) {
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    return (data.feed.entry || []).map(post => ({
      titolo: post.title.$t,
      descrizione: stripHtml(post.content?.$t || "").slice(0, 120)
    })).slice(0, 5);

  } catch {
    return [];
  }
}

// ----------------------
// 🧠 SESSIONI
// ----------------------
const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      nome: "",
      spettacolo: "",
      data: "",
      posti: "",
      mode: "idle"
    };
  }
  return sessions[userId];
}

// ----------------------
// 🔎 PARSE SICURO JSON
// ----------------------
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return null;
  }
}

// ----------------------
// 🤖 HANDLER
// ----------------------
module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { message, userId = "default" } = req.body || {};
    if (!message) return res.json({ reply: "Scrivimi pure 😊" });

    const session = getSession(userId);
    const spettacoli = await getSpettacoli();
    const lista = spettacoli.map(s => s.titolo).join(", ");

    // ----------------------
    // 🧠 PROMPT
    // ----------------------
    const prompt = `
Rispondi in JSON:

{
 "message": "...",
 "intent": "info | prenotazione | altro",
 "nome": "",
 "spettacolo": "",
 "data": "",
 "posti": ""
}

Messaggio: "${message}"
Spettacoli: ${lista}
`;

    // ----------------------
    // 🤖 GEMINI
    // ----------------------
    let aiRaw = "";
    let parsed = null;

    try {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await aiResponse.json();
      aiRaw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      parsed = safeParse(aiRaw);

    } catch (e) {
      console.error("AI error:", e);
    }

    // ----------------------
    // 💬 FALLBACK INTELLIGENTE
    // ----------------------
    if (!parsed) {
      return res.json({
        reply: aiRaw || "Ciao 😊 benvenuto al Teatro Tordinona! Come posso aiutarti?"
      });
    }

    // ----------------------
    // 💾 SESSIONE
    // ----------------------
    if (parsed.nome) session.nome = parsed.nome;
    if (parsed.spettacolo) session.spettacolo = parsed.spettacolo;
    if (parsed.data) session.data = parsed.data;
    if (parsed.posti) session.posti = parsed.posti;

    // ----------------------
    // 🎯 ATTIVA PRENOTAZIONE
    // ----------------------
    if (parsed.intent === "prenotazione") {
      session.mode = "booking";
    }

    // ----------------------
    // 🎟 PRENOTAZIONE
    // ----------------------
    if (session.mode === "booking") {

      const missing =
        !session.spettacolo ? "lo spettacolo" :
        !session.nome ? "il nome" :
        !session.posti ? "i posti" :
        !session.data ? "la data" : null;

      if (missing) {
        return res.json({
          reply: parsed.message || `Mi serve ancora ${missing} 😊`
        });
      }

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.CHAT_ID,
          text: `
🎭 NUOVA PRENOTAZIONE

👤 ${session.nome}
🎟 ${session.spettacolo}
📅 ${session.data}
🪑 ${session.posti}
`
        })
      });

      sessions[userId] = { mode: "idle" };

      return res.json({
        reply: "Perfetto 🎭 prenotazione inviata!"
      });
    }

    // ----------------------
    // 💬 RISPOSTA NORMALE
    // ----------------------
    return res.json({
      reply: parsed.message || aiRaw || "Dimmi pure 😊"
    });

  } catch (e) {
    console.error(e);
    return res.json({ reply: "Errore tecnico." });
  }
};
