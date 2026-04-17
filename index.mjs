
import { Telegraf, Markup, session } from 'telegraf';
import express from 'express';
import { JSONFilePreset } from 'lowdb/node';
import fs from 'fs';
import path from 'path';

// --- CONFIG ---
const TOKEN = '7867459328:AAHR7VR3ITqvrNZi38jwezDNtrIUcBBucZA';
const ADMIN_ID = 5849412071;
const bot = new Telegraf(TOKEN);
const app = express();

// --- DATABASE INIT ---
const defaultData = { 
    users: [], 
    chats: [], 
    tournament: { active: false, prizes: [], chats: [], games: [], history: [] },
    globalSettings: { xp_values: { '777': 100, 'bar': 50, 'lemon': 30, 'grape': 20, '🎯': 40, '🏀': 40 } }
};
const db = await JSONFilePreset('db.json', defaultData);

// --- HELPERS ---
const getUser = (id, username, first_name) => {
    let user = db.data.users.find(u => u.id === id);
    if (!user) {
        user = { 
            id, username: username || first_name, xp: 0, 
            spins: { slots: 0, darts: 0, basketball: 0 }, 
            battles: { count: 0, wins: 0 }, 
            roles: ['user'], achievements: [] 
        };
        db.data.users.push(user);
    }
    return user;
};

const getChat = (id, title) => {
    let chat = db.data.chats.find(c => c.id === id);
    if (!chat) {
        chat = { 
            id, title, enabled: true, 
            settings: { 
                combos: ['777', 'bar', 'lemon', 'grape'], 
                games: ['🎰', '🎯', '🏀'] 
            } 
        };
        db.data.chats.push(chat);
    }
    return chat;
};

// --- DICE LOGIC ---
bot.on('dice', async (ctx) => {
    if (ctx.message.forward_date || ctx.message.forward_from) return; // Anti-cheat

    const { emoji, value } = ctx.message.dice;
    const user = getUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    const chat = getChat(ctx.chat.id, ctx.chat.title);

    if (!chat.enabled) return;

    let xp_earned = 0;
    let result_text = '';

    if (emoji === '🎰' && chat.settings.games.includes('🎰')) {
        const combos = { 1: '777', 22: 'bar', 43: 'lemon', 64: 'grape' };
        const combo = combos[value];
        if (combo && chat.settings.combos.includes(combo)) {
            xp_earned = db.data.globalSettings.xp_values[combo];
            result_text = `🎰 КРАСАВА! Выпало ${combo.toUpperCase()}. +${xp_earned} XP!`;
            user.spins.slots++;
        }
    } else if (emoji === '🎯' && chat.settings.games.includes('🎯')) {
        if (value === 6) { // Hit center
            xp_earned = db.data.globalSettings.xp_values['🎯'];
            result_text = `🎯 ТОЧНО В ЦЕЛЬ! +${xp_earned} XP!`;
            user.spins.darts++;
        }
    } else if (emoji === '🏀' && chat.settings.games.includes('🏀')) {
        if (value >= 4) { // Scored
            xp_earned = db.data.globalSettings.xp_values['🏀'];
            result_text = `🏀 ГООООЛ! Мяч в корзине. +${xp_earned} XP!`;
            user.spins.basketball++;
        }
    }

    if (xp_earned > 0) {
        user.xp += xp_earned;
        // Achievement check (Lucky)
        if (user.spins.slots >= 10 && !user.achievements.includes('Счастливчик')) {
            user.achievements.push('Счастливчик');
            await ctx.reply('🏆 Новое достижение: Счастливчик (10 побед в слотах)!');
        }
        await db.write();
        await ctx.reply(result_text);
    }
});

// --- COMMANDS ---
bot.command('admin_panel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply('🛠 Админ-панель', Markup.inlineKeyboard([
        [Markup.button.callback('📢 Рассылка', 'admin_mail'), Markup.button.callback('📊 Чаты', 'admin_chats')],
        [Markup.button.callback('🏆 Турнир', 'admin_tur'), Markup.button.callback('⚙️ Настройка XP', 'admin_xp')]
    ]));
});

bot.command('profile', (ctx) => {
    const user = getUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    const text = `👤 Профиль: ${user.username}\n⭐ XP: ${user.xp}\n🎰 Спинов: ${user.spins.slots}\n🎯 Дартс: ${user.spins.darts}\n🏀 Баскет: ${user.spins.basketball}\n⚔️ Баттлов: ${user.battles.count}\n🏆 Достижения: ${user.achievements.join(', ') || 'Нет'}`;
    ctx.reply(text);
});

bot.command('code_pl757', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const code = fs.readFileSync('index.mjs', 'utf8');
    ctx.replyWithDocument({ source: Buffer.from(code), filename: 'backup_code.mjs' });
});

// --- BATTLE SYSTEM ---
bot.command('battle', async (ctx) => {
    const amount = parseInt(ctx.payload);
    if (isNaN(amount) || amount <= 0) return ctx.reply('Используй: /battle [сумма]');
    
    const user = getUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    if (user.xp < amount) return ctx.reply('Недостаточно XP для ставки!');

    ctx.reply(`⚔️ ${user.username} вызывает на баттл на ${amount} XP!`, Markup.inlineKeyboard([
        [Markup.button.callback('Принять вызов', `accept_battle_${ctx.from.id}_${amount}`)]
    ]));
});

// --- WEB APP SIMULATION ---
app.get('/twa', (req, res) => {
    res.send(`<html><body style="background:#1a1a1a;color:white;font-family:sans-serif;padding:20px;">
        <h1>TWA Game Panel</h1>
        <div id="menu">
            <button onclick="show('home')">Главная</button>
            <button onclick="show('chats')">Мои чаты</button>
            <button onclick="show('profile')">Профиль</button>
        </div>
        <div id="content">Загрузка...</div>
        <script>
            function show(tab) {
                document.getElementById('content').innerHTML = "Контент вкладки: " + tab;
                // Тут будет fetch к API для данных
            }
            show('home');
        </script>
    </body></html>`);
});

// --- START ---
app.use(express.json());
bot.launch();
app.listen(3000, () => console.log('Server started on port 3000'));
