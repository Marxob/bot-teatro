// ----------------------
// 📅 SPETTACOLI
// ----------------------
const SPETTACOLI_FALLBACK = [
  { titolo: "PROGRAMMAZIONE IN AGGIORNAMENTO", periodo: "contattaci per info" }
];

const mesiMap = { gen: "01", feb: "02", mar: "03", apr: "04", mag: "05", giu: "06", lug: "07", ago: "08", set: "09", ott: "10", nov: "11", dic: "12" };

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDateString(str) {
  if (!str) return "";
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
    return `${new Date().getFullYear()}-${mesiMap[mese[0]]}-${gg.padStart(2, "0")}`;
  }
  return "";
}

function getStartDate(periodo) {
  if (!periodo) return null;
  const parts = periodo.split(" / ");
  const d = parts[0] ? new Date(parts[0]) : null;
  return d && !isNaN(d) ? d : null;
}

function extractPeriodo(content) {
  if (!content) return "";
  const patterns = [
    /dal\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})\s+al\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})/i,
    /fino\s+al\s+(\d{1,2}[\/\-\s]?\w+[\/\-\s]?\d{0,4})/i,
    /(\d{1,2})\s*(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/i
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      if (pattern.toString().includes("dal") && match[2]) {
        return `${parseDateString(match[1])} / ${parseDateString(match[2])}`;
      }
      if (pattern.toString().includes("fino")) {
        return `fino al ${parseDateString(match[1])}`;
      }
      return parseDateString(match[0]);
    }
  }
  return "";
}

async function getSpettacoli() {
  try {
    const res = await fetch("https://www.tordinonateatro.it/feeds/posts/default?alt=json");
    if (!res.ok) throw new Error("Feed not available");
    const data = await res.json();

    const spettacoli = (data.feed.entry || []).slice(0, 15).map(post => {
      const content = stripHtml(post.content?.$t || "");
      return {
        titolo: post.title.$t,
        periodo: extractPeriodo(content),
        descrizione: content.slice(0, 150)
      };
    }).filter(s => s.titolo);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filtered = spettacoli.filter(s => {
      if (!s.periodo) return true;
      const startDate = getStartDate(s.periodo);
      return !startDate || startDate >= today;
    });

    return filtered.length > 0 ? filtered : SPETTACOLI_FALLBACK;

  } catch (e) {
    console.error("Feed error:", e);
    return SPETTACOLI_FALLBACK;
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
    const isFirstContact = !session.nome && !session.spettacolo && !session.posti && !session.data;
    const welcome = isFirstContact ? `Benvenuto al Teatro Tordinona! 🎭 Sono il tuo accompagnatore per la stagione teatrale.\n\n` : "";

    const prompt = `
Sei l'assistente del Teatro Tordinona. Il tuo obiettivo è AIUTARE l'utente a prenotare o informarsi sugli spettacoli.

${welcome}PROGRAMMAZIONE ATTUALE (solo spettacoli futuri):
${spettacoli.length > 0 ? spettacoli.map(s => `• ${s.periodo || "date da confermare"} - ${s.titolo}`).join("\n") : "Nessuno spettacolo in programma"}

DATI GIA' RACCOLTI:
- Nome: ${session.nome || "NON FORNITO"}
- Spettacolo: ${session.spettacolo || "NON FORNITO"}
- Data: ${session.data || "NON FORNITA"}
- Posti: ${session.posti || "NON FORNITI"}

ISTRUZIONI:
1. Se l'utente vuole prenotare, chiedi i dati mancanti in modo naturale
2. Estrai e usa TUTTE le informazioni utili dal messaggio dell'utente
3. Se hai TUTTI i dati, conferma la prenotazione
4. Se mancano dati, chiedili in modo conversazionale
5. Se l'utente chiede informazioni, presenta gli spettacoli con data prima del titolo
6. Rispondi in 1-2 frasi al massimo.
`;

    // ----------------------
    // 🤖 GEMINI
    // ----------------------
    let aiText = "";
    // ----------------------
    // 🤖 OPENROUTER AI
    // ----------------------
    let aiText = "";

    if (!process.env.OPENROUTER_API_KEY) {
      console.error("OPENROUTER_API_KEY non configurata");
    } else {
      try {
        const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://tordinonateatro.it",
            "X-Title": "Teatro Tordinona Bot"
          },
          body: JSON.stringify({
            model: "nvidia/nemotron-3-super-120b-a12b:free",
            messages: [{ role: "user", content: prompt }]
          })
        });

        const data = await aiResponse.json();

        if (data.error) {
          console.error("OpenRouter error:", data.error.message);
        } else {
          aiText = data?.choices?.[0]?.message?.content || "";
        }
      } catch (e) {
        console.error("OpenRouter error:", e.message);
      }
    }

    if (!aiText) {
      console.log("Fallback triggered - spettacoli:", spettacoli.length);
      const welcome = isFirstContact ? "Benvenuto al Teatro Tordinona! 🎭 Sono il tuo accompagnatore per la stagione teatrale.\n\n" : "";
      const lista = spettacoli.map((s, i) => `${i + 1}. ${s.periodo} - ${s.titolo}`).join("\n");
      aiText = `${welcome}Ecco gli spettacoli in programma:\n${lista}\n\nScrivimi quale ti interessa o chiama per prenotare: 02 1234567`;
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
              text: `🎭 NUOVA PRENOTAZIONE

👤 Nome: ${session.nome}
🎟 Spettacolo: ${session.spettacolo}
📅 Data: ${session.data}
🪑 Posti: ${session.posti}
⏰ Prenotato il: ${now}`
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
            reply: `Nessun problema! Quale dato vuoi correggere?\n📋 Riepilogo:\n- Nome: ${session.nome}\n- Spettacolo: ${session.spettacolo}\n- Data: ${session.data}\n- Posti: ${session.posti}`
          });
        }

        // Correzione dati
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
        reply: `📋 RIEPLOGO PRENOTAZIONE:\n👤 Nome: ${session.nome}\n🎟 Spettacolo: ${session.spettacolo}\n📅 Data: ${session.data}\n🪑 Posti: ${session.posti}\n\nConfermi? Rispondi "SI" per procedere o "NO" per correggere.`
      });
    }

    // ----------------------
    // 💬 RISPOSTA NATURALE
    // ----------------------
    return res.json({
      reply: aiText
    });

  } catch (error) {
    console.error(error);
    return res.json({
      reply: "C'è stato un piccolo imprevisto tecnico."
    });
  }
};
