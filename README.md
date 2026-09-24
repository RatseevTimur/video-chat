<p align="center">
  <a href="https://github.com/whiteSHADOW1234/TypingSVG">
    <img src="https://typingsvg.vercel.app/api/svg?backgroundOpacity=0&border=false&cursorStyle=underline&lines=%5B%7B%22text%22%3A%22Family+Chat%22%2C%22color%22%3A%22%2318e26f%22%2C%22typingSpeed%22%3A0.1%2C%22deleteSpeed%22%3A0.05%7D%2C%7B%22text%22%3A%22to+stay+in+touch+with+loved+ones+without+limits%22%2C%22color%22%3A%22%2316d813%22%2C%22fontSize%22%3A12%2C%22typingSpeed%22%3A0.05%2C%22deleteSpeed%22%3A0.03333333333333333%7D%5D" alt="Family Chat" />
  </a>
</p>

[![RU](https://img.shields.io/badge/docs-Русский-1a73e8)](./docs/index.html#ru)
[![EN](https://img.shields.io/badge/docs-English-1e8e3e)](./docs/index.html#en)
[![Censorship](https://img.shields.io/badge/docs-Блокировки%20%2F%20Censorship-f9ab00)](./docs/index.html#blocks)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

<p align="center">
  <img src="./docs/assets/hero-banner.png" alt="Family Chat" width="920" />
</p>

**RU:** Свободный режим: создали ссылку → любой по ней в созвоне (без почты). Опционально `/family` с OTP.  
**EN:** Free mode: create a link → anyone joins the call (no email). Optional `/family` with OTP.

`./start.sh` **сам ставит Node.js 20**, если его нет (Ubuntu/Debian).

> 🎛️ **[Интерактивная инструкция RU / EN / Блокировки](./docs/index.html)**  
> Enable GitHub Pages → folder `/docs` for clickable tabs.

---

## Картинка: 3 шага / 3 steps

<p align="center">
  <img src="./docs/assets/install-flow.png" alt="Clone → Start → Share" width="920" />
</p>

| | RU | EN |
|---|----|----|
| 1 | Скачиваете репо | Download the repo |
| 2 | `./start.sh` (Node ставится сам) | `./start.sh` (auto-installs Node) |
| 3 | Открываете ссылку из терминала → «Создать видеозвонок» → шлёте ссылку комнаты | Open the terminal link → Create video call → share the room URL |

<p align="center">
  <img src="./docs/assets/architecture.svg" alt="Architecture" width="920" />
</p>

---

## Как это работает / How it works

### Случайная ссылка с нормальным сертификатом?
**Да** — через Cloudflare Quick Tunnel (включается в `./start.sh`):

```text
→ https://random-words.trycloudflare.com/?invite=XXXX
```

Это настоящий HTTPS (замок без предупреждения). Домен вам не нужен.  
IP `https://1.2.3.4:4000` остаётся с self-signed (нужно «Принять риск»).

Отключить туннель: `TUNNEL=0 ./start.sh`

### Два режима / Two modes

| | A — без `MAIL_URL` | A+ — `MAIL_URL` + `MAIL_STORE=0` | B — `MAIL_URL` (по умолчанию) |
|--|--------------------|----------------------------------|--------------------------------|
| Код входа | Терминал сервера | На почту | На почту |
| Сообщения | Только RAM | Только RAM | RAM + письма с шифротекстом |

```bash
# A — код в терминале, чат в памяти
./start.sh

# A+ — код на почту (лучше через server/.env, см. ниже), чат в памяти
# Gmail: пароль ПРИЛОЖЕНИЯ, не обычный пароль аккаунта
export MAIL_URL='smtps://ЛОГИН%40gmail.com:ПАРОЛЬ_ПРИЛОЖЕНИЯ@smtp.gmail.com:465'
export MAIL_STORE=0
./start.sh

# B — код на почту + почта как «БД»/уведомления
export MAIL_URL='smtps://ЛОГИН%40yandex.ru:ПАРОЛЬ_ПРИЛОЖЕНИЯ@smtp.yandex.ru:465'
./start.sh
```

### Как mama узнает про сообщение?
- **A / A+:** только если она в приложении (сокет). Иначе позовите ссылкой.
- **B:** письмо на каждое сообщение + шифротекст.

### Подтверждение почты
Всегда нужен код. Без кода входа нет.

> SSH для `git clone` **не нужен** (используйте HTTPS или ZIP).

### Вариант A — git + HTTPS

```bash
sudo apt update && sudo apt install -y git curl unzip
git clone https://github.com/RatseevTimur/video-chat.git
cd video-chat
chmod +x start.sh
./start.sh
```

### Вариант B — ZIP (если git нет / GitHub режется)

```bash
sudo apt update && sudo apt install -y curl unzip
curl -L -o chat.zip https://github.com/RatseevTimur/video-chat/archive/refs/heads/main.zip
unzip -o chat.zip
cd video-chat-main
chmod +x start.sh
./start.sh
```

### Обновить сервер с нуля (VPS) / Fresh update on VPS

Останавливает старый процесс, скачивает свежий `main`, запускает заново:

```bash
cd ~
pkill -f "node index.js" || true
pkill -f cloudflared || true
rm -rf video-chat video-chat-main vc.zip
curl -L -o vc.zip https://github.com/RatseevTimur/video-chat/archive/refs/heads/main.zip
unzip -o vc.zip && mv video-chat-main video-chat
cd video-chat && chmod +x start.sh && ./start.sh
```

В терминале должна быть ссылка вида `https://….trycloudflare.com/` (свободный режим).  
Откройте её → **Начать встречу** → **Ссылка** → отправьте родственникам.

### Почта OTP (`/family`) — креды только на сервере

**Не коммитьте** `.env` в git. Файл уже в `.gitignore`.

1. Создайте **пароль приложения** (не обычный пароль почты):  
   Google → Безопасность → 2FA → Пароли приложений.
2. На VPS:

```bash
cd ~/video-chat
nano server/.env
```

3. Вставьте (Gmail):

```bash
PORT=4000
MAIL_STORE=0
MAIL_URL='smtps://ВАШ_ЛОГИН%40gmail.com:ПАРОЛЬ_ПРИЛОЖЕНИЯ@smtp.gmail.com:465'
SMTP_FROM='ВАШ_ЛОГИН@gmail.com'
```

`@` в логине пишите как `%40`. Сохраните (`Ctrl+O`, Enter, `Ctrl+X`), перезапустите:

```bash
# Ctrl+C если start.sh уже крутится, затем:
./start.sh
```

### Почта не уходит: Connection timeout

Многие VPS **блокируют исходящие порты 465/587** (Gmail/Yandex SMTP).  
Тогда в логе: `[mail:smtp] FAILED … Connection timeout`.

Что делать:
1. Код всё равно печатается в **терминале** сервера (fallback) — войдите по нему.
2. Для реальной почты с VPS используйте провайдера с **HTTPS API** (Resend/SendGrid) или SMTP-релей на порту 2525/443 — обычный Gmail SMTP с заблокированного VPS часто не работает.
3. Проверка с сервера: `nc -vz smtp.gmail.com 465` — если timeout, порт закрыт у хостера.

Yandex вместо Gmail:

```bash
MAIL_URL='smtps://ЛОГИН%40yandex.ru:ПАРОЛЬ_ПРИЛОЖЕНИЯ@smtp.yandex.ru:465'
SMTP_FROM='ЛОГИН@yandex.ru'
MAIL_STORE=0
```

### Уже скачали ZIP и нет Node? / Already extracted, no Node?

Просто снова:

```bash
cd ~/video-chat   # или ~/video-chat-main
chmod +x start.sh
./start.sh
```

Скрипт поставит Node 20 + yarn, соберёт клиент и запустит сервер.

### Что появится в терминале / Terminal output

```text
→ https://….trycloudflare.com/
→ https://….trycloudflare.com/room/XXXX   # общая комната
→ https://….trycloudflare.com/family?invite=XXXX   # опционально, с почтой
```

Self-signed `https://IP:4000` — браузер предупредит: **Дополнительно → Перейти на сайт**.  
По `http://` Chrome ломает камеру и шифрование.

Share the **https://** link. Accept the certificate warning (Advanced → Proceed).

Порт (если ufw включён, `start.sh` попробует открыть сам):

```bash
sudo ufw allow 4000/tcp && sudo ufw reload
```

Запуск в фоне:

```bash
nohup ./start.sh > chat.log 2>&1 &
tail -f chat.log
```

---

<details>
<summary><strong>🇷🇺 Подробно на русском</strong></summary>

### Что внутри
- Вход по **invite-ссылке** (печатает терминал)
- Почта — только ID (пароль Яндекса не нужен)
- E2E в браузере; на сервере шифротекст **в RAM**
- Видео WebRTC + маски
- Гостевые комнаты: `/guest`

### Если NodeSource недоступен с VPS
Поставьте Node вручную, потом `./start.sh`:

```bash
sudo apt update
sudo apt install -y nodejs npm
# желательно Node 18+
node -v
./start.sh
```

### Закрепить invite после ребута

```bash
INVITE=my-family-secret ./start.sh
```

</details>

<details>
<summary><strong>🇬🇧 Details in English</strong></summary>

- Sign-in via **invite link** printed by the server
- Email is identity only — no mailbox password
- E2E in the browser; server keeps ciphertext in **RAM**
- `./start.sh` auto-installs Node 20 on Ubuntu/Debian
- Keep invite private; public source code does not decrypt messages

```bash
INVITE=my-family-secret ./start.sh
```

</details>

<details>
<summary><strong>🛡 Блокировки / Censorship</strong></summary>

| Tip | RU | EN |
|-----|----|----|
| Host | Российский VPS | VPS your family can reach |
| No git | ZIP + `scp` | ZIP + `scp` |
| NAT | coturn на том же сервере | coturn on the same host |

</details>

---

## Dev

```bash
yarn && yarn --cwd server && yarn --cwd client
yarn dev
```

## License

MIT
