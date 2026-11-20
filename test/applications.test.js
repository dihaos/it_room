import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../server.js";

async function start(t, server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function mockTelegram(t, handler) {
  return start(t, createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString());
    const { status = 200, payload } = handler(message, request);
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  }));
}

const valid = { name: "Мария", contact: "@example_user", group: "children", format: "online" };
const telegramSettings = { botToken: "stub-token", chatId: "12345" };

function submit(site, data) {
  return fetch(`${site}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

test("раздаёт страницу и подтверждает доставку после ответа Telegram", async (t) => {
  const received = [];
  const telegramApiUrl = await mockTelegram(t, (message, request) => {
    received.push({ message, path: request.url, method: request.method });
    return { payload: { ok: true, result: { message_id: 12 } } };
  });
  const site = await start(t, createServer(createApp({ ...telegramSettings, telegramApiUrl })));

  const page = await fetch(site);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Создайте свои первые сайты/);
  assert.equal((await fetch(`${site}/.env`)).status, 404);

  const response = await submit(site, valid);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(received, [{
    path: "/botstub-token/sendMessage",
    method: "POST",
    message: {
      chat_id: "12345",
      text: "Новая заявка на курс IT Room\nИмя родителя: Мария\nКонтакт родителя: @example_user\nГруппа: Детская\nФормат: Онлайн",
    },
  }]);
});

test("проверяет каждое поле и не отправляет некорректную заявку", async (t) => {
  let attempts = 0;
  const telegramApiUrl = await mockTelegram(t, () => {
    attempts++;
    return { payload: { ok: true } };
  });
  const site = await start(t, createServer(createApp({ ...telegramSettings, telegramApiUrl })));
  const response = await submit(site, { name: 42, contact: "привет", group: "toString", format: "weekends" });
  assert.equal(response.status, 400);
  assert.deepEqual(Object.keys((await response.json()).errors), ["name", "contact", "group", "format"]);

  const malformed = await fetch(`${site}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal(attempts, 0);
});

test("после отказа Telegram принимает повторную отправку", async (t) => {
  let attempts = 0;
  const telegramApiUrl = await mockTelegram(t, () => {
    attempts++;
    if (attempts === 1) return { payload: { ok: false, description: "Stub failure" } };
    if (attempts === 2) return { status: 429, payload: { ok: false } };
    return { payload: { ok: true } };
  });
  const site = await start(t, createServer(createApp({ ...telegramSettings, telegramApiUrl })));
  const input = { ...valid, contact: "+7 (900) 222-33-44", group: "women", format: "offline" };
  assert.equal((await submit(site, input)).status, 502);
  assert.equal((await submit(site, input)).status, 502);
  assert.equal((await submit(site, input)).status, 201);
  assert.equal(attempts, 3);
});

test("возвращает ошибку при отсутствии серверных настроек", async (t) => {
  const site = await start(t, createServer(createApp({ botToken: "", chatId: "" })));
  assert.equal((await submit(site, valid)).status, 503);
});
