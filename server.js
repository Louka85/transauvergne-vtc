const express = require("express");
const path = require("path");
const session = require("express-session");
const db = require("./db");
const bcrypt = require("bcrypt");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

app.set("trust proxy", 1);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =========================
   TRUCKSBOOK API (PROPRE)
========================= */
app.get("/api/trucksbook", async (req, res) => {
  try {
    const { data } = await axios.get(
      "https://trucksbook.eu/components/app/company/game_overview.php?company=219466&game=1&stat=0"
    );

    const $ = cheerio.load(data);
    const text = $("body").text().replace(/\s+/g, " ");

    const extract = (regex) =>
      text.match(regex)?.[1]?.trim() || "0";

    res.json({
      ets2: {
        distance: extract(/Distance\s*([0-9\s,.]+ ?km)/i),
        deliveries: extract(/livraisons\s*([0-9]+)/i)
      }
    });

  } catch (err) {
    console.error(err);
    res.json({
      ets2: { distance: "0 km", deliveries: "0" }
    });
  }
});

/* =========================
   SESSION
========================= */
app.use(
  session({
    secret: "vtc_secret_key_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "none"
    }
  })
);

/* =========================
   STATIC
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   DB INIT
========================= */
db.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT
);

CREATE TABLE IF NOT EXISTS convoys (
  id SERIAL PRIMARY KEY,
  title TEXT,
  start TEXT,
  "end" TEXT,
  time TEXT,
  date TEXT,
  status TEXT
);

CREATE TABLE IF NOT EXISTS team (
  id SERIAL PRIMARY KEY,
  name TEXT,
  role TEXT,
  avatar TEXT
);
`);

/* =========================
   AUTH
========================= */
function auth(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: "not logged in" });
}

function adminOnly(req, res, next) {
  if (req.session?.user?.username?.toLowerCase() === "admin") return next();
  return res.status(403).json({ error: "forbidden" });
}

/* =========================
   LOGIN
========================= */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE username=$1",
      [username]
    );

    if (!result.rows.length) return res.json({ success: false });

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password);

    if (!ok) return res.json({ success: false });

    req.session.user = {
      id: user.id,
      username: user.username
    };

    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

/* =========================
   REGISTER
========================= */
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users (username, password) VALUES ($1,$2)",
      [username, hash]
    );

    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

/* =========================
   ME
========================= */
app.get("/api/me", (req, res) => {
  if (!req.session?.user) return res.json({ logged: false });

  res.json({
    logged: true,
    user: req.session.user.username
  });
});

/* =========================
   LOGOUT
========================= */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* =========================
   ADMIN
========================= */
app.get("/admin", adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "private", "admin.html"));
});

/* =========================
   CONVOYS
========================= */
app.post("/api/convoys", adminOnly, async (req, res) => {
  try {
    const convoys = req.body;

    await db.query("DELETE FROM convoys");

    for (const c of convoys) {
      await db.query(
        `INSERT INTO convoys
        (title, start, "end", time, date, status,
         server, cargo, distance, meeting, "meetingTime", dlc, description)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          c.title,
          c.start,
          c.end,
          c.time,
          c.date,
          c.status || "ouvert",
          c.server || null,
          c.cargo || null,
          c.distance || null,
          c.meeting || null,
          c.meetingTime || null,
          c.dlc || null,
          c.description || null
        ]
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error("CONVOY ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   TEAM
========================= */
app.get("/api/team", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM team ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/team", adminOnly, async (req, res) => {
  try {
    const team = Array.isArray(req.body) ? req.body : req.body.team;

    if (!Array.isArray(team)) {
      return res.status(400).json({ success: false });
    }

    await db.query("DELETE FROM team");

    for (const m of team) {
      if (!m?.name || !m?.role) continue;

      await db.query(
        "INSERT INTO team (name, role, avatar) VALUES ($1,$2,$3)",
        [m.name, m.role, m.avatar || null]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================
   ADMIN AUTO
========================= */
async function createAdmin() {
  const r = await db.query(
    "SELECT * FROM users WHERE username=$1",
    ["Admin"]
  );

  if (!r.rows.length) {
    const hash = await bcrypt.hash("Trans'Auvergne", 10);

    await db.query(
      "INSERT INTO users (username, password) VALUES ($1,$2)",
      ["Admin", hash]
    );

    console.log("Admin créé : Admin / Trans'Auvergne");
  }
}

/* =========================
   START
========================= */
async function start() {
  await createAdmin();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("Server running"));
}

start();
