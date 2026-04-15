require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// ===== SECURITY & ANONYMITY =====
// Не сохраняем IP адреса
app.set('trust proxy', 1);

// Rate limiting (защита от спама)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Middleware
app.use(cors({
  origin: '*', // Для анонимности не ограничиваем домен
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Для фото base64
app.use(express.static('public'));

// ===== MONGODB CONNECTION =====
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected anonymously'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// ===== DATABASE MODELS =====

// Girl Model
const girlSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  photos: [String], // Base64 strings
  desc: String,
  height: String,
  weight: String,
  breast: String,
  age: String,
  prefs: String,
  services: [{
    name: String,
    price: String
  }],
  createdAt: { type: Date, default: Date.now }
});

// User Model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'client'], default: 'client' },
  createdAt: { type: Date, default: Date.now }
});

// Chat Model
const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true },
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

// Settings Model (singleton)
const settingsSchema = new mongoose.Schema({
  title: { type: String, default: 'BABYGIRL_LNR' },
  desc: String,
  phone: String,
  globalBotEnabled: { type: Boolean, default: true }
});

const Girl = mongoose.model('Girl', girlSchema);
const User = mongoose.model('User', userSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// ===== INIT DEFAULT DATA =====
async function initDefaults() {
  // Create default admin
  const adminExists = await User.findOne({ username: 'admin' });
  if (!adminExists) {
    await User.create({
      username: 'admin',
      password: 'admin123', // Смени пароль после первого входа!
      role: 'admin'
    });
    console.log('✅ Default admin created: admin/admin123');
  }

  // Create default settings
  const settingsExist = await Settings.findOne();
  if (!settingsExist) {
    await Settings.create({
      title: 'BABYGIRL_LNR',
      desc: '',
      phone: '',
      globalBotEnabled: true
    });
  }

  // Create default girls if none exist
  const girlsCount = await Girl.countDocuments();
  if (girlsCount === 0) {
    const defaultGirls = [
      {
        name: 'Алина',
        city: 'Луганск',
        photos: [],
        desc: 'Нежная и романтичная девушка, люблю долгие прогулки и уютные вечера.',
        height: '168',
        weight: '52',
        breast: '2',
        age: '21',
        prefs: 'Романтика, путешествия, кино',
        services: [
          { name: 'Встреча', price: '3000' },
          { name: 'Свидание', price: '5000' },
          { name: 'Ночь', price: '10000' }
        ]
      },
      {
        name: 'Виктория',
        city: 'Стаханов',
        photos: [],
        desc: 'Яркая и страстная брюнетка с идеальной фигурой.',
        height: '172',
        weight: '55',
        breast: '3',
        age: '23',
        prefs: 'Танцы, музыка',
        services: [
          { name: 'Встреча', price: '3500' },
          { name: 'Свидание', price: '6000' },
          { name: 'Ночь', price: '12000' }
        ]
      },
      {
        name: 'София',
        city: 'Первомайск',
        photos: [],
        desc: 'Студентка, модельная внешность.',
        height: '165',
        weight: '48',
        breast: '2',
        age: '20',
        prefs: 'Фотография, литература',
        services: [
          { name: 'Встреча', price: '2500' },
          { name: 'Свидание', price: '4000' },
          { name: 'Ночь', price: '8000' }
        ]
      }
    ];
    await Girl.insertMany(defaultGirls);
    console.log('✅ Default girls created');
  }
}

initDefaults();

// ===== API ROUTES =====

// Get all girls
app.get('/api/girls', async (req, res) => {
  try {
    const girls = await Girl.find().sort({ createdAt: -1 });
    res.json(girls);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Settings.findOne();
    res.json(settings || { title: 'BABYGIRL_LNR', phone: '', globalBotEnabled: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Auth
app.post('/api/auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
    }
    
    res.json({ 
      success: true, 
      user: { username: user.username, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Заполните все поля' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ success: false, message: 'Никнейм минимум 3 символа' });
    }
    
    if (password.length < 4) {
      return res.status(400).json({ success: false, message: 'Пароль минимум 4 символа' });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Никнейм занят' });
    }
    
    const user = await User.create({ username, password, role: 'client' });
    
    res.json({ 
      success: true, 
      user: { username: user.username, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Chat - send message
app.post('/api/chat/send', async (req, res) => {
  try {
    const { username, text } = req.body;
    
    let chat = await Chat.findOne({ userId: username });
    
    if (!chat) {
      chat = await Chat.create({
        userId: username,
        messages: [],
        waitingForOperator: false,
        botEnabled: true,
        botStep: 'greet'
      });
    }
    
    chat.messages.push({
      type: 'user',
      text,
      time: new Date()
    });
    
    chat.lastActivity = new Date();
    
    // Bot logic
    let botReply = null;
    const settings = await Settings.findOne();
    const isBotActive = settings?.globalBotEnabled !== false && chat.botEnabled;
    
    if (isBotActive && !chat.waitingForOperator) {
      const lower = text.toLowerCase();
      const CITIES = ['луганск', 'стаханов', 'первомайск'];
      
      if (chat.botStep === 'greet' || chat.botStep === 'asking_city') {
        const foundCity = CITIES.find(c => lower.includes(c));
        
        if (foundCity) {
          const cityGirls = await Girl.find({ city: new RegExp(foundCity, 'i') });
          
          if (cityGirls.length > 0) {
            chat.botStep = 'picking_girl';
            botReply = {
              text: `Отлично! В ${foundCity.charAt(0).toUpperCase() + foundCity.slice(1)} есть ${cityGirls.length} анкет. Вот доступные:`,
              type: 'girls_list',
              data: cityGirls
            };
          } else {
            botReply = { text: `В городе ${foundCity} пока нет анкет. Попробуйте другой.`, type: 'text' };
            chat.botStep = 'asking_city';
          }
        } else {
          botReply = { text: 'Уточните ваш город (Луганск, Стаханов или Первомайск).', type: 'text' };
          chat.botStep = 'asking_city';
        }
      }
      else if (chat.botStep === 'picking_girl') {
        const foundGirl = await Girl.findOne({ name: new RegExp(lower, 'i') });
        
        if (foundGirl) {
          chat.selectedGirl = foundGirl;
          chat.botStep = 'girl_selected';
          botReply = {
            text: '💰 Оплата девушке в руки\n\nНажмите на выбранную услугу:',
            type: 'services',
            data: foundGirl
          };
        } else {
          botReply = { text: 'Напишите имя девушки из списка.', type: 'text' };
        }
      }
      else if (chat.botStep === 'girl_selected' && chat.selectedGirl) {
        const foundService = chat.selectedGirl.services.find(s => 
          lower.includes(s.name.toLowerCase())
        );
        
        if (foundService) {
          botReply = {
            text: `✅ Вы выбрали: ${foundService.name} — ${foundService.price}₴\nЗаявка в обработке. Оператор скоро свяжется.`,
            type: 'processing'
          };
          chat.waitingForOperator = true;
          chat.botStep = 'waiting';
        } else {
          botReply = { text: 'Напишите название услуги (например: Встреча).', type: 'text' };
        }
      }
      else if (chat.botStep === 'waiting') {
        botReply = { text: 'Заявка в обработке, ожидайте оператора.', type: 'text' };
      }
    } else if (!isBotActive && !chat.waitingForOperator) {
      chat.waitingForOperator = true;
    }
    
    if (botReply) {
      chat.messages.push({
        type: 'bot',
        text: botReply.text,
        extra: botReply,
        time: new Date()
      });
    }
    
    await chat.save();
    res.json({ success: true, reply: botReply });
    
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get chat messages
app.get('/api/chat/:username', async (req, res) => {
  try {
    const chat = await Chat.findOne({ userId: req.params.username });
    res.json({ messages: chat?.messages || [] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Get all chats
app.get('/api/admin/chats', async (req, res) => {
  try {
    const chats = await Chat.find().sort({ lastActivity: -1 });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Reply to chat
app.post('/api/admin/chat/reply', async (req, res) => {
  try {
    const { userId, text } = req.body;
    
    const chat = await Chat.findOne({ userId });
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    chat.messages.push({
      type: 'bot',
      text: `[Оператор] ${text}`,
      time: new Date()
    });
    
    chat.waitingForOperator = false;
    await chat.save();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Clear chat
app.delete('/api/admin/chat/:userId', async (req, res) => {
  try {
    await Chat.findOneAndDelete({ userId: req.params.userId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Toggle bot
app.patch('/api/admin/chat/:userId/toggle-bot', async (req, res) => {
  try {
    const { enabled } = req.body;
    const chat = await Chat.findOne({ userId: req.params.userId });
    
    if (chat) {
      chat.botEnabled = enabled;
      await chat.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Girls CRUD
app.post('/api/admin/girls', async (req, res) => {
  try {
    const { action, girl } = req.body;
    
    if (action === 'add') {
      const newGirl = await Girl.create(girl);
      res.json({ success: true, girl: newGirl });
    }
    else if (action === 'update') {
      const updatedGirl = await Girl.findByIdAndUpdate(girl._id, girl, { new: true });
      res.json({ success: true, girl: updatedGirl });
    }
    else if (action === 'delete') {
      await Girl.findByIdAndDelete(girl._id);
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Update settings
app.put('/api/admin/settings', async (req, res) => {
  try {
    const { title, desc, phone, globalBotEnabled } = req.body;
    
    let settings = await Settings.findOne();
    
    if (settings) {
      settings.title = title;
      settings.desc = desc;
      settings.phone = phone;
      settings.globalBotEnabled = globalBotEnabled;
      await settings.save();
    } else {
      settings = await Settings.create({ title, desc, phone, globalBotEnabled });
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running anonymously on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
});