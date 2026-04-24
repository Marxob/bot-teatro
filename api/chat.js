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
      waitingConfirmation: false,
      history: []
    };
  }
  sessions[userId].waitingConfirmation = false;
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

  const nomeMatch = message.match(/sono\s+([A-Za-z]+)|mi chiamo\s+([A-Za-z]+)|nome[:\s]+([A-Za-z]+)/i);
  const nome = nomeMatch ? (nomeMatch[1] || nomeMatch[2] || nomeMatch[3]) : "";

  let spettacolo = "";
  for (let s of spettacoli) {
    if (msg.includes(s.titolo.toLowerCase())) {
      spettacolo = s.titolo;
      break;
    }
  }

  return {
    posti,
    nome,
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
    if (extracted.nome) session.nome = extracted.nome;
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
Sei l'assistente del Teatro Tordinona. Il tuo obiettivo è AIUTARE l'utente a prenotare o informarsi sugli spettacoli.

UTENTE: "${message}"

PROGRAMMAZIONE ATTUALE:
${spettacoli.length > 0 ? spettacoli.map(s => `- ${s.titolo}`).join("\n") : "Nessuno spettacolo in programma"}

DATI GIA' RACCOLTI:
- Nome: ${session.nome || "NON FORNITO"}
- Spettacolo: ${session.spettacolo || "NON FORNITO"}
- Data: ${session.data || "NON FORNITA"}
- Posti: ${session.posti || "NON FORNITI"}

ISTRUZIONI:
1. Se l'utente vuole prenotare, chiedi i dati mancanti in modo naturale e conversazionale
2. Estrai e usa TUTTE le informazioni utili dal messaggio dell'utente:
   - Cerca nomi propri (es: "sono Marco", "mi chiamo Anna")
   - Cerca date (oggi, domani, lunedì, martedì, etc.)
   - Cerca numeri di posti
   - Cerca i titoli degli spettacoli dalla programmazione
3. Se hai TUTTI i dati, conferma la prenotazione con un messaggio entusiasta
4. Se mancano dati, chiedili in modo casuale comeParleresti con un amico
5. Se l'utente chiede informazioni, descrivi gli spettacoli con entusiasmo
6. NON usare liste o format rigidi - scrivi in modo fluido e teatrale

Rispondi in 1-2 frasi al massimo.
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
    // 🎟 PRENOTAZIONE + CONFERMA
    // ----------------------
    if (isBooking) {
      const msg = message.toLowerCase();
      const missing =
        !session.spettacolo ? "spettacolo" :
        !session.nome ? "nome" :
        !session.posti ? "posti" :
        !session.data ? "data" : null;

      // Se in attesa di conferma
      if (session.waitingConfirmation) {
        if (/^(si|conferma|ok|va bene|procedi|invio|si certo|sicuro)$/i.test(msg)) {
          const now = new Date().toISOString();
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
⏰ Prenotato il: ${now}
`
            })
          });

          sessions[userId] = getSession(userId);

          return res.json({
            reply: "È tutto pronto! 🎭 La tua prenotazione è stata inviata. Ti aspettiamo a teatro!"
          });
        }

        if (/^(no|cancella|annulla|correggo|cambia|modifica|corretto)$/i.test(msg)) {
          session.waitingConfirmation = false;
          return res.json({
            reply: `Nessun problema! Quale dato vuoi correggere?\n📋 Riepilogo attuale:\n- Nome: ${session.nome}\n- Spettacolo: ${session.spettacolo}\n- Data: ${session.data}\n- Posti: ${session.posti}`
          });
        }

        const fieldMap = {
          "nome": "nome",
          "spettacolo": "spettacolo",
          "data": "data",
          "posti": "posti"
        };
        for (const [field, _] of Object.entries(fieldMap)) {
          if (msg.includes(field)) {
            session[field] = "";
          }
        }
        if (extracted.nome) session.nome = extracted.nome;
        if (extracted.spettacolo) session.spettacolo = extracted.spettacolo;
        if (extracted.data) session.data = extracted.data;
        if (extracted.posti) session.posti = extracted.posti;

        const newMissing =
          !session.spettacolo ? "spettacolo" :
          !session.nome ? "nome" :
          !session.posti ? "posti" :
          !session.data ? "data" : null;

        if (newMissing) {
          return res.json({
            reply: aiText || `Perfetto! Ma mi serve ancora: ${newMissing}`
          });
        }

        session.waitingConfirmation = true;
        return res.json({
          reply: `Perfetto, dati aggiornati!\n\n📋 RIEPLOGO PRENOTAZIONE:\n👤 Nome: ${session.nome}\n🎟 Spettacolo: ${session.spettacolo}\n📅 Data: ${session.data}\n🪑 Posti: ${session.posti}\n\nConfermi? Rispondi "SI" per procedere o "NO" per correggere.`
        });
      }

      // Prima raccolta dati
      if (missing) {
        return res.json({
          reply: aiText || `Mi racconti meglio? Mi manca ancora: ${missing}`
        });
      }

      // Tutti i dati presenti - chiede conferma
      session.waitingConfirmation = true;
      return res.json({
        reply: `📋 RIEPLOGO PRENOTAZIONE:\n👤 Nome: ${session.nome}\n🎟 Spettacolo: ${session.spettacolo}\n📅 Data: ${session.data}\n🪑 Posti: ${session.posti}\n\nConfermi? Rispondi "SI" per procedere o "NO" per correggere algunos dato.`
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
      reply: "C'è stato un piccolo imprevisto tecnico."
    });
  }
};
