import * as cheerio from "cheerio";

// cache spettacoli
let cache = null;
let lastFetch = 0;

async function getSpettacoli() {
  const now = Date.now();

  if (!cache || now - lastFetch > 10 * 60 * 1000) {
    const res = await fetch("https://www.tordinonateatro.it/");
    const html = await res.text();

    const $ = cheerio.load(html);

    let spettacoli = [];

    $("article").each((i, el) => {
      const titolo = $(el).find("h1, h2, h3").first().text().trim();
      const descrizione = $(el).find("p").text().trim();

      if (
        titolo &&
        titolo.length > 5 &&
        !titolo.toLowerCase().includes("menu")
      ) {
        spettacoli.push({
          titolo,
          descrizione: descrizione.substring(0, 200)
        });
      }
    });

    cache = spettacoli;
    lastFetch = now;
  }

  return cache;
}

export default async function handler(req, res) {

  // ✅ CORS (PRIMA DI TUTTO)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ risposta preflight
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

    const listaSpettacoli = spettacoli
      .map(
        (s) =>
          `- ${s.titolo}: ${s.descrizione.replace(/\s+/g, " ").trim()}`
      )
      .join("\n");

    const systemPrompt = `
Sei l'assistente del Teatro Tor di Nona.

Accogli gli spettatori con calore e professionalità.
Parli in modo naturale, elegante ma semplice.

Aiuti a:
- scoprire gli spettacoli
- consigliare in base ai gusti
- prenotare posti

Quando proponi spettacoli:
non fare elenchi freddi, ma suggerimenti naturali.

Prenotazioni:
raccogli:
- nome
- spettacolo
- data
- numero posti

Fai una domanda alla volta.

Quando hai tutti i dati scrivi ESATTAMENTE:
PRENOTAZIONE CONFERMATA

IMPORTANTE:
Le date potrebbero essere nelle descrizioni.
Se non sei sicuro, chiedi chiarimenti.

Tono:
- umano
- accogliente
- leggermente teatrale

Spettacoli disponibili:
${listaSpettacoli}
`;

    // chiamata Groq
    const aiResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ]
        })
      }
    );

    if (!aiResponse.ok) {
      throw new Error("Errore chiamata AI");
    }

    const data = await aiResponse.json();

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Mi dispiace, non sono riuscito a rispondere.";

    // invio Telegram
    if (false) {
    //if (reply.includes("PRENOTAZIONE CONFERMATA")) {
      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.CHAT_ID,
            text: `🎭 Nuova prenotazione - Teatro Tor di Nona\n\n${reply}`
          })
        }
      );
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("ERRORE BACKEND:", error);

    return res.status(500).json({
      reply: "C'è stato un problema tecnico. Riprova tra poco."
    });
  }
}
