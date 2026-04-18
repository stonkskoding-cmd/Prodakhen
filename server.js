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

// CORS и JSON парсер
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Подключение к MongoDB
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
  height: String,
  weight: String,
  breast: String,
  age: String,
  prefs: String,
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
  // 🧹 ОЧИСТКА БАЗЫ (раскомментируйте ТОЛЬКО ОДИН РАЗ для сброса старых данных)
   await User.deleteMany({});
   await Chat.deleteMany({});
   console.log('🗑️ База очищена!');
  
  // 1. Главный админ
  if (!(await User.findOne({ username: 'admin' }))) {
    await User.create({ username: 'admin', password: 'Admin@1562', role: 'admin' });
    console.log('✅ Создан: admin / Admin@1562');
  }
  
  // 2. Второй оператор
  if (!(await User.findOne({ username: 'operator2' }))) {
    await User.create({ username: 'operator2', password: 'Op#2024_LNR', role: 'admin' });
    console.log('✅ Создан: operator2 / Op#2024_LNR');
  }

  // 3. Настройки
  if (!(await Settings.findOne())) {
    await Settings.create({
      mainTitle: 'Анкеты девушек',
      mainSubtitle: 'Выберите идеальную компанию для незабываемого вечера',
      title: 'BABYGIRL_LNR',
      phone: '',
      globalBotEnabled: true
    });
  }

  // 4. Демо-анкеты
  if ((await Girl.countDocuments()) === 0) {
    await Girl.insertMany([
      { name: 'Алина', city: 'Луганск', photos: [], desc: 'Нежная и романтичная девушка.', height: '168', weight: '52', breast: '2', age: '21', prefs: 'Романтика', services: [{ name: 'Встреча', price: '3000' }, { name: 'Свидание', price: '5000' }, { name: 'Ночь', price: '10000' }] },
      { name: 'Виктория', city: 'Стаханов', photos: [], desc: 'Яркая и страстная брюнетка.', height: '172', weight: '55', breast: '3', age: '23', prefs: 'Танцы', services: [{ name: 'Встреча', price: '3500' }, { name: 'Свидание', price: '6000' }, { name: 'Ночь', price: '12000' }] },
      { name: 'София', city: 'Первомайск', photos: [], desc: 'Студентка, модельная внешность.', height: '165', weight: '48', breast: '2', age: '20', prefs: 'Фото', services: [{ name: 'Встреча', price: '2500' }, { name: 'Свидание', price: '4000' }, { name: 'Ночь', price: '8000' }] }
    ]);
  }
}
initDefaults();

// === API ROUTES ===

