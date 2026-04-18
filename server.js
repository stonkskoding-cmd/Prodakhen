require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => {
  console.error('❌ MongoDB error:', err.message);
  process.exit(1);
});

// === МОДЕЛИ ===
const girlSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  photos: [String],
  desc: String,
  height: String, weight: String, breast: String, age: String, prefs: String,
  services: [{ name: String, price: String }],
  createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'client'], default: 'client' },
  createdAt: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  messages: [{
    type: { type: String, enum: ['user', 'bot', 'system'], required: true },
    text: String,
    extra: mongoose.Schema.Types.Mixed,
    time: { type: Date, default: Date.now }
  }],
  waitingForOperator: { type: Boolean, default: false },
  botEnabled: { type: Boolean, default: true },
  botStep: { type: String, default: 'greet' },
  selectedGirl: mongoose.Schema.Types.Mixed,
  lastActivity: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  mainTitle: { type: String, default: 'Анкеты девушек' },
  mainSubtitle: { type: String, default: 'Выберите идеальную компанию для незабываемого вечера' },
  title: { type: String, default: 'BABYGIRL_LNR' },
  desc: String,
  phone: String,
  globalBotEnabled: { type: Boolean, default: true }
});

const Girl = mongoose.model('Girl', girlSchema);
const User = mongoose.model('User', userSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// Инициализация данных
async function initDefaults() {
  // 1. Главный админ
  if (!(await User.findOne({ username: 'admin' }))) {
    await User.create({ username: 'admin', password: 'Admin@1562', role: 'admin' });
  }
  // 2. Второй оператор (как вы просили)
  if (!(await User.findOne({ username: 'operator2' }))) {
    await User.create({ username: 'operator2', password: 'Op#2026_LNR', role: 'admin' });
  }
  // 3. Настройки
  if (!(await Settings.findOne())) {
    await Settings.create({
      mainTitle: 'Анкеты девушек', mainSubtitle: 'Выберите идеальную компанию для незабываемого вечера',
      title: 'BABYGIRL_LNR', phone: '', globalBotEnabled: true
    });
  }
  // 4. Демо-анкеты
  if ((await Girl.countDocuments()) === 0) {
    await Girl.insertMany([
      { name: 'Алина', city: 'Луганск', photos: [], desc: 'Нежная и романтичная.', height: '168', weight: '52', breast: '2', age: '21', services: [{name:'Встреча', price:'3000'}, {name:'Свидание', price:'5000'}, {name:'Ночь', price:'10000'}] },
      { name: 'Виктория', city: 'Стаханов', photos: [], desc: 'Яркая и страстная.', height: '172', weight: '55', breast: '3', age: '23', services: [{name:'Встреча', price:'3500'}, {name:'Свидание', price:'6000'}, {name:'Ночь', price:'12000'}] },
      { name: 'София', city: 'Первомайск', photos: [], desc: 'Студентка, модельная.', height: '165', weight: '48', breast: '2', age: '20', services: [{name:'Встреча', price:'2500'}, {name:'Свидание', price:'4000'}, {name:'Ночь', price:'8000'}] }
    ]);
  }
}
initDefaults();

// === API ROUTES ===

// Настройки
app.get('/api/settings', async (req, res) => {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({ mainTitle: 'Анкеты', mainSubtitle: 'Описание', title: 'Site', phone: '', globalBotEnabled: true });
  res.json(s);
});
app.put('/api/settings', async (req, res) => {
  await Settings.findOneAndUpdate({}, req.body, { upsert: true, new: true });
  res.json({ success: true });
});

// Анкеты
app.get('/api/girls', async (req, res) => res.json(await Girl.find().sort({ createdAt: -1 })));
app.post('/api/admin/girls', async (req, res) => {
  const { action, girl } = req.body;
  if (action === 'add') res.json(await Girl.create(girl));
  else if (action === 'update') res.json(await Girl.findByIdAndUpdate(girl._id, girl, { new: true }));
  else if (action === 'delete') await Girl.findByIdAndDelete(girl._id);
  res.json({ success: true });
});

// Авторизация
app.post('/api/auth', async (req, res) => {
  const user = await User.findOne(req.body);
  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
  res.json({ success: true, user });
});

// Регистрация (с проверкой сложных паролей)
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (username.length < 3) return res.status(400).json({ error: 'Никнейм минимум 3 символа' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  if (await User.findOne({ username })) return res.status(400).json({ error: 'Никнейм занят' });
  
  const user = await User.create({ username, password, role: 'client' });
  res.json({ success: true, user });
});

// Чат клиента
app.post('/api/chat/send', async (req, res) => {
  const { username, text } = req.body;
  let chat = await Chat.findOne({ userId: username });
  if (!chat) chat = await Chat.create({ userId: username, messages: [], waitingForOperator: false, botEnabled: true, botStep: 'greet' });

  chat.messages.push({ type: 'user', text, time: new Date() });
  chat.lastActivity = new Date();

  let botReply = null;
  const settings = await Settings.findOne();
  const isBotActive = settings?.globalBotEnabled !== false && chat.botEnabled;
  const CITIES = ['луганск', 'стаханов', 'первомайск'];

  if (isBotActive && !chat.waitingForOperator) {
    const lower = text.toLowerCase();
    if (chat.botStep === 'greet' || chat.botStep === 'asking_city') {
      const fc = CITIES.find(c => lower.includes(c));
      if (fc) {
        const cg = await Girl.find({ city: new RegExp(fc, 'i') });
        if (cg.length > 0) { chat.botStep = 'picking_girl'; botReply = { text: `В ${fc} есть анкеты.`, type: 'girls_list', girls: cg }; }
        else { botReply = { text: 'Тут пока нет анкет.' }; chat.botStep = 'asking_city'; }
      } else { botReply = { text: 'Напишите город (Луганск, Стаханов, Первомайск).' }; chat.botStep = 'asking_city'; }
    } else if (chat.botStep === 'picking_girl') {
      const fg = await Girl.findOne({ name: new RegExp(lower, 'i') });
      if (fg) { chat.selectedGirl = fg; chat.botStep = 'girl_selected'; botReply = { text: 'Выберите услугу:', type: 'services', girl: fg }; }
      else { botReply = { text: 'Напишите имя из списка.' }; }
    } else if (chat.botStep === 'girl_selected' && chat.selectedGirl) {
      const fs = chat.selectedGirl.services.find(s => lower.includes(s.name.toLowerCase()));
      if (fs) {
        botReply = { text: `✅ Вы выбрали: ${fs.name} — ${fs.price}₽\nЗаявка в обработке.`, type: 'processing' };
        chat.waitingForOperator = true; chat.botStep = 'waiting';
      } else { botReply = { text: 'Напишите название услуги.' }; }
    } else if (chat.botStep === 'waiting') {
      botReply = { text: 'Ждите оператора...' };
    }
  } else if (!isBotActive && !chat.waitingForOperator) {
    chat.waitingForOperator = true;
  }

  if (botReply) chat.messages.push({ type: 'bot', text: botReply.text, extra: botReply, time: new Date() });
  await chat.save();
  res.json({ success: true, reply: botReply });
});

app.get('/api/chat/:username', async (req, res) => {
  const c = await Chat.findOne({ userId: req.params.username });
  res.json({ messages: c ? c.messages : [] });
});

// Чат админа
app.get('/api/admin/chats', async (req, res) => res.json(await Chat.find().sort({ lastActivity: -1 })));

app.post('/api/admin/chat/reply', async (req, res) => {
  const { userId, text } = req.body;
  const chat = await Chat.findOne({ userId });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  
  // Удаляем сообщение "В обработке"
  if (chat.messages.length > 0 && chat.messages[chat.messages.length - 1].extra?.type === 'processing') {
    chat.messages.pop();
  }
  
  chat.messages.push({ type: 'bot', text: `[Оператор] ${text}`, time: new Date() });
  chat.waitingForOperator = false;
  chat.botStep = 'greet';
  chat.selectedGirl = null;
  chat.botEnabled = true;
  await chat.save();
  res.json({ success: true });
});

app.put('/api/admin/chat/:userId/clear', async (req, res) => {
  await Chat.findOneAndUpdate({ userId: req.params.userId }, { messages: [], waitingForOperator: false, botStep: 'greet' });
  res.json({ success: true });
});

app.delete('/api/admin/chat/:userId', async (req, res) => {
  await Chat.findOneAndDelete({ userId: req.params.userId });
  res.json({ success: true });
});

app.patch('/api/admin/chat/:userId/toggle-bot', async (req, res) => {
  const chat = await Chat.findOne({ userId: req.params.userId });
  if (chat) { chat.botEnabled = !chat.botEnabled; await chat.save(); }
  res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
