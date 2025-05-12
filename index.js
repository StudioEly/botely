import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { OpenAI } from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const conversationLogs = [];

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/chat", async (req, res) => {
  const { message, threadId } = req.body;

  try {
    const thread = threadId
      ? { id: threadId }
      : await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      await new Promise((r) => setTimeout(r, 1000));
    } while (runStatus.status !== "completed");

    const messages = await openai.beta.threads.messages.list(thread.id);
    const last = messages.data[0]?.content[0]?.text?.value;

    // Log dans le tableau
    conversationLogs.push({
      date: new Date().toLocaleString(),
      threadId,
      question: message,
      reponse: last
    });

    const content = messages.data.map((m) => m.content[0]?.text?.value).join("\n");
    const match = content.match(/(prénom|nom|email|besoin).+/gi);
    const info = match ? match.join("\n") : null;

    if (info) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: "🧠 Nouveau prospect Élystudio",
        text: info,
      });
    }

    res.json({ reply: last, threadId: thread.id });
  } catch (err) {
    console.error("Erreur GPT ou serveur:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Interface HTML
app.get("/logs", (req, res) => {
  const auth = req.headers.authorization || '';
  const [type, credentials] = auth.split(' ');

  if (type !== 'Basic' || !credentials) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Logs Access"');
    return res.status(401).send('Authentification requise');
  }

  const [email, password] = Buffer.from(credentials, 'base64').toString().split(':');

  if (
    email !== process.env.LOG_EMAIL ||
    password !== process.env.LOG_PASSWORD
  ) {
    return res.status(403).send('Accès refusé');
  }

  // Affiche les logs si connecté
  const html = `
    <html>
      <head>
        <title>Conversations - Julie</title>
        <style>
          body { font-family: sans-serif; padding: 2rem; background: #f9f9f9; }
          h1 { color: #7c3aed; }
          .entry { background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; box-shadow: 0 0 4px rgba(0,0,0,0.1); }
          .question { font-weight: bold; color: #333; }
          .reponse { color: #555; margin-top: .5rem; }
          .date { font-size: .8rem; color: #888; }
        </style>
      </head>
      <body>
        <h1>📒 Historique des conversations avec Julie</h1>
        ${conversationLogs.map(log => `
          <div class="entry">
            <div class="date">${log.date}</div>
            <div class="question">👤 ${log.question}</div>
            <div class="reponse">🤖 ${log.reponse}</div>
          </div>
        `).join('')}
      </body>
    </html>
  `;
  res.send(html);
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`🧠 Serveur GPT Élystudio lancé sur http://localhost:${port}`);
});
