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
      history: []
    };
  }
  return sessions[userId];
}

// ----------------------
// 📅 PARSING DATE SMART
// ----------------------
function parseDate(text) {
  const today = new Date();
  const msg = text.toLowerCase();

  if (msg.includes("oggi")) return today.toISOString().split("T")[0];

  if (msg.includes("domani")) {
    const d = new Date();
    d.setDate(today.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const giorni = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
  for (let i = 0; i < giorni.length; i++) {
    if (msg.includes(giorni[i])) {
      const d = new Date();
      const diff = (i - today.getDay() + 7) % 7 || 7;
      d.setDate(today.getDate() + diff);
      return d.toISOString().split("T")[0];
    }
  }

  return "";
}

// ----------------------
// 🔎 ESTRAZIONE DATI
// ----------------------
function extractData(message, spettacoli) {
  const msg = message.toLowerCase();

  const postiMatch = msg.match(/\b(\d+)\b/);
  const posti = postiMatch ? postiMatch[1] : "";

  let spettacolo = "";
  for (let s of spettacoli) {
    if (msg.includes(s.titolo.toLowerCase())) {
      spettacolo = s.titolo;
      break;
    }
  }

  return {
    posti,
    data: parseDate(message),
    spettacolo
  };
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
    const { message, userId = "default" } = req.body || {};
    if (!message) return res.json({ reply: "Scrivimi pure 😊" });

    const session = getSession(userId);

    const spettacoli = await getSpettacoli();

    // ----------------------
    // 🧠 ESTRAZIONE BACKEND
    // ----------------------
    const extracted = extractData(message, spettacoli);

    if (extracted.posti) session.posti = extracted.posti;
    if (extracted.data) session.data = extracted.data;
    if (extracted.spettacolo) session.spettacolo = extracted.spettacolo;

    // ----------------------
    // 🧠 INTENT
    // ----------------------
    const isBooking = /prenot|bigliett|posti|voglio|riserv/i.test(message);

    // ----------------------
    // 🎭 PROMPT TEATRALE
    // ----------------------
    const prompt = `
Sei l'assistente del Teatro Tordinona.

Parla come una persona reale, con eleganza e un tocco teatrale.

Utente: "${message}"

Programmazione:
${spettacoli.map(s => `- ${s.titolo}`).join("\n")}

Dati raccolti:
- nome: ${session.nome}
- spettacolo: ${session.spettacolo}
- data: ${session.data}
- posti: ${session.posti}

Regole:
- NON essere robotico
- NON fare elenchi di domande
- accompagna l’utente naturalmente
- se prenotazione → guida con eleganza
- se informazione → racconta gli spettacoli

Rispondi in modo naturale.
`;

    // ----------------------
    // 🤖 GEMINI 2.5 FLASH
    // ----------------------
    let aiText = "";

    try {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

    } catch (e) {
      console.error("Gemini error:", e);
    }

    // ----------------------
    // 🎟 PRENOTAZIONE
    // ----------------------
    if (isBooking) {
      const missing =
        !session.spettacolo ? "spettacolo" :
        !session.nome ? "nome" :
        !session.posti ? "posti" :
        !session.data ? "data" : null;

      if (missing) {
        return res.json({
          reply: aiText || `Mi racconti meglio? Mi manca ancora ${missing} 😊`
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

      sessions[userId] = {};

      return res.json({
        reply: "È tutto pronto 🎭 Ho inviato la tua richiesta. Ti aspettiamo a teatro."
      });
    }

    // ----------------------
    // 💬 RISPOSTA NATURALE
    // ----------------------
    return res.json({
      reply: aiText || "Benvenuto al Teatro Tordinona 🎭 Come posso accompagnarti?"
    });

  } catch (error) {
    console.error(error);
    return res.json({
      reply: "C’è stato un piccolo imprevisto tecnico."
    });
  }
};
