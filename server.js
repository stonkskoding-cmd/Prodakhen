// Инициализация данных
async function initDefaults() {
    // 🧹 ОЧИСТКА БАЗЫ - УБЕРИТЕ // СЛЕДУЮЩИХ 3 СТРОК ЧТОБЫ ОЧИСТИТЬ
    // await User.deleteMany({});
    // await Chat.deleteMany({});
    // console.log('🗑️ База очищена!');
    
    // 1. Создаем admin
    if (!(await User.findOne({ username: 'admin' }))) {
        await User.create({ username: 'admin', password: 'Admin@1562', role: 'admin' });
        console.log('✅ Создан: admin / Admin@1562');
    }
    
    // 2. Создаем operator2 (ЭТОГО НЕ БЫЛО В ВАШЕМ КОДЕ!)
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

    // 4. Анкеты
    if ((await Girl.countDocuments()) === 0) {
        await Girl.insertMany([
            { name: 'Алина', city: 'Луганск', photos: [], desc: 'Нежная и романтичная девушка.', height: '168', weight: '52', breast: '2', age: '21', prefs: 'Романтика', services: [{ name: 'Встреча', price: '3000' }, { name: 'Свидание', price: '5000' }, { name: 'Ночь', price: '10000' }] },
            { name: 'Виктория', city: 'Стаханов', photos: [], desc: 'Яркая и страстная брюнетка.', height: '172', weight: '55', breast: '3', age: '23', prefs: 'Танцы', services: [{ name: 'Встреча', price: '3500' }, { name: 'Свидание', price: '6000' }, { name: 'Ночь', price: '12000' }] },
            { name: 'София', city: 'Первомайск', photos: [], desc: 'Студентка, модельная внешность.', height: '165', weight: '48', breast: '2', age: '20', prefs: 'Фото', services: [{ name: 'Встреча', price: '2500' }, { name: 'Свидание', price: '4000' }, { name: 'Ночь', price: '8000' }] }
        ]);
    }
}
