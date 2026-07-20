const express = require("express");
const path = require("path");
const session = require("express-session");
const db = require("./db");
const bcrypt = require("bcrypt");
const axios = require("axios");
const cheerio = require("cheerio");
const validator = require("validator");

function clean(v){
  if(!v) return null;
  return validator.escape(String(v)).trim();
}

const app = express();

console.log("🚀 SERVER STARTING...");

app.set("trust proxy", 1);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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
   TRUCKSBOOK API
========================= */
app.get("/api/trucksbook", async (req, res) => {
  try {
    const { data } = await axios.get(
      "https://trucksbook.eu/components/app/company/game_overview.php?company=219466&game=1&stat=0"
    );

    const $ = cheerio.load(data);
    const text = $("body").text().replace(/\s+/g, " ");

    const extract = (regex) => text.match(regex)?.[1]?.trim() || "0";

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
  status TEXT,
  server TEXT,
  cargo TEXT,
  distance TEXT,
  meeting TEXT,
  "meetingTime" TEXT,
  dlc TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'driver',
  name TEXT,
  discord TEXT,
  truck_name TEXT,
  avatar TEXT,
  status TEXT DEFAULT 'actif',
  created_at TIMESTAMP DEFAULT NOW()
);
`);

/* =========================
   AUTH
========================= */
function adminOnly(req,res,next){

if(req.session?.user?.role === "admin"){
return next();
}

return res.status(403).json({
error:"forbidden"
});

}

function driverOnly(req,res,next){

if(
req.session?.user?.role === "driver" ||
req.session?.user?.role === "admin"
){

return next();

}


return res.redirect("/login-conducteur.html");

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

    req.session.user = user;

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

/* =========================
   ADMIN PAGE
========================= */
app.get("/admin", adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "private", "admin.html"));
});

/* =========================
   CREATE DRIVER
========================= */

app.post("/api/users", adminOnly, async(req,res)=>{

try{

const {
username,
password,
name,
discord,
truck_name
}=req.body;


const hash = await bcrypt.hash(password,10);


await db.query(
`
INSERT INTO users
(
username,
password,
role,
name,
discord,
truck_name,
status
)

VALUES
($1,$2,'driver',$3,$4,$5,'actif')
`,
[
username,
hash,
name,
discord,
truck_name
]
);


res.json({
success:true
});


}

catch(err){

console.error("CREATE DRIVER ERROR:",err);

res.status(500).json({
success:false
});

}


});

/* =========================
   GET DRIVERS
========================= */

app.get("/api/users", adminOnly, async(req,res)=>{

try{

const result = await db.query(
`
SELECT 
id,
username,
name,
discord,
truck_name,
status
FROM users
WHERE role='driver'
ORDER BY id DESC
`
);


res.json(result.rows);


}

catch(err){

console.error("GET DRIVERS ERROR:",err);

res.json([]);

}

});

/* =========================
   CONDUCTEUR PAGE
========================= */

app.get("/conducteur", driverOnly, (req,res)=>{

res.sendFile(
path.join(__dirname,"public","conducteur.html")
);

});

/* =========================
   CONVOYS GET (IMPORTANT FIX)
========================= */
app.get("/api/convoys", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM convoys ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET CONVOYS ERROR:", err);
    res.json([]);
  }
});

/* =========================
   CONVOYS POST
========================= */
app.post("/api/convoys", adminOnly, async (req, res) => {
  try {
    const convoys = req.body;

    await db.query("DELETE FROM convoys");

    for (const c of convoys) {
  await db.query(
    `INSERT INTO convoys (
      title, start, "end", time, date, status,
      server, cargo, distance, meeting, "meetingTime", dlc, description
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      clean(c.title),
      clean(c.start),
      clean(c.end),
      clean(c.time),
      clean(c.date),
      c.status || "ouvert",

      clean(c.server),
      clean(c.cargo),
      clean(c.distance),
      clean(c.meeting),
      clean(c.meetingTime),
      clean(c.dlc),
      clean(c.description)
    ]
  );
}

    res.json({ success: true });

  } catch (err) {
    console.error("POST CONVOY ERROR:", err);
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
    res.json([]);
  }
});

app.post("/api/team", adminOnly, async (req, res) => {
  try {
    const team = Array.isArray(req.body) ? req.body : [];

    await db.query("DELETE FROM team");

    for (const m of team) {
      if (!m.name || !m.role) continue;

      await db.query(
        "INSERT INTO team (name, role, avatar) VALUES ($1,$2,$3)",
        [m.name, m.role, m.avatar || null]
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
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

    console.log("Admin créé");
  }
}

/* =========================
   START SERVER
========================= */
async function start() {
  await createAdmin();

  const port = process.env.PORT || 3000;
  app.listen(port, () =>
    console.log("✅ SERVER RUNNING ON PORT", port)
  );
}

start();
