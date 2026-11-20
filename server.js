import express from "express";
import { fileURLToPath, pathToFileURL } from "node:url";
import { formats, groups, normalizeApplication, validateApplication } from "./public/application-fields.js";

const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const sendError = "Не удалось отправить заявку. Попробуйте ещё раз.";

export function createApp({
  botToken = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  telegramApiUrl = "https://api.telegram.org",
} = {}) {
  const app = express();
  app.disable("x-powered-by");

  app.post("/api/applications", express.json({ limit: "4kb" }), async (req, res) => {
    const application = normalizeApplication(req.body);
    const errors = validateApplication(application);

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Проверьте поля формы.", errors });
    }

    if (!botToken?.trim() || !chatId?.trim()) {
      return res.status(503).json({ message: sendError });
    }

    const { name, contact, group, format } = application;
    const forChild = group === "children";
    const text = [
      "Новая заявка на курс IT Room",
      `${forChild ? "Имя родителя" : "Имя"}: ${name}`,
      `${forChild ? "Контакт родителя" : "Контакт"}: ${contact}`,
      `Группа: ${groups[group]}`,
      `Формат: ${formats[format]}`,
    ].join("\n");

    try {
      const response = await fetch(`${telegramApiUrl}/bot${botToken.trim()}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId.trim(), text }),
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
      const result = await response.json();
      if (!response.ok || result?.ok !== true) {
        return res.status(502).json({ message: sendError });
      }
    } catch {
      return res.status(502).json({ message: sendError });
    }

    return res.status(201).json({ ok: true });
  });

  app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ message: "Отправьте данные формы в формате JSON." });
    }
    if (error.type === "entity.too.large") {
      return res.status(413).json({ message: "Данные заявки слишком длинные." });
    }
    return next(error);
  });

  app.use(express.static(publicDirectory));
  return app;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT || 3000);
  const server = createApp().listen(port, () => {
    console.log(`IT Room — http://localhost:${server.address().port}`);
  });
}
