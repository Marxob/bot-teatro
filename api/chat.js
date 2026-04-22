// import * as cheerio from "cheerio";

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

    const mesi = {
      gennaio: 0, febbraio: 1, marzo: 2, aprile: 3,
      maggio: 4, giugno: 5, luglio: 6, agosto: 7,
      settembre: 8, ottobre: 9, novembre: 10, dicembre: 11
    };

    const dateRegex = /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s*(\d{4})?/gi;

    function extractDates(text) {
      const dates = [];

      const matches = [...text.matchAll(dateRegex)];
      matches.forEach(m => {
        const day = Number(m[1]);
        const month = mesi[m[2].toLowerCase()];
        const year = m[3] ? Number(m[3]) : new Date().getFullYear();

        const d = new Date(year, month, day);
        d.setHours(0,0,0,0);

        if (!isNaN(d.getTime())) {
          dates.push({
            raw: m[0],
            iso: d.toISOString().split("T")[0]
          });
        }
      });

      return dates;
    }

    return (data.feed.entry || [])
      .map(post => {
        const titolo = post.title.$t.trim();
        const contenuto = stripHtml(post.content?.$t || "");
        const link = (post.link || []).find(l => l.rel === "alternate")?.href || "";

        const dates = extractDates(contenuto);

        return {
          titolo,
          descrizione: contenuto.slice(0, 300),
          link,
          dateRaw: dates.map(d => d.raw),
          dateISO: dates.map(d => d.iso)
        };
      })
      .slice(0, 6);

  } catch (err) {
    console.error("Errore feed:", err);
    return [];
  }
}

// ----------------------
// 🤖 HANDLER
// ----------------------
export default async function handler(req, res) {

  // ✅ CORS
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

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ reply: "Messaggio vuoto." });
    }

    const spettacoli = await getSpettacoli();

    const listaSpettacoli = spettacoli.map(s => `
Titolo: ${s.titolo}
Descrizione: ${s.descrizione}
Date: ${s.dateRaw.join(", ") || "non specificate"}
`).join("\n");

    // ----------------------
    // 🧠 PROMPT STRUTTURATO
    // ----------------------
    const systemPrompt = `
Sei l'assistente del Teatro Tor di Nona.

OBIETTIVO:
Il tuo compito è accogliere i visitatori con calore e professionalità, fornire informazioni sugli spettacoli e accompagnarli nella prenotazione in modo naturale.

🎨 STILE

- Elegante, accogliente e professionale
- Ispirato alla magia del teatro
- Conversazionale (non sembrare un modulo)
- Breve e chiaro

---

🎯 COMPORTAMENTO GENERALE

- Saluta l’utente e chiedi come puoi aiutarlo
- Offri 2 possibilità:
• prossima programmazione
• prenotazione
- Oppure rispondi liberamente alle richieste


Rispondi SEMPRE in JSON valido.

Formato:

{
  "intent": "informazione | richiesta_dati | prenotazione",
  "message": "testo per utente",
  "nome": "",
  "spettacolo": "",
  "data": "",
  "posti": ""
}

Regole:
Quando l’utente vuole prenotare:
- guida la conversazione in modo naturale
- NON fare un elenco rigido di domande
- raccogli i dati uno alla volta
- Se mancano dati → richiesta_dati
- Se completo → prenotazione
- NON scrivere testo fuori JSON

LOGICA

- Chiedi SOLO i dati mancanti
- Ordine consigliato:
1. spettacolo
2. nome
3. posti
4. data



Spettacoli:
${listaSpettacoli}
`;

    // ----------------------
    // 🤖 CHIAMATA OPENROUTER
    // ----------------------
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ]
      })
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("ERRORE OPENROUTER:", errText);
      throw new Error("Errore AI");
    }

    const data = await aiResponse.json();

    let aiText = data?.choices?.[0]?.message?.content || "{}";

  let parsed;

try {
  // prova parsing diretto
  parsed = JSON.parse(aiText);
} catch (e) {
  try {
    // prova a estrarre JSON dal testo
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (err2) {
    console.error("JSON parse error:", aiText);
    parsed = {
      intent: "informazione",
      message: aiText
    };
  }
}

    const reply = parsed.message || "Errore risposta AI";

    // ----------------------
    // 📩 TELEGRAM
    // ----------------------
    if (parsed.intent === "prenotazione") {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.CHAT_ID,
          text: `
🎭 NUOVA PRENOTAZIONE

👤 Nome: ${parsed.nome}
🎟 Spettacolo: ${parsed.spettacolo}
📅 Data: ${parsed.data}
🪑 Posti: ${parsed.posti}
`
        })
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("ERRORE BACKEND:", error);

    return res.status(500).json({
      reply: "C'è stato un problema tecnico. Riprova tra poco."
    });
  }
}
