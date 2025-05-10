import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { OpenAI } from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/chat", async (req, res) => {
  const { message, threadId } = req.body;

  try {
    // Crée un thread si aucun ID fourni
    const thread = threadId
      ? { id: threadId }
      : await openai.beta.threads.create();

    // Ajoute le message utilisateur
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    // Lance l’exécution de l’assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    // Attend que l’assistant réponde
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      await new Promise((r) => setTimeout(r, 1000));
    } while (runStatus.status !== "completed");

    // Récupère la réponse de l’assistant
    const messages = await openai.beta.threads.messages.list(thread.id);
    const last = messages.data[0]?.content[0]?.text?.value;

    // Extraction simplifiée d’infos (optionnel)
    const content = messages.data.map((m) => m.content[0]?.text?.value).join("\n");
    const match = content.match(/(prénom|nom|email|besoin).+/gi);
    const info = match ? match.join("\n") : null;

    // Envoie email si données détectées
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

app.listen(3001, () => {
  console.log("🧠 Serveur GPT Élystudio lancé sur http://localhost:3001");
});
