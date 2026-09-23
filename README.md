# Family Chat

[![RU](https://img.shields.io/badge/docs-Русский-1a73e8)](./docs/index.html#ru)
[![EN](https://img.shields.io/badge/docs-English-1e8e3e)](./docs/index.html#en)
[![Censorship](https://img.shields.io/badge/docs-Блокировки%20%2F%20Censorship-f9ab00)](./docs/index.html#blocks)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

<p align="center">
  <img src="./docs/assets/hero-banner.png" alt="Family Chat" width="920" />
</p>

**RU:** Свой семейный мессенджер + видеозвонки с масками. Без базы данных. Без SMTP.  
**EN:** Self-hosted family messenger + masked video calls. No database. No SMTP.

> 🎛️ **Интерактивная инструкция с вкладками RU / EN / Блокировки**  
> 🎛️ **Interactive install guide with tabs**  
> 👉 **[Открыть docs / Open docs](./docs/index.html)**  
> (на GitHub: кнопка *Raw* или включите GitHub Pages → папка `/docs`)

---

## Картинка: 3 шага / 3 steps

<p align="center">
  <img src="./docs/assets/install-flow.png" alt="Clone → Start → Share" width="920" />
</p>

| | RU | EN |
|---|----|----|
| 1 | Клонируете репо | Clone the repo |
| 2 | Запускаете `./start.sh` | Run `./start.sh` |
| 3 | Раздаёте invite-ссылку из терминала | Share the invite link from the terminal |

<p align="center">
  <img src="./docs/assets/architecture.svg" alt="Architecture" width="920" />
</p>

---

## Быстрый старт / Quick start

> SSH для `git clone` **не нужен**, если используете HTTPS.  
> SSH is **not required** when using HTTPS.

### Вариант A — есть git / Option A — with git

Скопируйте и вставьте на сервер / Copy-paste on the server:

```bash
sudo apt update
sudo apt install -y git curl unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

git clone https://github.com/RatseevTimur/video-chat.git
cd video-chat
chmod +x start.sh
./start.sh
```

### Вариант B — нет git (ZIP) / Option B — no git (ZIP)

```bash
sudo apt update
sudo apt install -y curl unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

curl -L -o chat.zip https://github.com/RatseevTimur/video-chat/archive/refs/heads/main.zip
unzip chat.zip
cd video-chat-main
chmod +x start.sh
./start.sh
```

### Что появится в терминале / Terminal output

```text
→ http://ВАШ_IP:4000/?invite=XXXX
→ http://YOUR_IP:4000/?invite=XXXX
```

Эту ссылку отправьте семье. Пароли и `.env` не нужны.  
Share this link with family. No passwords / `.env` required.

Откройте порт:

```bash
sudo ufw allow 4000/tcp
sudo ufw reload
```

---

<details>
<summary><strong>🇷🇺 Подробно на русском</strong></summary>

### Что внутри
- Вход по **invite-ссылке** с сервера (печатает `./start.sh`)
- Почта — только ваш ID (пароль Яндекса **не нужен**)
- Сообщения шифруются в браузере (E2E). На сервере — шифротекст **в RAM**
- Видеозвонки WebRTC + маски
- Гостевые комнаты: `/guest`

### Почему без базы
Нечего красть с диска. Рестарт сервера очищает чаты/сессии — это задумано.  
Ключи E2E остаются у людей в браузере.

### Письма из Яндекса без пароля?
**Нельзя.** SMTP/IMAP всегда требуют логин. Поэтому SMTP убрали: вход = invite.

### Если GitHub с сервера не открывается
Скачайте ZIP дома и залейте:

```bash
# дома
curl -L -o chat.zip https://github.com/RatseevTimur/video-chat/archive/refs/heads/main.zip
scp chat.zip root@ВАШ_СЕРВЕР:/root/

# на сервере
unzip chat.zip && cd video-chat-main && chmod +x start.sh && ./start.sh
```

### Закрепить тот же invite после ребута

```bash
INVITE=my-family-secret ./start.sh
```

</details>

<details>
<summary><strong>🇬🇧 Details in English</strong></summary>

### What's inside
- Sign-in via **invite link** printed by `./start.sh`
- Email is only an ID (**no mailbox password**)
- Messages encrypted in the browser (E2E). Server keeps ciphertext in **RAM only**
- WebRTC video + masks
- Guest rooms: `/guest`

### Why no database
Nothing valuable sits on disk. Restart clears chats/sessions by design.  
E2E keys stay on user devices.

### Can we read Yandex mail without a password?
**No.** Mail APIs always need credentials. So we don't use SMTP: access = invite link.

### If GitHub is blocked from the VPS
Download the ZIP elsewhere and upload with `scp` (see RU block above).

### Keep the same invite after reboot

```bash
INVITE=my-family-secret ./start.sh
```

</details>

<details>
<summary><strong>🛡 Блокировки / Censorship tips</strong></summary>

| Tip | RU | EN |
|-----|----|----|
| Host near family | Российский VPS | VPS your relatives can reach |
| Clone | `https://…` без SSH | HTTPS clone, no SSH key |
| GitHub blocked | ZIP + `scp` | ZIP + `scp` |
| Calls fail (NAT) | Свой TURN/coturn на том же сервере | Run coturn on the same host |
| Security | Прячьте invite и ключ из браузера, не код | Hide invite + browser key, not the code |

</details>

---

## Dev

```bash
yarn
yarn --cwd server
yarn --cwd client
yarn dev
```

Client: `http://localhost:5173` · Server: `http://localhost:4000`

---

## License

MIT · fork, self-host, share with family.
