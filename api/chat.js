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
// 🔎 ESTRAZIONE DATI SEMPLICE (ANTI-JSON FAIL)
// ----------------------
function extractData(message) {
  const msg = message.toLowerCase();

  let postiMatch = msg.match(/\b(\d+)\s*(posti|biglietti)?\b/);
  let posti = postiMatch ? postiMatch[1] : "";

  let dataMatch = msg.match(/\b(oggi|domani|sabato|domenica|\d{1,2}\s\w+)\b/i);
  let data = dataMatch ? dataMatch[0] : "";

  return {
    posti,
    data
  };
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
    const lista = spettacoli.map(s => `- ${s.titolo}`).join("\n");

    // ----------------------
    // 🧠 INTENT
    // ----------------------
    const msg = message.toLowerCase();

    const isBooking = /prenot|bigliett|posti|voglio|riserv/i.test(msg);
    const isInfo = /spettacoli|programmazione|cartellone|cosa c/i.test(msg);

    // ----------------------
    // 🔎 ESTRAZIONE BACKEND (ANTI LOOP)
    // ----------------------
    const extracted = extractData(message);

    if (extracted.posti) session.posti = extracted.posti;
    if (extracted.data) session.data = extracted.data;

    // ----------------------
    // 🤖 AI (SOLO TESTO NATURALE)
    // ----------------------
    const prompt = `
Sei l'assistente del Teatro Tordinona.

Parla in modo naturale, umano, elegante.

Utente: "${message}"

Programmazione:
${lista}

Se l’utente chiede info, usa questi dati.
Se vuole prenotare, guidalo in modo naturale.

NON usare JSON.
Rispondi come una persona reale.
`;

    let aiText = "";

    try {
      const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3-8b-instruct:free",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: message }
          ]
        })
      });

   let aiText = "";

try {
  const raw = await aiResponse.text();
  console.log("AI RAW:", raw);

  const parsed = JSON.parse(raw);
  aiText = parsed?.choices?.[0]?.message?.content || "";

} catch (e) {
  console.error("AI ERROR:", e);
}

    } catch (e) {
      console.error("Errore AI:", e);
    }

    // ----------------------
    // 🧠 PRENOTAZIONE LOGICA
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
    // 💬 RISPOSTA NATURALE
    // ----------------------
    return res.json({
      reply: aiText || "Ciao 😊 benvenuto al Teatro Tordinona!"
    });

  } catch (error) {
    console.error("Errore:", error);

    return res.json({
      reply: "C’è stato un problema tecnico."
    });
  }
};
