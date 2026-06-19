const express = require("express");
const path = require("path");
const session = require("express-session");
const db = require("./db");
const bcrypt = require("bcrypt");

const app = express();

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   SESSION
========================= */
app.use(session({
  secret: "vtc_secret_key_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: "none"
  }
}));

/* =========================
   TEST DB
========================= */
app.get("/test-db", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   STATIC
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   INIT DB
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
   REGISTER
========================= */
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.json({ success: false, message: "missing fields" });

  try {
    const hash = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users (username, password) VALUES ($1,$2)",
      [username, hash]
    );

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, message: "user already exists" });
  }
});

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

    if (result.rows.length === 0)
      return res.json({ success: false });

    const user = result.rows[0];

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) return res.json({ success: false });

    req.session.user = user;

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false });
  }
});

/* =========================
   DEBUG USERS (temp)
========================= */
app.get("/debug-users", async (req, res) => {
  const result = await db.query("SELECT id, username FROM users");
  res.json(result.rows);
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
   ADMIN PAGE
========================= */
app.get("/admin", adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "private", "admin.html"));
});

/* =========================
   CONVOYS
========================= */
app.get("/api/convoys", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM convoys ORDER BY date ASC"
    );
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

app.post("/api/convoys", adminOnly, async (req, res) => {
  try {
    const convoys = req.body;

    await db.query("DELETE FROM convoys");

    for (const c of convoys) {
      await db.query(
        `INSERT INTO convoys (title, start, "end", time, date, status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [c.title, c.start, c.end, c.time, c.date, c.status || "ouvert"]
      );
    }

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* =========================
   PARTICIPATION
========================= */
app.post("/api/participate", auth, (req, res) => {
  res.json({
    success: true,
    message: `User ${req.session.user.username} registered`
  });
});

/* =========================
   CREATE ADMIN AUTO
========================= */
async function createAdmin() {
  const res = await db.query(
    "SELECT * FROM users WHERE username=$1",
    ["Admin"]
  );

  if (res.rows.length === 0) {
    const hash = await bcrypt.hash("Trans'Auvergne", 10);

    await db.query(
      "INSERT INTO users (username, password) VALUES ($1,$2)",
      ["Admin", hash]
    );

    console.log("Admin créé : Admin / Trans'Auvergne");
  }
}

/* =========================
   START CLEAN
========================= */
async function start() {
  try {
    await createAdmin();

    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log("Server running"));
  } catch (err) {
    console.error("Startup error:", err);
  }
}

start();
