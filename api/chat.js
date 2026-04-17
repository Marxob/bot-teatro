import * as cheerio from "cheerio";

let cache = null;
let lastFetch = 0;

async function getSpettacoli() {
  const res = await fetch("https://www.tordinonateatro.it/");
  const html = await res.text();

  const $ = cheerio.load(html);

  let spettacoli = [];

  $("article").each((i, el) => {
    const titolo = $(el).find("h1, h2, h3").first().text().trim();
    const descrizione = $(el).find("p").text().trim();

    if (titolo) {
      spettacoli.push({
        titolo,
        descrizione: descrizione.substring(0, 200)
      });
    }
  });

  return spettacoli;
}

  return cache;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const { message } = req.body;

  const spettacoli = await getSpettacoli();

  const lista = spettacoli.map(s =>
    `- ${s.titolo}: ${s.descrizione.substring(0, 100)}`
  ).join("\n");

  const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama3-70b-8192",
      messages: [
        {
          role: "system",
          content: `
Sei l'assistente di un teatro.
Parla in modo accogliente e naturale.

Se l'utente vuole prenotare raccogli:
nome, spettacolo, data, numero posti.

Quando completo scrivi:
PRENOTAZIONE CONFERMATA

Spettacoli:
${lista}
`
        },
        { role: "user", content: message }
      ]
    })
  });

  const data = await aiResponse.json();
  const reply = data.choices[0].message.content;

  // invio Telegram
  if (reply.includes("PRENOTAZIONE CONFERMATA")) {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.CHAT_ID,
        text: reply
      })
    });
  }

  res.status(200).json({ reply });
}
