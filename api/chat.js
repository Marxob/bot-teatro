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

    return entries.map(post => ({
      titolo: post.title?.$t || "",
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
    // 🎭 DATI SPETTACOLI
    // ----------------------
    const spettacoli = await getSpettacoli();
    const lista = spettacoli.map(s => `- ${s.titolo}: ${s.descrizione}`).join("\n");

    // ----------------------
    // 🧠 INTENT BASE
    // ----------------------
    const msg = message.toLowerCase();

    const isBooking =
      /prenot|bigliett|posti|voglio|riserv/i.test(msg);

    const isInfo =
      /spettacoli|programmazione|cartellone|cosa c'è/i.test(msg);

    // ----------------------
    // 🧠 PROMPT NATURALE
    // ----------------------
    const prompt = `
Sei l'assistente del Teatro Tordinona.

Parla in modo naturale, elegante e accogliente.

Messaggio utente:
"${message}"

Programmazione attuale:
${lista}

Dati prenotazione già raccolti:
- nome: ${session.nome}
- spettacolo: ${session.spettacolo}
- data: ${session.data}
- posti: ${session.posti}

COMPITI:
- Rispondi sempre in modo naturale (come una persona)
- Se l’utente chiede info → usa la programmazione
- Se vuole prenotare → guida con naturalezza (NON interrogatorio)
- Se emergono dati (nome, posti, ecc) estraili

Formato JSON:

{
  "message": "",
  "nome": "",
  "spettacolo": "",
  "data": "",
  "posti": ""
}
`;

    // ----------------------
    // 🤖 CHIAMATA AI
    // ----------------------
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "AI_MODEL",
        response_format: { type: "json_object" }, // 🔥 IMPORTANTISSIMO
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: message }
        ]
      })
    });

    let aiText = "{}";

    try {
      const data = await aiResponse.json();
      aiText = data?.choices?.[0]?.message?.content || "{}";
    } catch {}

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
    // 💾 AGGIORNA SESSIONE
    // ----------------------
    if (parsed.nome) session.nome = parsed.nome;
    if (parsed.spettacolo) session.spettacolo = parsed.spettacolo;
    if (parsed.data) session.data = parsed.data;
    if (parsed.posti) session.posti = parsed.posti;

    const missing = isBooking ? getMissing(session) : null;

    // ----------------------
    // 🎟 PRENOTAZIONE
    // ----------------------
    if (isBooking && missing) {
      return res.json({
        const finalMessage =
        parsed.message ||
        (typeof aiText === "string" && aiText.length < 500 ? aiText : null) ||
        "Ciao 😊 benvenuto al Teatro Tordinona. Come posso aiutarti?";
        return res.json({ reply: finalMessage });
      });
    }

    if (isBooking && !missing) {

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
        reply: "Che bello 😊 ho inviato la tua richiesta di prenotazione. Ti aspettiamo a teatro 🎭"
      });
    }

    // ----------------------
    // 💬 RISPOSTA NATURALE
    // ----------------------
    return res.json({
      reply:
        parsed.message ||
        "Ciao 😊 benvenuto al Teatro Tordinona. Come posso aiutarti?"
    });

  } catch (error) {
    console.error(error);

    return res.json({
      reply: "C’è stato un problema tecnico, riprova tra poco."
    });
  }
};
