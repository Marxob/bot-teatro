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
        titolo: post.title.$t.trim(),
        descrizione: stripHtml(post.content?.$t || "").slice(0, 100)
      }))
      .slice(0, 4);

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
export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const { message, userId = "default" } = req.body;
  const session = getSession(userId);

  // ----------------------
  // 🎭 SPETTACOLI
  // ----------------------
  const spettacoli = await getSpettacoli();
  const lista = spettacoli.map(s => s.titolo).join(", ");

  // ----------------------
  // 🧠 PROMPT INTELLIGENTE
  // ----------------------
  const prompt = `
Sei l'assistente del Teatro Tordinona.

Tono: accogliente, elegante, naturale.

Messaggio utente: "${message}"

Dati già raccolti:
- nome: ${session.nome}
- spettacolo: ${session.spettacolo}
- data: ${session.data}
- posti: ${session.posti}

Spettacoli disponibili: ${lista}

OBIETTIVO:
1. Se l'utente vuole informazioni → rispondi normalmente
2. Se vuole prenotare → continua la conversazione in modo naturale
3. NON fare interrogatori rigidi

IMPORTANTE:
- Integra eventuali dati trovati nel messaggio
- Se manca qualcosa, chiedilo in modo naturale (non elenco)
- Se tutto è completo → conferma prenotazione

Rispondi SEMPRE in JSON:

{
  "message": "",
  "nome": "",
  "spettacolo": "",
  "data": "",
  "posti": "",
  "complete": true/false
}
`;

  // ----------------------
  // 🤖 AI
  // ----------------------
  const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b:free",
      messages: [
        { role: "system", content: prompt }
      ]
    })
  });

  const data = await aiResponse.json();
  let aiText = data?.choices?.[0]?.message?.content || "{}";

  function safeParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      return {};
    }
  }

  const parsed = safeParse(aiText);

  // ----------------------
  // 💾 AGGIORNA SESSIONE
  // ----------------------
  session.nome = parsed.nome || session.nome;
  session.spettacolo = parsed.spettacolo || session.spettacolo;
  session.data = parsed.data || session.data;
  session.posti = parsed.posti || session.posti;

  const missing = getMissing(session);

  // ----------------------
  // 🧠 BLOCCO ANTI-LOOP
  // ----------------------
  if (!parsed.complete && missing) {
    // lascia parlare l'AI ma evita loop forzando coerenza
    return res.json({
      reply: parsed.message || "Ti aiuto volentieri con la prenotazione 😊"
    });
  }

  // ----------------------
  // ✅ PRENOTAZIONE COMPLETA
  // ----------------------
  if (!missing) {

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
      reply: "Perfetto, ho inviato la tua richiesta di prenotazione 🎭 Ti aspettiamo a teatro!"
    });
  }

  // ----------------------
  // 💬 RISPOSTA NORMALE
  // ----------------------
  return res.json({
    reply: parsed.message || "Sono qui per aiutarti 😊"
  });
}
