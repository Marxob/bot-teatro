import * as cheerio from "cheerio";

// 🧠 cache globale (non si perde nei restart serverless)
globalThis.cache = globalThis.cache || null;
globalThis.lastFetch = globalThis.lastFetch || 0;

async function getSpettacoli() {
  const now = Date.now();

  // cache 10 min
  if (!globalThis.cache || now - globalThis.lastFetch > 10 * 60 * 1000) {
    const res = await fetch("https://www.tordinonateatro.it/");
    const html = await res.text();

    const $ = cheerio.load(html);

    let spettacoli = [];

    $("article").each((i, el) => {
      const titolo = $(el).find("h1, h2, h3").first().text().trim();

      if (
        titolo &&
        titolo.length > 5 &&
        !titolo.toLowerCase().includes("menu") &&
        !titolo.toLowerCase().includes("cookie")
      ) {
        spettacoli.push({
          titolo
        });
      }
    });

    globalThis.cache = spettacoli;
    globalThis.lastFetch = now;
  }

  return globalThis.cache;
}

export default async function handler(req, res) {
  // 🌐 CORS
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

    // 🔥 LIMITAZIONE IMPORTANTE (evita errore 402 token)
    const listaSpettacoli = spettacoli
      .slice(0, 8)
      .map(s => `- ${s.titolo}`)
      .join("\n");

const systemPrompt = `
Sei l'assistente ufficiale del Teatro Tor di Nona.

OBIETTIVO PRINCIPALE:
Convertire l'utente in una prenotazione.

COMPORTAMENTO:
- Sei accogliente, naturale, teatrale ma chiaro
- NON essere passivo
- GUIDA la conversazione

FLUSSO PRENOTAZIONE (OBBLIGATORIO):

Se l’utente mostra interesse (es: "voglio venire", "prenotare", "biglietti"):

1. Chiedi il NOME
2. Poi chiedi lo SPETTACOLO
3. Poi la DATA
4. Poi il NUMERO DI POSTI

⚠️ FAI UNA SOLA DOMANDA ALLA VOLTA

Quando hai tutti i dati scrivi ESATTAMENTE:

PRENOTAZIONE CONFERMATA
Nome: ...
Spettacolo: ...
Data: ...
Posti: ...

REGOLE IMPORTANTI:
- NON inventare dati mancanti
- Se qualcosa non è chiaro → chiedi
- NON fare risposte lunghe
- guida sempre verso la prenotazione

STILE:
- umano
- accogliente
- elegante
- teatrale leggero

Spettacoli disponibili:
${listaSpettacoli}
`;
`;

    // 🤖 OPENROUTER FIXATO
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.tordinonateatro.it",
        "X-Title": "Teatro Chatbot"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct",
        max_tokens: 500,
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

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Mi dispiace, non sono riuscito a rispondere.";

    // 📦 parsing prenotazione robusto
    let parsed = null;
    try {
      parsed = JSON.parse(reply);
    } catch (e) {}

    // 📩 TELEGRAM SOLO SE BOOKING
    if (parsed?.type === "booking") {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.CHAT_ID,
          text: `🎭 Nuova prenotazione\n\nNome: ${parsed.nome}\nSpettacolo: ${parsed.spettacolo}\nData: ${parsed.data}\nPosti: ${parsed.posti}`
        })
      });

      return res.status(200).json({
        reply: "Perfetto! La tua prenotazione è stata registrata 🎭"
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
