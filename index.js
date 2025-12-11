require('dotenv').config();
const bot = require('./src/bot');
const { sequelize, User, Group, Subject } = require('./src/models');
const { getMainMenu, cancelKb, ADMIN_ID, HELP_TEXTS } = require('./src/utils');
const groupHandler = require('./src/handlers/groups');
const adminHandler = require('./src/handlers/admin');
const taskHandler = require('./src/handlers/tasks');
const settingsHandler = require('./src/handlers/settings');
const initCron = require('./src/cron');
const moment = require('moment');


sequelize.sync({ alter: true }).then(() => console.log('БД подключена и готова'));
initCron();


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    let [user] = await User.findOrCreate({ 
        where: { telegramId: chatId }, 
        defaults: { username: msg.from.username } 
    });

    if (text === '/help') {
        const isAdmin = chatId === ADMIN_ID;
        let helpMsg = HELP_TEXTS.user;
        if (isAdmin) helpMsg += HELP_TEXTS.admin;
        return bot.sendMessage(chatId, helpMsg, { parse_mode: 'HTML' });
    }

    if (text === '/start') {
        user.state = null;
        await user.save();
        await bot.sendMessage(chatId, `Привет! Выбери действие:`, getMainMenu(chatId));
        if (!user.currentGroupId && chatId !== ADMIN_ID) {
            return groupHandler.sendGroupSelection(chatId);
        }
        return;
    }

    if (text === 'Админ-панель') return adminHandler.startAdminPanel(chatId);
    if (text === 'Задачи') return taskHandler.showTasks(user);
    if (text === 'Добавить задачу') return taskHandler.startTaskCreation(user);
    if (text === 'Сменить группу') return groupHandler.sendGroupSelection(chatId);
    if (text === 'Настройки') return settingsHandler.showSettings(user); 

    if (user.state) {
        const state = JSON.parse(user.state);

        if (state.step === 'create_group_name') {
            const group = await Group.create({ name: text, isActive: false });
            bot.sendMessage(ADMIN_ID, `Заявка на группу: ${text}`, {
                reply_markup: { inline_keyboard: [[{ text: 'В админку', callback_data: 'ignore' }]] } 
            });
            user.state = null;
            await user.save();
            return bot.sendMessage(chatId, 'Заявка отправлена.', getMainMenu(chatId));
        }

        if (state.step === 'add_task_title') {
            state.title = text;
            state.step = 'add_task_date';
            user.state = JSON.stringify(state);
            await user.save();
            return bot.sendMessage(chatId, 'Дедлайн (YYYY-MM-DD HH:mm):', cancelKb);
        }

        if (state.step === 'add_task_date') {
            const date = moment(text, 'YYYY-MM-DD HH:mm');
            if (!date.isValid()) return bot.sendMessage(chatId, 'Неверный формат.');
            state.date = date.toDate();
            state.step = 'sel_subj';
            user.state = JSON.stringify(state);
            await user.save();
            const subjects = await Subject.findAll({ where: { GroupId: user.currentGroupId } });
            const buttons = subjects.map(s => [{ text: s.name, callback_data: `sel_sbj_${s.id}` }]);
            buttons.push([{ text: 'Новый предмет', callback_data: 'add_new_sbj' }]);
            return bot.sendMessage(chatId, 'Выберите предмет:', { reply_markup: { inline_keyboard: buttons } });
        }

        if (state.step === 'create_subject_name') {
            state.newSubjectName = text;
            state.step = 'finish_task'; 
            user.state = JSON.stringify(state);
            await user.save();
            const buttons = [[{ text: 'Для себя', callback_data: 'tsk_scp_self' }], [{ text: 'Запрос/Группа', callback_data: 'tsk_scp_req' }]];
            return bot.sendMessage(chatId, 'Для кого задача?', { reply_markup: { inline_keyboard: buttons } });
        }
    }
});


bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'ignore') return bot.answerCallbackQuery(query.id);

    if (data === 'back_to_admin') {
        return adminHandler.startAdminPanel(chatId);
    }

    if (data === 'cancel_action') {
        await User.update({ state: null }, { where: { telegramId: chatId } });
        bot.deleteMessage(chatId, query.message.message_id);
        return bot.sendMessage(chatId, 'Отменено.', getMainMenu(chatId));
    }

    const user = await User.findOne({ where: { telegramId: chatId } });


    if (data.startsWith('adm_') || data.startsWith('admin_')) {
        await adminHandler(query, user, data);
    } 
    else if (data.startsWith('settings_')) { 
        await settingsHandler(query, user, data);
    }
    else if (data.startsWith('sel_grp_') || data.startsWith('pg_grp_') || data === 'add_grp_req') {
        await groupHandler(query, user, data);
    } 
    else {
        await taskHandler(query, user, data);
    }
});

console.log('Бот запущен...');