const SPETTACOLI_FALLBACK = [
  { titolo: "PROGRAMMAZIONE IN AGGIORNAMENTO", periodo: "contattaci per info", isFuture: true }
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

    const entries = data.feed.entry || [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const spettacoli = entries.slice(0, 20).map(post => {
      const content = stripHtml(post.content?.$t || "");
      const titolo = post.title.$t;
      const periodo = extractPeriodo(content);
      const startDate = periodo ? getStartDate(periodo) : null;
      const isFuture = !startDate || startDate >= today;
      return { titolo, periodo, isFuture, descrizione: content.slice(0, 200) };
    }).filter(s => s.titolo);

    const future = spettacoli.filter(s => s.isFuture);
    console.log("Spettacoli totali:", spettacoli.length, "| futuri:", future.length);
    return future.length > 0 ? future : SPETTACOLI_FALLBACK;
  } catch (e) {
    console.error("Feed error:", e);
    return SPETTACOLI_FALLBACK;
  }
}

const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = { nome: "", spettacolo: "", data: "", posti: "", waitingConfirmation: false };
  }
  sessions[userId].waitingConfirmation = false;
  return sessions[userId];
}

function parseDate(text) {
  const today = new Date();
  const msg = text.toLowerCase();
  if (msg.includes("oggi")) return today.toISOString().split("T")[0];
  if (msg.includes("domani")) {
    const d = new Date();
    d.setDate(today.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  const giorni = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
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

function extractData(message, spettacoli) {
  const msg = message.toLowerCase();
  const postiMatch = msg.match(/\b(\d+)\b/);
  const posti = postiMatch ? postiMatch[1] : "";
  const nomeMatch = message.match(/sono\s+([A-Za-z]+)|mi chiamo\s+([A-Za-z]+)/i);
  const nome = nomeMatch ? (nomeMatch[1] || nomeMatch[2]) : "";
  let spettacolo = "";
  let data = parseDate(message);
  for (let s of spettacoli) {
    if (s.titolo && msg.includes(s.titolo.toLowerCase())) {
      spettacolo = s.titolo;
      if (!data && s.periodo) data = s.periodo;
      break;
    }
  }
  return { posti, nome, data, spettacolo };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { message, userId = "default" } = req.body || {};
    if (!message) return res.json({ reply: "Scrivimi pure 😊" });

    const session = getSession(userId);
    const spettacoli = await getSpettacoli();
    const extracted = extractData(message, spettacoli);

    if (extracted.posti) session.posti = extracted.posti;
    if (extracted.nome) session.nome = extracted.nome;
    if (extracted.data) session.data = extracted.data;
    if (extracted.spettacolo) session.spettacolo = extracted.spettacolo;

    const isBooking = /prenot|bigliett|posti|voglio|riserv/i.test(message);
    const isFirstContact = !session.nome && !session.spettacolo && !session.posti && !session.data;

    const welcome = isFirstContact ? "Benvenuto al Teatro Tordinona! 🎭\n\n" : "";
    const prompt = `
Sei l'assistente del Teatro Tordinona.

${welcome}PROGRAMMAZIONE:
${spettacoli.map(s => `• ${s.titolo} (${s.periodo || "data da confermare"})`).join("\n")}

DATI RACCOLTI:
- Nome: ${session.nome || "NON FORNITO"}
- Spettacolo: ${session.spettacolo || "NON FORNITO"}
- Data: ${session.data || "NON FORNITA"}
- Posti: ${session.posti || "NON FORNITI"}

ISTRUZIONI:
1. Se l'utente vuole prenotare, chiedi i dati mancanti
2. Estrai le informazioni dal messaggio
3. Rispondi in 1-2 frasi
`;

    let aiText = "";
    if (!process.env.OPENROUTER_API_KEY) {
      console.error("OPENROUTER_API_KEY mancante");
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
            model: "qwen/qwen3-next-80b-a3b-instruct:free",
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data = await aiResponse.json();
        if (data.error) console.error("OpenRouter error:", data.error.message);
        else aiText = data?.choices?.[0]?.message?.content || "";
      } catch (e) {
        console.error("OpenRouter error:", e.message);
      }
    }

    if (!aiText) {
      console.log("AI failed, spettacoli:", spettacoli.length);
      const lista = spettacoli.map((s, i) => `${i + 1}. ${s.titolo} (${s.periodo || "data da confermare"})`).join("\n");
      aiText = `${welcome}Ecco gli spettacoli in programma:\n${lista}\n\nScrivimi quale ti interessa!`;
    }

    if (isBooking) {
      const msg = message.toLowerCase();
      const missing = !session.spettacolo ? "spettacolo" : !session.nome ? "nome" : !session.posti ? "posti" : !session.data ? "data" : null;

      if (session.waitingConfirmation) {
        if (/^(si|conferma|ok|va bene|procedi|si certo)$/i.test(msg)) {
          const now = new Date().toISOString();
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: process.env.CHAT_ID,
              text: `🎭 NUOVA PRENOTAZIONE\n\n👤 Nome: ${session.nome}\n🎟 Spettacolo: ${session.spettacolo}\n📅 Data: ${session.data}\n🪑 Posti: ${session.posti}\n⏰ ${now}`
            })
          });
          sessions[userId] = getSession(userId);
          return res.json({ reply: "È tutto pronto! 🎭 Prenotazione inviata. Ti aspettiamo a teatro!" });
        }
        if (/^(no|cancella|annulla)$/i.test(msg)) {
          session.waitingConfirmation = false;
          return res.json({ reply: "Nessun problema! Quale dato vuoi correggere?" });
        }
        if (extracted.nome) session.nome = extracted.nome;
        if (extracted.spettacolo) session.spettacolo = extracted.spettacolo;
        if (extracted.data) session.data = extracted.data;
        if (extracted.posti) session.posti = extracted.posti;
        const newMissing = !session.spettacolo ? "spettacolo" : !session.nome ? "nome" : !session.posti ? "posti" : !session.data ? "data" : null;
        if (newMissing) return res.json({ reply: aiText || `Mi serve ancora: ${newMissing}` });
        session.waitingConfirmation = true;
        return res.json({ reply: `📋 RIEPILOGO:\n👤 ${session.nome}\n🎟 ${session.spettacolo}\n📅 ${session.data}\n🪑 ${session.posti}\n\nConfermi?` });
      }

      if (missing) return res.json({ reply: aiText || `Mi manca: ${missing}` });

      session.waitingConfirmation = true;
      return res.json({ reply: `📋 RIEPILOGO:\n👤 ${session.nome}\n🎟 ${session.spettacolo}\n📅 ${session.data}\n🪑 ${session.posti}\n\nConfermi?` });
    }

    return res.json({ reply: aiText });
  } catch (error) {
    console.error(error);
    return res.json({ reply: "C'è stato un errore tecnico." });
  }
};
