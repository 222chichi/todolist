const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const session = require("express-session");

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(
  session({
    secret: "secretkey123",
    resave: false,
    saveUninitialized: false,
  }),
);

app.set("view engine", "ejs");

/* ================= CONNECT DB ================= */

mongoose
  .connect("mongodb://127.0.0.1:27017/todo_app")
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

/* ================= MODELS ================= */

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  fullName: String,
  role: { type: String, enum: ["admin", "normal"], default: "normal" },
  createdAt: { type: Date, default: Date.now },
});

const taskSchema = new mongoose.Schema({
  title: String,

  // Level 1
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // Level 3
  assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  completedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  isDone: { type: Boolean, default: false },
  doneAt: Date,

  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);

/* ================= AUTH ================= */

function isAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function isAdmin(req, res, next) {
  if (req.session.user.role !== "admin") return res.send("Không có quyền!");
  next();
}

/* ================= REGISTER ================= */

app.get("/register", (req, res) => res.render("register"));

app.post("/register", async (req, res) => {
  const { username, password, fullName, role } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  const user = new User({
    username,
    password: hashed,
    fullName,
    role: role || "normal",
  });

  await user.save();
  res.redirect("/login");
});

/* ================= LOGIN ================= */

app.get("/login", (req, res) => res.render("login"));

app.post("/login", async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user) return res.send("User not found");

  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) return res.send("Wrong password");

  req.session.user = {
    _id: user._id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };

  res.redirect("/");
});

/* ================= LOGOUT ================= */

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

/* ================= HOME (LEVEL 2 + 3) ================= */

app.get("/", isAuth, async (req, res) => {
  const tasks = await Task.find({
    assignedUsers: req.session.user._id,
  }).populate("assignedUsers completedBy");

  const done = tasks.filter((t) => t.isDone).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const users = await User.find({ role: "normal" });

  res.render("index", {
    tasks,
    percent,
    currentUser: req.session.user,
    users,
  });
});

/* ================= CREATE TASK ================= */

app.post("/tasks", isAuth, async (req, res) => {
  if (req.session.user.role === "admin") {
    const { title, assignedUsers } = req.body;

    const task = new Task({
      title,
      user: req.session.user._id,
      assignedUsers: Array.isArray(assignedUsers)
        ? assignedUsers
        : [assignedUsers],
    });

    await task.save();
  } else {
    const task = new Task({
      title: req.body.title,
      user: req.session.user._id,
      assignedUsers: [req.session.user._id],
    });

    await task.save();
  }

  res.redirect("/");
});

/* ================= COMPLETE TASK ================= */

app.post("/complete", isAuth, async (req, res) => {
  const task = await Task.findById(req.body.taskId);
  if (!task) return res.redirect("/");

  const userId = req.session.user._id.toString();

  if (!task.completedBy.includes(userId)) {
    task.completedBy.push(userId);
  }

  if (task.completedBy.length === task.assignedUsers.length) {
    task.isDone = true;
    task.doneAt = new Date();
  }

  await task.save();
  res.redirect("/");
});

/* ================= DELETE ================= */

app.post("/delete", isAuth, async (req, res) => {
  await Task.findByIdAndDelete(req.body.taskId);
  res.redirect("/");
});

/* ================= LEVEL 1 APIs ================= */

// Get all tasks
app.get("/api/tasks", async (req, res) => {
  const tasks = await Task.find().populate("user", "username fullName");
  res.json(tasks);
});

// Get task by username
app.get("/api/tasks/user/:username", async (req, res) => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) return res.json([]);
  const tasks = await Task.find({ user: user._id });
  res.json(tasks);
});

// Task today
app.get("/api/tasks/today", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const tasks = await Task.find({
    createdAt: { $gte: today, $lt: tomorrow },
  });

  res.json(tasks);
});

// Unfinished
app.get("/api/tasks/unfinished", async (req, res) => {
  const tasks = await Task.find({ isDone: false });
  res.json(tasks);
});

// User họ Nguyễn
app.get("/api/tasks/nguyen", async (req, res) => {
  const users = await User.find({ fullName: /^Nguyễn/i });
  const ids = users.map((u) => u._id);

  const tasks = await Task.find({ user: { $in: ids } });
  res.json(tasks);
});

/* ================= RUN ================= */

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
