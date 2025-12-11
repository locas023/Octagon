const bot = require('../bot');
const { User } = require('../models');
const { getMainMenu } = require('../utils');

async function showSettings(user) {
    const chatId = user.telegramId;
    const notifStatus = user.notificationsEnabled ? 'Включены' : 'Выключены';
    const groupStatus = user.currentGroupId ? `ID ${user.currentGroupId}` : 'Не выбрана';

    const text = `
<b>Настройки</b>

Уведомления: <b>${notifStatus}</b>
Текущая группа: <b>${groupStatus}</b>

Выберите действие:
`;
    
    const buttons = [
        [{ text: `Переключить уведомления`, callback_data: 'settings_toggle_notif' }],
        [{ text: `Сбросить выбор группы`, callback_data: 'settings_reset_group' }]
    ];

    bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

module.exports = async function (query, user, data) {
    const chatId = user.telegramId;

    if (data === 'settings_toggle_notif') {
        user.notificationsEnabled = !user.notificationsEnabled;
        await user.save();
        
        const status = user.notificationsEnabled ? 'Включены' : 'Выключены';
        bot.answerCallbackQuery(query.id, { text: `Уведомления ${status}` });

        const groupStatus = user.currentGroupId ? `ID ${user.currentGroupId}` : 'Не выбрана';
        const text = `
<b>Настройки</b>

Уведомления: <b>${status}</b>
Текущая группа: <b>${groupStatus}</b>

Выберите действие:
`;
        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: query.message.reply_markup
        });
    }

    if (data === 'settings_reset_group') {
        user.currentGroupId = null;
        await user.save();
        
        bot.deleteMessage(chatId, query.message.message_id);
        bot.sendMessage(chatId, 'Группа сброшена. Выберите новую группу в меню или напишите /start.', getMainMenu(chatId));
    }
};

module.exports.showSettings = showSettings;