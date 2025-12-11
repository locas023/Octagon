const bot = require('../bot');
const { User, Group, GroupUser } = require('../models');
const { mainMenu, cancelKb, ADMIN_ID } = require('../utils');

async function sendGroupSelection(chatId, page = 0) {
    const limit = 5;
    const offset = page * limit;
    
    const { count, rows } = await Group.findAndCountAll({ 
        where: { isActive: true }, limit, offset 
    });

    const buttons = rows.map(g => [{ text: g.name, callback_data: `sel_grp_${g.id}` }]);

    const navRow = [];
    if (page > 0) navRow.push({ text: 'Назад', callback_data: `pg_grp_${page - 1}` });
    if (offset + limit < count) navRow.push({ text: 'Вперед', callback_data: `pg_grp_${page + 1}` });
    if (navRow.length > 0) buttons.push(navRow);

    buttons.push([{ text: 'Добавить группу', callback_data: 'add_grp_req' }]);
    if (chatId === ADMIN_ID) {
        buttons.push([{ text: 'Группы на одобрении', callback_data: 'admin_pending_grps' }]);
    }

    bot.sendMessage(chatId, 'Выберите группу:', { reply_markup: { inline_keyboard: buttons } });
}

module.exports = function (query, user, data) {
    const chatId = user.telegramId;

    if (data === 'add_grp_req') {
        user.state = JSON.stringify({ step: 'create_group_name' });
        user.save();
        return bot.sendMessage(chatId, 'Напишите название новой группы:', cancelKb);
    }

    if (data.startsWith('pg_grp_')) {
        sendGroupSelection(chatId, parseInt(data.split('_')[2]));
    }

    if (data.startsWith('sel_grp_')) {
        const groupId = parseInt(data.split('_')[2]);
        user.currentGroupId = groupId;
        user.save();

        GroupUser.findOrCreate({ 
            where: { UserId: user.id, GroupId: groupId },
            defaults: { role: 'participant' }
        });

        bot.sendMessage(chatId, `Выбрана группа ID: ${groupId}.`, mainMenu);
    }
};

module.exports.sendGroupSelection = sendGroupSelection;