require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log('✅ MongoDB connected'))
.catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

// === МОДЕЛИ ===
const girlSchema = new mongoose.Schema({
  id: Number, // Оставляем для совместимости со старыми данными
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
  messages: [{ type: { type: String, enum: ['user', 'bot', 'system'], required: true }, text: String, extra: mongoose.Schema.Types.Mixed, time: { type: Date, default: Date.now } }],
  waitingForOperator: { type: Boolean, default: false },
  botEnabled: { type: Boolean, default: true },
  botStep: { type: String, default: 'greet' },
  selectedGirl: mongoose.Schema.Types.Mixed,
  lastActivity: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  mainTitle: String, mainSubtitle: String, title: String, desc: String, phone: String,
  globalBotEnabled: { type: Boolean, default: true }
});

const Girl = mongoose.model('Girl', girlSchema);
const User = mongoose.model('User', userSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// === ИНИЦИАЛИЗАЦИЯ ===
async function initDefaults() {
  if (!(await User.findOne({ username: 'admin' }))) await User.create({ username: 'admin', password: 'admin123', role: 'admin' });
  if (!(await User.findOne({ username: 'operator2' }))) await User.create({ username: 'operator2', password: 'operator123', role: 'admin' });
  if (!(await Settings.findOne())) await Settings.create({ mainTitle: 'Анкеты девушек', mainSubtitle: 'Выберите идеальную компанию', title: 'BABYGIRL_LNR', phone: '', globalBotEnabled: true });
  if ((await Girl.countDocuments()) === 0) {
    await Girl.insertMany([
      { name: 'Алина', city: 'Луганск', photos: [], desc: 'Нежная и романтичная.', height: '168', weight: '52', breast: '2', age: '21', prefs: 'Романтика', services: [{name:'Встреча',price:'3000'},{name:'Свидание',price:'5000'},{name:'Ночь',price:'10000'}] },
      { name: 'Виктория', city: 'Стаханов', photos: [], desc: 'Яркая брюнетка.', height: '172', weight: '55', breast: '3', age: '23', prefs: 'Танцы', services: [{name:'Встреча',price:'3500'},{name:'Свидание',price:'6000'},{name:'Ночь',price:'12000'}] },
      { name: 'София', city: 'Первомайск', photos: [], desc: 'Студентка.', height: '165', weight: '48', breast: '2', age: '20', prefs: 'Фото', services: [{name:'Встреча',price:'2500'},{name:'Свидание',price:'4000'},{name:'Ночь',price:'8000'}] }
    ]);
  }
}
initDefaults();

// === API ===
app.get('/api/settings', async (req, res) => { try { let s = await Settings.findOne(); if(!s) s = await Settings.create({title:'BABYGIRL_LNR',globalBotEnabled:true}); res.json(s); } catch(e){res.status(500).json({error:e.message})} });
app.put('/api/settings', async (req, res) => { try { let s = await Settings.findOne(); if(s) Object.assign(s, req.body), await s.save(); else s = await Settings.create(req.body); res.json({success:true}); } catch(e){res.status(500).json({error:e.message})} });
app.get('/api/girls', async (req, res) => { try { res.json(await Girl.find().sort({createdAt:-1})); } catch(e){res.status(500).json({error:e.message})} });
app.post('/api/auth', async (req, res) => { try { const u = await User.findOne(req.body); if(!u) return res.status(401).json({success:false,message:'Неверный логин или пароль'}); res.json({success:true,user:{username:u.username,role:u.role}}); } catch(e){res.status(500).json({error:e.message})} });
app.post('/api/register', async (req, res) => { try { if(!req.body.username||!req.body.password) return res.status(400).json({success:false,message:'Заполните поля'}); if(await User.findOne({username:req.body.username})) return res.status(400).json({success:false,message:'Никнейм занят'}); const u = await User.create({username:req.body.username,password:req.body.password,role:'client'}); res.json({success:true,user:{username:u.username,role:u.role}}); } catch(e){res.status(500).json({error:e.message})} });

// ✅ ИСПРАВЛЕННЫЙ БЫСТРЫЙ ЗАКАЗ (РАБОТАЕТ С _id И id)
app.post('/api/chat/init', async (req, res) => {
  try {
    const { username, girlId } = req.body;
    if (!username || !girlId) return res.status(400).json({ error: 'Missing data' });
    
    // Ищем по _id (новые анкеты) или по id (старые демо)
    let girl = await Girl.findById(girlId);
    if (!girl) girl = await Girl.findOne({ id: parseInt(girlId) });
    if (!girl) return res.status(404).json({ error: 'Girl not found' });

    let chat = await Chat.findOne({ userId: username });
    if (!chat) {
      chat = await Chat.create({ userId: username, messages: [], waitingForOperator: false, botEnabled: true, botStep: 'girl_selected', selectedGirl: girl });
    } else {
      chat.messages = []; chat.selectedGirl = girl; chat.botStep = 'girl_selected'; chat.waitingForOperator = false; await chat.save();
    }

    chat.messages.push({ type: 'bot', text: 'Здравствуйте! 👋 Вы выбрали:', time: new Date() });
    chat.messages.push({ type: 'bot', text: '', extra: { type: 'profile', girl: girl }, time: new Date() });
    chat.messages.push({ type: 'bot', text: '💰 Оплата девушке в руки\nНажмите на услугу:', extra: { type: 'services', girl: girl }, time: new Date() });
    
    await chat.save();
    res.json({ success: true, messages: chat.messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chat/send', async (req, res) => {
  try {
    const { username, text } = req.body;
    if (!username || !text) return res.status(400).json({ error: 'Error' });
    let chat = await Chat.findOne({ userId: username });
    if (!chat) chat = await Chat.create({ userId: username, messages: [], botEnabled: true, botStep: 'greet' });
    chat.messages.push({ type: 'user', text, time: new Date() }); chat.lastActivity = new Date();
    let botReply = null;
    const settings = await Settings.findOne();
    const isBotActive = settings?.globalBotEnabled !== false && chat.botEnabled;
    const CITIES = ['луганск', 'стаханов', 'первомайск'];
    if (isBotActive && !chat.waitingForOperator) {
      const lower = text.toLowerCase();
      if (chat.botStep === 'greet' || chat.botStep === 'asking_city') {
        const fc = CITIES.find(c => lower.includes(c));
        if (fc) { const cg = await Girl.find({ city: new RegExp(fc, 'i') }); if(cg.length>0){ chat.botStep='picking_girl'; botReply={text:`Отлично! В ${fc.charAt(0).toUpperCase()+fc.slice(1)} есть ${cg.length} анкет:`,type:'girls_list',girls:cg}; } else { botReply={text:`В городе ${fc} пока нет анкет.`,type:'text'}; } }
        else { botReply={text:'Напишите город (Луганск, Стаханов или Первомайск).',type:'text'}; chat.botStep='asking_city'; }
      } else if (chat.botStep === 'picking_girl') {
        const fg = await Girl.findOne({ name: new RegExp(lower, 'i') });
        if (fg) { chat.selectedGirl = fg; chat.botStep = 'girl_selected'; botReply = { text: '💰 Оплата в руки\nВыберите услугу:', type: 'services', girl: fg }; }
        else { botReply = { text: 'Напишите имя девушки.', type: 'text' }; }
      } else if (chat.botStep === 'girl_selected' && chat.selectedGirl) {
        const fs = chat.selectedGirl.services.find(s => lower.includes(s.name.toLowerCase()));
        if (fs) { botReply = { text: `✅ Вы выбрали: ${fs.name} — ${fs.price}₽\nЗаявка в обработке.`, type: 'processing' }; chat.waitingForOperator = true; chat.botStep = 'waiting'; }
        else { botReply = { text: 'Напишите услугу.', type: 'text' }; }
      }
    }
    if (botReply) chat.messages.push({ type: 'bot', text: botReply.text, extra: botReply, time: new Date() });
    await chat.save();
    res.json({ success: true, reply: botReply });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/chat/:username', async (req, res) => { try { const c = await Chat.findOne({ userId: req.params.username }); res.json({ messages: c?.messages || [] }); } catch(e){res.status(500).json({error:e.message})} });
app.get('/api/admin/chats', async (req, res) => { try { res.json(await Chat.find().sort({lastActivity:-1})); } catch(e){res.status(500).json({error:e.message})} });
app.post('/api/admin/chat/reply', async (req, res) => { try { const { userId, text } = req.body; const chat = await Chat.findOne({ userId }); if (!chat) return res.status(404).json({ error: 'Not found' }); if (chat.messages.length > 0 && chat.messages[chat.messages.length - 1].extra?.type === 'processing') chat.messages.pop(); chat.messages.push({ type: 'bot', text: `[Оператор] ${text}`, time: new Date() }); chat.waitingForOperator = false; chat.botStep = 'greet'; chat.selectedGirl = null; chat.botEnabled = true; await chat.save(); res.json({ success: true }); } catch(e){res.status(500).json({error:e.message})} });
app.put('/api/admin/chat/:userId/clear', async (req, res) => { try { await Chat.findOneAndUpdate({ userId: req.params.userId }, { messages: [], waitingForOperator: false, botStep: 'greet' }); res.json({ success: true }); } catch(e){res.status(500).json({error:e.message})} });
app.delete('/api/admin/chat/:userId', async (req, res) => { try { await Chat.findOneAndDelete({ userId: req.params.userId }); res.json({ success: true }); } catch(e){res.status(500).json({error:e.message})} });
app.post('/api/admin/girls', async (req, res) => { try { const { action, girl } = req.body; if (action === 'add') res.json({ success: true, girl: await Girl.create(girl) }); else if (action === 'update') res.json({ success: true, girl: await Girl.findByIdAndUpdate(girl._id, girl, { new: true }) }); else if (action === 'delete') { await Girl.findByIdAndDelete(girl._id); res.json({ success: true }); } } catch(e){res.status(500).json({error:e.message})} });

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
