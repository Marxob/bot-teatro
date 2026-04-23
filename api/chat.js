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

    const entries = data?.feed?.entry || [];

    return entries
      .map(post => ({
        titolo: post.title?.$t?.trim() || "",
        descrizione: stripHtml(post.content?.$t || "").slice(0, 100)
      }))
      .slice(0, 4);

  } catch (err) {
    console.error("Errore feed:", err);
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
      posti: ""
    };
  }
  return sessions[userId];
}

// ----------------------
// ❓ CAMPI MANCANTI
// ----------------------
function getMissing(s) {
  if (!s.spettacolo) return "spettacolo";
  if (!s.nome) return "nome";
  if (!s.posti) return "posti";
  if (!s.data) return "data";
  return null;
}

// ----------------------
// 🤖 HANDLER
// ----------------------
module.exports = async function handler(req, res) {

  // ----------------------
  // 🌐 CORS
  // ----------------------
  res.setHeader("Access-Control-Allow-Origin", "https://testeprf12426.blogspot.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {

    if (req.method !== "POST") {
      return res.status(405).json({ reply: "Method not allowed" });
    }

    const { message, userId = "default" } = req.body || {};

    if (!message) {
      return res.status(400).json({ reply: "Messaggio vuoto." });
    }

    const session = getSession(userId);

    // ----------------------
    // 🎭 SPETTACOLI
    // ----------------------
    const spettacoli = await getSpettacoli();
    const lista = spettacoli.map(s => s.titolo).join(", ");

    // ----------------------
    // 🧠 INTENT DETECTION (FONDAMENTALE)
    // ----------------------
    const lowerMsg = message.toLowerCase();

    const isBookingIntent =
      /prenot|bigliett|posto|spettacolo|disponibil|voglio|comprare/i.test(lowerMsg);

    // ----------------------
    // 🧠 PROMPT AI (SOLO ESTRAZIONE)
    // ----------------------
    const prompt = `
Estrai SOLO dati dal messaggio.

Regole:
- NON inventare nulla
- Se non presente lascia ""

Formato JSON:

{
  "message": "",
  "nome": "",
  "spettacolo": "",
  "data": "",
  "posti": ""
}

Messaggio: "${message}"
`;

    // ----------------------
    // 🤖 OPENROUTER
    // ----------------------
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: message }
        ]
      })
    });

    let aiText = "{}";

    try {
      if (aiResponse.ok) {
        const data = await aiResponse.json();
        aiText = data?.choices?.[0]?.message?.content || "{}";
      } else {
        console.error(await aiResponse.text());
      }
    } catch (e) {
      console.error("AI error:", e);
    }

    // ----------------------
    // 🔐 PARSING SICURO
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
      }
      return {};
    }

    const parsed = safeParse(aiText);

    // ----------------------
    // 💾 UPDATE SESSION
    // ----------------------
    if (parsed.nome) session.nome = parsed.nome;
    if (parsed.spettacolo) session.spettacolo = parsed.spettacolo;
    if (parsed.data) session.data = parsed.data;
    if (parsed.posti) session.posti = parsed.posti;

    // ----------------------
    // ❓ MISSING LOGIC SOLO SE PRENOTAZIONE
    // ----------------------
    const missing = isBookingIntent ? getMissing(session) : null;

    // ----------------------
    // 💬 RISPOSTA GENERALE (NO LOOP)
    // ----------------------
    if (!isBookingIntent) {
      return res.json({
        reply:
          parsed.message ||
          "Ciao 😊 sono l’assistente del Teatro Tordinona. Come posso aiutarti?"
      });
    }

    // ----------------------
    // 🎟 PRENOTAZIONE IN CORSO
    // ----------------------
    if (isBookingIntent && missing) {
      return res.json({
        reply:
          parsed.message ||
          `Perfetto 😊 mi serve ancora: ${missing}`
      });
    }

    // ----------------------
    // ✅ PRENOTAZIONE COMPLETA
    // ----------------------
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.CHAT_ID,
        text: `
🎭 NUOVA PRENOTAZIONE

👤 Nome: ${session.nome}
🎟 Spettacolo: ${session.spettacolo}
📅 Data: ${session.data}
🪑 Posti: ${session.posti}
`
      })
    });

    sessions[userId] = {
      nome: "",
      spettacolo: "",
      data: "",
      posti: ""
    };

    return res.json({
      reply: "Perfetto 🎭 la tua prenotazione è stata inviata!"
    });

  } catch (error) {
    console.error("ERRORE BACKEND:", error);

    return res.status(200).json({
      reply: "C’è stato un problema tecnico, riprova tra poco."
    });
  }
};
