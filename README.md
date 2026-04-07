# 🛡️ Dodgy_Block: Data Survival 🕹️

**Dodgy_Block** is a high-octane, browser-based survival arcade game built with a focus on **Realtime Synchronization**, **Identity Security**, and **Anti-Cheat Integrity**. Survive the corruption, dodge the blocks, and claim your spot on the Global Daily Top 10.

<p align="center">
  <img src="./assets/images/logo.svg" alt="Dodgy Block Logo" width="200">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/Thenumane218/Dodgy-Block-by-thenumane"><img src="https://img.shields.io/github/stars/Thenumane218/Dodgy-Block-by-thenumane" alt="Stars"></a>
  <a href="https://github.com/Thenumane218/Dodgy-Block-by-thenumane"><img src="https://img.shields.io/github/forks/Thenumane218/Dodgy-Block-by-thenumane" alt="Forks"></a>
  <a href="https://github.com/Thenumane218/Dodgy-Block-by-thenumane/issues"><img src="https://img.shields.io/github/issues/Thenumane218/Dodgy-Block-by-thenumane" alt="Issues"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

---

## 📋 Table of Contents
- [Live Deployment](#-live-deployment)
- [Technical Stack](#-technical-stack)
- [Key Features](#-key-features)
- [Local Setup](#-local-setup)
- [Database Schema](#-database-schema)
- [License](#-license)

---

## 🚀 Live Deployment

**[https://dodgyblock.vercel.app/](https://dodgyblock.vercel.app/)**

---

## 🛠️ Technical Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES6+), HTML5 Canvas API, CSS3 |
| Backend-as-a-Service | [Supabase](https://supabase.com/) (PostgreSQL) |
| Realtime | WebSockets via Supabase Realtime |
| Scheduling | pg_cron (automated daily reset) |
| Hosting | Netlify / GitHub Pages |

---

## 🌟 Key Features

### 📡 Realtime Global Leaderboard
The leaderboard isn't a static list. Using **PostgreSQL Change Data Capture (CDC)**, the UI updates the instant a high score is achieved anywhere in the world — no refresh required.

### 🔐 Secure Identity Uplink
- **Diversity Validation:** Prevents bot-like "AAAAA" registrations by enforcing character diversity checks.
- **Identity Firewall:** Integrated blacklist to block prohibited terminology and impersonation (e.g. `ADMIN`, `SYSTEM`).
- **Persistent Auth:** LocalStorage keeps your Callsign and Personal Best synced across sessions.

### 🛡️ Anti-Cheat Heuristics
The engine monitors the **Score-to-Time Ratio**. If a client attempts to submit a score that is mathematically impossible based on the game's physics, the submission is automatically rejected and flagged.

### 🔄 Daily Reset & Archive Protocol
An automated **pg_cron** job runs every 24 hours at 00:00 UTC. The Top 10 are moved to a historical archive and the daily board is cleared for a fresh cycle of competition.

### 🔊 Retro Audio Engine
A custom **Web Audio API** implementation generates procedural oscillators for game events, with a persistent Mute Toggle and a "Victory Chime" for new personal records.

---

## ⚙️ Local Setup

**Prerequisites:** A modern browser (Chrome, Firefox, Edge). No build step or Node.js required.

1. **Clone the repository:**
```bash
   git clone https://github.com/Thenumane218/Dodgy-Block-by-thenumane.git
   cd Dodgy-Block-by-thenumane
```

2. **Configure your Supabase credentials:**

   Create a `config.js` file in the root folder:
```javascript
   window.SUPABASE_URL = "YOUR_SUPABASE_URL";
   window.SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```
   > You can find these in your Supabase project under **Settings → API**.

3. **Launch:**

   Open `index.html` directly in any modern browser, or use the **Live Server** extension in VS Code for hot-reloading.

---

## 🗄️ Database Schema

Run the following in your **Supabase SQL Editor** to set up the required tables:
```sql
CREATE TABLE leaderboard (
  id           UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  username     TEXT      UNIQUE NOT NULL,
  password_hash TEXT     NOT NULL,
  score        INTEGER   DEFAULT 0,
  is_verified  BOOLEAN   DEFAULT false,
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE leaderboard_archive (
  id           UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  username     TEXT      NOT NULL,
  score        INTEGER   NOT NULL,
  archived_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 📜 License

Project created by **[thenumane218](https://github.com/Thenumane218)**. Distributed under the [MIT License](LICENSE).

