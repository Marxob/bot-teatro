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

  } catch (e) {
    console.error("Errore feed:", e);
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
// 🤖 HANDLER
// ----------------------
module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
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
      return res.json({ reply: "Scrivimi pure 😊" });
    }

    const session = getSession(userId);

    // ----------------------
    // 🎭 SPETTACOLI
    // ----------------------
    const spettacoli = await getSpettacoli();
    const lista = spettacoli.map(s => s.titolo).join(", ");

    // ----------------------
    // 🧠 PROMPT
    // ----------------------
    const prompt = `
Sei l'assistente del Teatro Tordinona.

Rispondi SEMPRE in JSON valido:

{
  "message": "risposta naturale",
  "intent": "info | prenotazione | altro",
  "nome": "",
  "spettacolo": "",
  "data": "",
  "posti": ""
}

Regole:
- NON inventare dati
- Se non presenti → stringa vuota
- Il campo message deve essere umano e naturale

Messaggio:
"${message}"

Spettacoli:
${lista}

Dati raccolti:
nome: ${session.nome}
spettacolo: ${session.spettacolo}
data: ${session.data}
posti: ${session.posti}
`;

    // ----------------------
    // 🤖 GEMINI
    // ----------------------
    let parsed = {};

    try {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              response_mime_type: "application/json"
            }
          })
        }
      );

      const data = await aiResponse.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      console.log("AI:", text);

      parsed = JSON.parse(text);

    } catch (e) {
      console.error("Errore AI:", e);
      parsed = {};
    }

    // ----------------------
    // 💾 AGGIORNA SESSIONE
    // ----------------------
    if (parsed.nome) session.nome = parsed.nome;
    if (parsed.spettacolo) session.spettacolo = parsed.spettacolo;
    if (parsed.data) session.data = parsed.data;
    if (parsed.posti) session.posti = parsed.posti;

    // ----------------------
    // 🎯 ATTIVA PRENOTAZIONE
    // ----------------------
    if (parsed.intent === "prenotazione" && session.mode === "idle") {
      session.mode = "booking";
    }

    // ----------------------
    // 🎟 FLUSSO PRENOTAZIONE
    // ----------------------
    if (session.mode === "booking") {

      const missing =
        !session.spettacolo ? "lo spettacolo" :
        !session.nome ? "il nome" :
        !session.posti ? "il numero di posti" :
        !session.data ? "la data" : null;

      if (missing) {
        return res.json({
          reply: parsed.message || `Perfetto 😊 mi serve ancora ${missing}`
        });
      }

      // invio telegram
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

      // reset
      sessions[userId] = {
        nome: "",
        spettacolo: "",
        data: "",
        posti: "",
        mode: "idle"
      };

      return res.json({
        reply: "Perfetto 🎭 Prenotazione inviata! Ti aspettiamo a teatro."
      });
    }

    // ----------------------
    // 💬 RISPOSTA NORMALE
    // ----------------------
    return res.json({
      reply: parsed.message || "Come posso aiutarti? 😊"
    });

  } catch (err) {
    console.error("Errore:", err);
    return res.json({
      reply: "C'è stato un problema tecnico."
    });
  }
};
