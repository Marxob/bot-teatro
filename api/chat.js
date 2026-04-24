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

    return (data.feed.entry || [])
      .map(post => ({
        titolo: post.title.$t,
        descrizione: stripHtml(post.content?.$t || "").slice(0, 120)
      }))
      .slice(0, 5);

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

function getMissing(s) {
  if (!s.spettacolo) return "spettacolo";
  if (!s.nome) return "nome";
  if (!s.posti) return "posti";
  if (!s.data) return "data";
  return null;
}

// ----------------------
// 🔎 ESTRAZIONE DATI
// ----------------------
function extractData(message) {
  const msg = message.toLowerCase();

  let postiMatch = msg.match(/\b(\d+)\s*(posti|biglietti)?\b/);
  let posti = postiMatch ? postiMatch[1] : "";

  let dataMatch = msg.match(/\b(oggi|domani|sabato|domenica|\d{1,2}\s\w+)\b/i);
  let data = dataMatch ? dataMatch[0] : "";

  return { posti, data };
}

// ----------------------
// 🤖 HANDLER
// ----------------------
module.exports = async function handler(req, res) {

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
      return res.status(400).json({ reply: "Messaggio vuoto" });
    }

    const session = getSession(userId);

    // ----------------------
    // 🎭 SPETTACOLI
    // ----------------------
    const spettacoli = await getSpettacoli();
    const lista = spettacoli.map(s => `- ${s.titolo}: ${s.descrizione}`).join("\n");

    // ----------------------
    // 🧠 INTENT BASE
    // ----------------------
    const msg = message.toLowerCase();
    const isBooking = /prenot|bigliett|posti|voglio|riserv/i.test(msg);

    // ----------------------
    // 🔎 ESTRAZIONE DATI BACKEND
    // ----------------------
    const extracted = extractData(message);
    if (extracted.posti) session.posti = extracted.posti;
    if (extracted.data) session.data = extracted.data;

    // ----------------------
    // 🤖 GEMINI
    // ----------------------
    const prompt = `
Sei l'assistente del Teatro Tordinona.

Parla in modo naturale, accogliente ed elegante.

Messaggio utente:
"${message}"

Programmazione:
${lista}

Dati prenotazione raccolti:
- nome: ${session.nome}
- spettacolo: ${session.spettacolo}
- data: ${session.data}
- posti: ${session.posti}

Regole:
- Rispondi come una persona reale
- Se chiede info → usa la programmazione
- Se vuole prenotare → guida con naturalezza (NO interrogatorio)
- Se capisci nome o spettacolo → includili nella risposta

NON usare JSON.
`;

    let aiText = "";

    try {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt }
                ]
              }
            ]
          })
        }
      );

      const data = await aiResponse.json();

      aiText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      console.log("GEMINI:", aiText);

    } catch (e) {
      console.error("Errore Gemini:", e);
    }

    // ----------------------
    // 🎟 PRENOTAZIONE
    // ----------------------
    if (isBooking) {

      const missing = getMissing(session);

      if (missing) {
        return res.json({
          reply: aiText || `Perfetto 😊 mi serve ancora: ${missing}`
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

      sessions[userId] = {};

      return res.json({
        reply: "Perfetto 🎭 ho inviato la prenotazione. Ti aspettiamo!"
      });
    }

    // ----------------------
    // 💬 RISPOSTA NORMALE
    // ----------------------
    return res.json({
      reply:
        aiText ||
        "Ciao 😊 benvenuto al Teatro Tordinona! Come posso aiutarti?"
    });

  } catch (error) {
    console.error("Errore:", error);

    return res.json({
      reply: "C’è stato un problema tecnico."
    });
  }
};
