// ----------------------
// 📅 ESTRAZIONE SPETTACOLI
// ----------------------
async function getSpettacoli() {
  try {
    const res = await fetch("https://www.tordinonateatro.it/feeds/posts/default?alt=json");
    const data = await res.json();

    function stripHtml(html) {
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    return (data.feed.entry || [])
      .map(post => {
        const titolo = post.title.$t.trim();
        const contenuto = stripHtml(post.content?.$t || "");
        const link = (post.link || []).find(l => l.rel === "alternate")?.href || "";

        return {
          titolo,
          descrizione: contenuto.slice(0, 120),
          link
        };
      })
      .slice(0, 4);

  } catch (err) {
    console.error("Errore feed:", err);
    return [];
  }
}

// ----------------------
// 🧠 SESSIONI (IN MEMORY)
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
// 🔍 CAMPI MANCANTI
// ----------------------
function getMissingField(s) {
  if (!s.spettacolo) return "spettacolo";
  if (!s.nome) return "nome";
  if (!s.posti) return "posti";
  if (!s.data) return "data";
  return null;
}

// ----------------------
// 🤖 HANDLER
// ----------------------
export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }

    const { message, userId = "default" } = req.body;

    if (!message) {
      return res.status(400).json({ reply: "Messaggio vuoto." });
    }

    const session = getSession(userId);

    // ----------------------
    // 🎭 LISTA SPETTACOLI
    // ----------------------
    const spettacoli = await getSpettacoli();

    const listaSpettacoli = spettacoli.map(s =>
      `- ${s.titolo}`
    ).join("\n");

    // ----------------------
    // 🧠 PROMPT (SOLO ESTRAZIONE)
    // ----------------------
    const extractionPrompt = `
Estrai queste informazioni dal messaggio utente:

- nome
- spettacolo
- data
- posti

Spettacoli disponibili:
${listaSpettacoli}

Rispondi SOLO con JSON:

{
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
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: message }
        ]
      })
    });

    const data = await aiResponse.json();
    let aiText = data?.choices?.[0]?.message?.content || "{}";

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
    // 💾 AGGIORNA SESSIONE
    // ----------------------
    session.nome = parsed.nome || session.nome;
    session.spettacolo = parsed.spettacolo || session.spettacolo;
    session.data = parsed.data || session.data;
    session.posti = parsed.posti || session.posti;

    // ----------------------
    // ❓ DATI MANCANTI
    // ----------------------
    const missing = getMissingField(session);

    if (missing) {
      const domande = {
        spettacolo: "Quale spettacolo vuoi prenotare?",
        nome: "A nome di chi devo inserire la prenotazione?",
        posti: "Quanti posti vuoi prenotare?",
        data: "Per quale data?"
      };

      return res.status(200).json({
        reply: domande[missing]
      });
    }

    // ----------------------
    // 📩 INVIO TELEGRAM
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

    // reset sessione dopo invio
    sessions[userId] = {
      nome: "",
      spettacolo: "",
      data: "",
      posti: ""
    };

    return res.status(200).json({
      reply: "Perfetto! La tua prenotazione è stata inviata 🎭"
    });

  } catch (error) {
    console.error("ERRORE BACKEND:", error);

    return res.status(500).json({
      reply: "C'è stato un problema tecnico. Riprova tra poco."
    });
  }
}