// Настройки
app.get('/api/settings', async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({ mainTitle: 'Анкеты девушек', mainSubtitle: 'Выберите идеальную компанию для незабываемого вечера', title: 'BABYGIRL_LNR', phone: '', globalBotEnabled: true });
    res.json(s);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/settings', async (req, res) => {
  try {
    const { mainTitle, mainSubtitle, title, desc, phone } = req.body;
    let s = await Settings.findOne();
    if (s) {
      s.mainTitle = mainTitle; s.mainSubtitle = mainSubtitle; s.title = title; s.desc = desc; s.phone = phone;
      await s.save();
    } else {
      s = await Settings.create({ mainTitle, mainSubtitle, title, desc, phone, globalBotEnabled: true });
    }
    res.json({ success: true, settings: s });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Анкеты
app.get('/api/girls', async (req, res) => {
  try { res.json(await Girl.find().sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/admin/girls', async (req, res) => {
  try {
    const { action, girl } = req.body;
    if (action === 'add') { res.json({ success: true, girl: await Girl.create(girl) }); }
    else if (action === 'update') { res.json({ success: true, girl: await Girl.findByIdAndUpdate(girl._id, girl, { new: true }) }); }
    else if (action === 'delete') { await Girl.findByIdAndDelete(girl._id); res.json({ success: true }); }
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Авторизация
app.post('/api/auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
    res.json({ success: true, user: { username: user.username, role: user.role } });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Регистрация
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Заполните все поля' });
    if (username.length < 3) return res.status(400).json({ success: false, message: 'Никнейм минимум 3 символа' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Пароль минимум 6 символов' });
    if (await User.findOne({ username })) return res.status(400).json({ success: false, message: 'Никнейм занят' });
    const user = await User.create({ username, password, role: 'client' });
    res.json({ success: true, user: { username: user.username, role: user.role } });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// === ЧАТ КЛИЕНТА ===
app.post('/api/chat/send', async (req, res) => {
  try {
    const { username, text } = req.body;
    if (!username || !text) return res.status(400).json({ error: 'Username and text required' });

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
          if (cg.length > 0) {
            chat.botStep = 'picking_girl';
            botReply = { text: `Отлично! В ${fc.charAt(0).toUpperCase() + fc.slice(1)} есть ${cg.length} анкет. Вот доступные:`, type: 'girls_list', girls: cg };
          } else {
            botReply = { text: `В городе ${fc} пока нет анкет.`, type: 'text' };
            chat.botStep = 'asking_city';
          }
        } else {
          botReply = { text: 'Уточните ваш город (Луганск, Стаханов или Первомайск).', type: 'text' };
          chat.botStep = 'asking_city';
        }
      } else if (chat.botStep === 'picking_girl') {
        const fg = await Girl.findOne({ name: new RegExp(lower, 'i') });
        if (fg) {
          chat.selectedGirl = fg; chat.botStep = 'girl_selected';
          botReply = { text: '💰 Оплата девушке в руки\nНажмите на выбранную услугу:', type: 'services', girl: fg };
        } else {
          botReply = { text: 'Напишите имя девушки из списка.', type: 'text' };
        }
      } else if (chat.botStep === 'girl_selected' && chat.selectedGirl) {
        const fs = chat.selectedGirl.services.find(s => lower.includes(s.name.toLowerCase()));
        if (fs) {
          botReply = { text: `✅ Вы выбрали: ${fs.name} — ${fs.price}₽\nЗаявка в обработке.`, type: 'processing' };
          chat.waitingForOperator = true; chat.botStep = 'waiting';
        } else {
          botReply = { text: 'Напишите название услуги.', type: 'text' };
        }
      } else if (chat.botStep === 'waiting') {
        botReply = { text: 'Заявка в обработке, ожидайте оператора.', type: 'text' };
      }
    } else if (!isBotActive && !chat.waitingForOperator) {
      chat.waitingForOperator = true;
    }

    if (botReply) chat.messages.push({ type: 'bot', text: botReply.text, extra: botReply, time: new Date() });
    await chat.save();
    res.json({ success: true, reply: botReply });
  } catch (e) { console.error('Chat error:', e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/chat/:username', async (req, res) => {
  try { const c = await Chat.findOne({ userId: req.params.username }); res.json({ messages: c?.messages || [] }); } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// === ЧАТ АДМИНА ===
app.get('/api/admin/chats', async (req, res) => {
  try { res.json(await Chat.find().sort({ lastActivity: -1 })); } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Ответ оператора (удаляет "В обработке")
app.post('/api/admin/chat/reply', async (req, res) => {
  try {
    const { userId, text } = req.body;
    if (!userId || !text) return res.status(400).json({ error: 'userId and text required' });
    
    const chat = await Chat.findOne({ userId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    
    // Удаляем статус "В обработке" если он последний
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
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/chat/:userId/clear', async (req, res) => {
  try {
    await Chat.findOneAndUpdate({ userId: req.params.userId }, { messages: [], waitingForOperator: false, botStep: 'greet' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/chat/:userId', async (req, res) => {
  try {
    await Chat.findOneAndDelete({ userId: req.params.userId });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/admin/chat/:userId/toggle-bot', async (req, res) => {
  try {
    const { enabled } = req.body;
    const chat = await Chat.findOne({ userId: req.params.userId });
    if (chat) { chat.botEnabled = enabled; await chat.save(); }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Раздача фронтенда
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
