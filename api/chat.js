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
    })).slice(0, 6);

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
      posti: ""
    };
  }
  return sessions[userId];
}

// ----------------------
// 🤖 HANDLER
// ----------------------
module.exports = async function handler(req, res) {

  // CORS
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
      return res.status(400).json({ reply: "Messaggio vuoto" });
    }

    const session = getSession(userId);

    // ----------------------
    // 🎭 SPETTACOLI
    // ----------------------
    const spettacoli = await getSpettacoli();
    const listaTitoli = spettacoli.map(s => s.titolo).join(", ");

    // ----------------------
    // 🧠 PROMPT STRUTTURATO
    // ----------------------
    const prompt = `
Sei l'assistente del Teatro Tordinona.

Capisci il messaggio e rispondi SEMPRE in JSON valido.

Formato:

{
  "message": "risposta naturale, elegante e teatrale",
  "intent": "info | prenotazione | altro",
  "nome": "",
  "spettacolo": "",
  "data": "",
  "posti": ""
}

Regole:
- Il campo message deve essere naturale e umano
- NON inventare dati
- Se un dato non è presente → stringa vuota
- Se l’utente vuole prenotare → intent = prenotazione
- Se chiede info → intent = info

Messaggio utente:
"${message}"

Spettacoli disponibili:
${listaTitoli}

Dati già raccolti:
nome: ${session.nome}
spettacolo: ${session.spettacolo}
data: ${session.data}
posti: ${session.posti}
`;

    // ----------------------
    // 🤖 GEMINI 2.5 FLASH
    // ----------------------
    let parsed = {};

    try {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              response_mime_type: "application/json"
            }
          })
        }
      );

      const data = await aiResponse.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      console.log("GEMINI RAW:", text);

      parsed = JSON.parse(text);

    } catch (e) {
      console.error("Errore Gemini:", e);
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
    // 🎟 PRENOTAZIONE
    // ----------------------
    if (parsed.intent === "prenotazione") {

      const missing =
        !session.spettacolo ? "lo spettacolo" :
        !session.nome ? "il nome" :
        !session.posti ? "il numero di posti" :
        !session.data ? "la data" : null;

      if (missing) {
        return res.json({
          reply: parsed.message || `Mi manca ancora ${missing} 😊`
        });
      }

      // INVIO TELEGRAM
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

      // reset sessione
      sessions[userId] = {};

      return res.json({
        reply: "Perfetto 🎭 Ho inviato la tua richiesta di prenotazione. Ti aspettiamo a teatro!"
      });
    }

    // ----------------------
    // 💬 RISPOSTA NORMALE
    // ----------------------
    return res.json({
      reply:
        parsed.message ||
        "Benvenuto al Teatro Tordinona 🎭 Come posso aiutarti?"
    });

  } catch (error) {
    console.error("ERRORE BACKEND:", error);

    return res.status(500).json({
      reply: "C'è stato un problema tecnico."
    });
  }
};
