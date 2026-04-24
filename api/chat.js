// ----------------------
// 📅 SPETTACOLI
// ----------------------
const SPETTACOLI_FALLBACK = [
  { titolo: "PROGRAMMAZIONE IN AGGIORNAMENTO", periodo: "contattaci per info" }
];

async function getSpettacoli() {
  try {
    const res = await fetch("https://www.tordinonateatro.it/feeds/posts/default?alt=json");
    if (!res.ok) throw new Error("Feed not available");
    const data = await res.json();

    function stripHtml(html) {
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    const mesi = { gen: "01", feb: "02", mar: "03", apr: "04", mag: "05", giu: "06", lug: "07", ago: "08", set: "09", ott: "10", nov: "11", dic: "12" };

    function parseDateString(str) {
      const m = str.toLowerCase().match(/(\d{1,2})[\/\-\s]?(\d{1,2})?[\/\-\s]?(\d{0,4})?/);
      if (m) {
        const gg = m[1].padStart(2, "0");
        const mm = m[2] ? m[2].padStart(2, "0") : "01";
        const aa = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : new Date().getFullYear().toString();
        return `${aa}-${mm}-${gg}`;
      }
      const mese = str.toLowerCase().match(/gen|feb|mar|apr|mag|giu|lug|ago|set|oct|nov|dic/);
      if (mese) {
        const gg = str.match(/(\d{1,2})/)?.[1] || "01";
        return `${new Date().getFullYear()}-${mesi[mese[0]]}-${gg.padStart(2, "0")}`;
      }
      return "";
    }

    function extractPeriodo(content) {
      const patterns = [
        /dal\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})\s+al\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})/i,
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*[\-\/](\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
        /(\d{1,2}\s+\w+)\s*[\-\/]\s*(\d{1,2}\s+\w+)/i,
        /fino\s+al\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})/i,
        /(\d{1,2})\s*(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/i
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          if (pattern.toString().includes("dal") && match[2]) {
            return `${parseDateString(match[1])} / ${parseDateString(match[2])}`;
          }
          if (match[2] && match[4]) {
            return `${match[1]}/${match[2]} - ${match[4]}/${match[5]}`;
          }
          if (match[2]) {
            return `${parseDateString(match[0])} / ${parseDateString(match[2])}`;
          }
          if (pattern.toString().includes("fino")) {
            return `fino al ${parseDateString(match[1])}`;
          }
          return parseDateString(match[0]);
        }
      }

      const singleDate = content.match(/(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/i);
      if (singleDate) return parseDateString(singleDate[0]);

      return "";
    }

    const spettacoli = (data.feed.entry || []).slice(0, 10).map(post => {
      const content = stripHtml(post.content?.$t || "");
      return {
        titolo: post.title.$t,
        periodo: extractPeriodo(content),
        descrizione: content.slice(0, 150)
      };
    }).filter(s => s.titolo);

    return spettacoli.length > 0 ? spettacoli : SPETTACOLI_FALLBACK;

  } catch (e) {
    console.error("Feed error:", e);
    return SPETTACOLI_FALLBACK;
  }
}

    const mesi = { gen: "01", feb: "02", mar: "03", apr: "04", mag: "05", giu: "06", lug: "07", ago: "08", set: "09", ott: "10", nov: "11", dic: "12" };

    function parseDateString(str) {
      const m = str.toLowerCase().match(/(\d{1,2})[\/\-\s]?(\d{1,2})?[\/\-\s]?(\d{2,4})?/);
      if (m) {
        const gg = m[1].padStart(2, "0");
        const mm = m[2] ? m[2].padStart(2, "0") : "01";
        const aa = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : new Date().getFullYear().toString();
        return `${aa}-${mm}-${gg}`;
      }
      const mese = str.toLowerCase().match(/gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic/);
      if (mese) {
        const gg = str.match(/(\d{1,2})/)?.[1] || "01";
        return `${new Date().getFullYear()}-${mesi[mese[0]]}-${gg.padStart(2, "0")}`;
      }
      return "";
    }

    function extractPeriodo(content) {
      const patterns = [
        /dal\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})\s+al\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})/i,
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*[\-\/](\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
        /(\d{1,2}\s+\w+)\s*[\-\/]\s*(\d{1,2}\s+\w+)/i,
        /fino\s+al\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})/i,
        /(\d{1,2})\s*(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/i
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          if (pattern.toString().includes("dal") && match[2]) {
            return `${parseDateString(match[1])} / ${parseDateString(match[2])}`;
          }
          if (match[2] && match[4]) {
            return `${match[1]}/${match[2]} - ${match[4]}/${match[5]}`;
          }
          if (match[2]) {
            return `${parseDateString(match[0])} / ${parseDateString(match[2])}`;
          }
          if (pattern.toString().includes("fino")) {
            return `fino al ${parseDateString(match[1])}`;
          }
          return parseDateString(match[0]);
        }
      }

      const singleDate = content.match(/(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/i);
      if (singleDate) return parseDateString(singleDate[0]);

      return "";
    }

    return (data.feed.entry || []).slice(0, 10).map(post => {
      const content = stripHtml(post.content?.$t || "");
      return {
        titolo: post.title.$t,
        periodo: extractPeriodo(content),
        descrizione: content.slice(0, 150)
      };
    }).filter(s => s.titolo);

  } catch (e) {
    console.error("Feed error:", e);
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
  let data = parseDate(message);

  for (let s of spettacoli) {
    if (s.titolo && msg.includes(s.titolo.toLowerCase())) {
      spettacolo = s.titolo;
      if (!data && s.periodo) data = s.periodo;
      break;
    }
    if (!spettacolo && s.periodo && msg.includes(s.periodo.toLowerCase()) && s.titolo) {
      data = s.periodo;
      spettacolo = s.titolo;
      break;
    }
  }

  return {
    posti,
    nome,
    data,
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
${spettacoli.length > 0 ? spettacoli.map(s => `• ${s.periodo || "date da confermare"} - ${s.titolo}`).join("\n") : "Nessuno spettacolo in programma"}

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
5. Se l'utente chiede informazioni, presenta gli spettacoli così:
   "Ecco gli spettacoli in programma:
   • 15/03 - Titolo Spettacolo
   • 22/03 - Altro Spettacolo"
   - Mostra sempre la data prima del titolo
6. Rispondi in 1-2 frasi al massimo.
`;

    // ----------------------
    // 🤖 GEMINI 2.5 FLASH
    // ----------------------
    let aiText = "";
    let geminiError = "";

    try {
      if (!process.env.GEMINI_API_KEY) {
        geminiError = "API key mancante";
        throw new Error("GEMINI_API_KEY non configurata");
      }

      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

      if (data.error) {
        geminiError = data.error.message;
        throw new Error(data.error.message);
      }

      aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    } catch (e) {
      console.error("Gemini error:", e.message);
      geminiError = e.message;
    }

    if (geminiError) {
      return res.json({
        reply: `⚠️ Servizio temporaneamente non disponibile. Riprova più tardi.`
      });
    }

    if (!aiText) {
      console.log("AI empty - spettacoli:", spettacoli.length, "geminiError:", geminiError);
      aiText = `Ciao! Ecco gli spettacoli in programma:\n${spettacoli.map((s, i) => `${i + 1}. ${s.periodo} - ${s.titolo}`).join("\n")}\n\nScrivimi quale ti interessa!`;
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
