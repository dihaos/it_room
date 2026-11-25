# IT Room

Одностраничный сайт записи на двухмесячный курс по фронтенд-разработке. При локальном запуске Express принимает заявки через `POST /api/applications`. На REG.RU тот же лендинг использует PHP-обработчик.

## Локальный запуск

Понадобится Node.js 22.13 или новее.

```sh
npm ci
cp .env.example .env
npm start
```

Откройте [http://localhost:3000](http://localhost:3000). Пока `.env` пуст, страницу и валидацию формы можно проверить, а при отправке заполненной заявки форма покажет ошибку и сохранит данные. Порт можно задать через `PORT`.

## Telegram-бот

1. Откройте [@BotFather](https://t.me/BotFather), выполните `/newbot` и запишите полученный токен в `TELEGRAM_BOT_TOKEN` в файле `.env`.
2. Откройте личный чат с новым ботом и отправьте `/start`. Для заявок в группе добавьте бота в группу и отправьте там команду `/start@имя_бота`.
3. Сразу после команды получите обновления методом [getUpdates](https://core.telegram.org/bots/api#getupdates) и скопируйте значение `message.chat.id` в `TELEGRAM_CHAT_ID`. Сохраните знак минус, если он есть. Для нового бота без webhook можно выполнить команду из каталога проекта.

   ```sh
   node --env-file=.env --input-type=module -e '
     const token = process.env.TELEGRAM_BOT_TOKEN;
     const response = await fetch("https://api.telegram.org/bot" + token + "/getUpdates");
     const data = await response.json();
     if (!data.ok) throw new Error(data.description);
     console.table(data.result.flatMap(({ message }) => message ? [{
       chat_id: message.chat.id, type: message.chat.type,
       chat: message.chat.title ?? message.chat.first_name
     }] : []));
   '
   ```

4. Перезапустите сервер и отправьте пробную заявку. Проверьте, что в нужном чате появились имя, контакт, группа и формат. Для детской группы бот подписывает имя и контакт как данные родителя.

Файл `.env` используется только локальным Express-сервером и исключён из репозитория.

## Перед публикацией

Заполните публичные данные в [public/config.js](public/config.js).

| Поля | Значение |
| --- | --- |
| `startMonth` | Месяц и год старта, например «март 2027». Если поле пустое, на странице отображается «Дата старта уточняется». |
| `city`, `address` | Город и адрес занятий офлайн. |
| `schedule` | Расписание занятий. |
| `teachers.men.name`, `teachers.women.name` | Имена преподавателей мужской и женской групп. |
| `teachers.men.photo`, `teachers.women.photo` | Путь к фотографии относительно `public/` (например, `./assets/teacher.webp`) или ссылка на фото. |
| `contacts.instagram`, `contacts.telegram`, `contacts.whatsapp` | Полные ссылки на аккаунты или чаты. |
| `contacts.phone` | Телефон, желательно в международном формате. |

Пустые адрес, расписание, фотографии и контакты скрыты. Пока имена не указаны, в карточках используются роли преподавателей.

## GitHub Pages

В настройках репозитория откройте **Settings → Pages**, выберите **GitHub Actions** в поле **Source**. Запустите workflow **Deploy GitHub Pages** на вкладке **Actions**. Дальнейшие обновления ветки `main` публикуются автоматически.

На GitHub Pages доступна демонстрационная версия. Можно посмотреть программу и выбрать группу, отправка заявки отключена.

## Production на REG.RU

Для обновления [itroomschool.ru](https://www.itroomschool.ru/) откройте pull request и влейте его в `main`. После пуша GitHub запускает [Deploy to REG.RU](.github/workflows/regru.yml). Он вызывает публикацию по SSH, а скрипт [deploy/regru/sync.sh](deploy/regru/sync.sh) собирает сайт из `public/` и PHP-обработчика. Ход публикации виден на вкладке Actions. SHA опубликованного коммита хранится на сервере в `~/.itroomschool-sync/revision`.

Скрипт синхронизации установлен вне каталога сайта в `~/.itroomschool-sync/sync.sh`. Если изменится сам скрипт, его установленную копию нужно обновить отдельно. В GitHub ключ хранится в секрете `REG_RU_DEPLOY_KEY`. На REG.RU этот ключ разрешает только запуск публикации из `main`. Чтобы откатить сайт, отмените проблемный коммит в `main` через `git revert`.

Для приёма заявок скопируйте [deploy/regru/telegram.example.php](deploy/regru/telegram.example.php) на сервер в `~/www/.itroomschool-telegram.php` и укажите `bot_token` и `chat_id`. Файл лежит на уровень выше корня сайта `~/www/itroomschool.ru/`. Храните его с правами `600`. После настройки отправьте пробную заявку с сайта и проверьте, что сообщение пришло в нужный чат.

## Проверка со заглушкой

```sh
npm test
```

Тесты запускают Express и локальную HTTP-заглушку Telegram. Они проверяют раздачу страницы, поля заявки и тело сообщения, отказ Telegram с повторной отправкой и запуск без настроек бота.

## Структура

- `server.js` — Express, маршрут заявок и отправка в Telegram.
- `public/index.html`, `public/styles.css`, `public/app.js` — страница, стили и логика формы.
- `public/config.js` — публичные сведения о курсе и контакты.
- `public/application-fields.js` — общие правила проверки полей для клиента и сервера.
- `test/applications.test.js` — интеграционная проверка с HTTP-заглушкой.

Горный пейзаж для демонстрационного лендинга создан встроенным ImageGen. Файл [public/assets/mountains.webp](public/assets/mountains.webp).

> Use case: photorealistic-natural. Asset type: wide full-bleed editorial hero photograph for a fictional outdoor travel landing page preview. Show majestic deep charcoal Caucasus mountain ridges with narrow streaks of spring snow, layered atmospheric haze, low dark clouds, subdued sage tones, dramatic sky and a prominent jagged peak in the right half. Scenic view from below, realistic photograph, elegant and moody outdoors magazine. Keep the left half low-contrast and naturally dark for overlaying large white HTML text. Landscape, 3:2 ratio. No people, no text, no symbols, no border, no lettering, no mockup.
