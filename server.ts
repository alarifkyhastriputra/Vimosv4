import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Helper for lazy initializing Gemini
  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }
    if (!aiClient) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return aiClient;
  }

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", aiEnabled: !!process.env.GEMINI_API_KEY });
  });

  // Client IP discovery endpoint
  app.get("/api/get-ip", (req, res) => {
    try {
      const forwarded = req.headers["x-forwarded-for"];
      let clientIp = "";
      if (typeof forwarded === "string") {
        clientIp = forwarded.split(",")[0].trim();
      } else if (Array.isArray(forwarded) && forwarded[0]) {
        clientIp = forwarded[0].trim();
      } else {
        clientIp = (req.socket.remoteAddress || req.ip || "127.0.0.1").replace(/^.*:/, "");
      }
      res.json({ ip: clientIp || "127.0.0.1" });
    } catch (e) {
      res.json({ ip: "127.0.0.1" });
    }
  });

  // AI Chat API endpoint
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message, history = [], customInstruction, botName = "vimos.ai" } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Pesan tidak boleh kosong." });
      }

      const ai = getGeminiClient();
      if (!ai) {
        // Fallback intelligent response if API key is not yet configured
        return res.json({
          reply: `Halo! Saya ${botName} 🤖 dari Vimos. Saat ini kunci API Gemini sedang dalam proses persiapan di pengaturan server, tapi saya tetap siap menyapa kamu! Tanya apa saja ya begitu koneksi aktif!`
        });
      }

      const defaultSystemInstruction = 
        `Kamu adalah ${botName}, asisten AI resmi, cerdas, ramah, dan berjiwa modern di media sosial Vimos. ` +
        `Karakteristikmu:\n` +
        `- Ramah, asik, berwawasan luas, cerdas, kreatif, dan responsif.\n` +
        `- Menggunakan bahasa Indonesia yang luwes, alami, dan enak dibaca (bisa santai, sopan, atau formal sesuai gaya lawan bicara).\n` +
        `- Ahli dalam berbagai hal: menulis caption/postingan viral, ide reels/video, rekomendasi musik, konsultasi umum, coding, belajar, hingga ngobrol curhat yang seru.\n` +
        `- Jika pengguna menyapa atau bertanya siapa kamu, perkenalkan dirimu sebagai "${botName}" dari Vimos.\n` +
        `- Format teks dengan rapi (bisa gunakan bullet points, bold, atau kutipan jika relevan agar mudah dibaca).`;

      // Build conversation contents including history
      const formattedContents: any[] = [];

      if (Array.isArray(history)) {
        for (const item of history.slice(-10)) {
          if (item && item.text) {
            formattedContents.push({
              role: item.role === 'model' || item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: item.text }]
            });
          }
        }
      }

      // Add current message
      formattedContents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      // Ultra-fast model list with low thinking latency for instant replies
      const candidateModels = ["gemini-3.7-flash", "gemini-flash-latest"];
      let replyText: string | null = null;
      let lastError: any = null;

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: formattedContents,
            config: {
              systemInstruction: customInstruction || defaultSystemInstruction,
              temperature: 0.7,
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
            },
          });

          if (response.text) {
            replyText = response.text;
            break;
          }
        } catch (err: any) {
          console.warn(`Hengkur AI: Model ${modelName} encountered an error:`, err?.message || err);
          lastError = err;
          // Continue to fallback model
        }
      }

      if (replyText) {
        return res.json({ reply: replyText });
      }

      // If all models failed (e.g. 503 high demand across all), provide a graceful fallback message
      console.error("All Gemini candidate models failed:", lastError);
      return res.json({
        reply: `Halo! Server AI saat ini sedang mengalami lonjakan lalu lintas yang tinggi. ${botName} sedang menyegarkan sistem sebentar. Silakan tanyakan lagi dalam beberapa detik ya! 🔄`
      });
    } catch (error: any) {
      console.error("AI Chat Root Error:", error);
      return res.json({
        reply: "Waduh, koneksi AI sempat terganggu karena lonjakan trafik. Silakan coba kirim ulang pertanyaanmu ya! 🤖"
      });
    }
  });

  // Vite development / production middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Vimos Server & vimos.ai running on port ${PORT}`);
  });
}

startServer();
