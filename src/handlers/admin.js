const bot = require('../bot');
const moment = require('moment');
const { User, Group, GroupUser, Task, Subject } = require('../models');
const { ADMIN_ID } = require('../utils');

async function startAdminPanel(chatId) {
    if (chatId !== ADMIN_ID) return bot.sendMessage(chatId, 'Доступ запрещен.');
    
    try {
        const pendingGroupsCount = await Group.count({ where: { isActive: false } });
        const pendingTasksCount = await Task.count({ where: { isApproved: false, isPrivate: false } });
        const activeGroupsCount = await Group.count({ where: { isActive: true } });

        const buttons = [
            [{ text: `Заявки на Группы (${pendingGroupsCount})`, callback_data: 'admin_pending_grps' }],
            [{ text: `Задачи на проверку (${pendingTasksCount})`, callback_data: 'admin_pending_tasks' }]
        ];

        const groups = await Group.findAll({ where: { isActive: true } });
        let row = [];
        groups.forEach((g, index) => {
            row.push({ text: g.name, callback_data: `adm_mod_grp_${g.id}` });
            if (row.length === 2 || index === groups.length - 1) {
                buttons.push(row);
                row = [];
            }
        });

        bot.sendMessage(chatId, `
<b>Админ-панель</b>

Активных групп: ${activeGroupsCount}
mailbox Заявок на группы: ${pendingGroupsCount}
Задач на проверку: ${pendingTasksCount}
`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });

    } catch (e) {
        bot.sendMessage(chatId, 'Ошибка запуска панели.');
    }
}

module.exports = async function (query, user, data) {
    const chatId = user.telegramId;
    if (chatId !== ADMIN_ID) return;
    
    try {
        await bot.answerCallbackQuery(query.id);
    } catch (e) {}

    try {
        if (data === 'admin_pending_tasks') {
            const tasks = await Task.findAll({ 
                where: { isApproved: false, isPrivate: false } 
            });

            if (tasks.length === 0) {
                await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
                return bot.sendMessage(chatId, 'Задач на проверку нет.', {
                    reply_markup: { inline_keyboard: [[{ text: 'В меню', callback_data: 'back_to_admin' }]] }
                });
            }

            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});

            for (const t of tasks) {
                let groupName = '—';
                let subjectName = '—';
                let creatorInfo = 'Неизвестно';

                if (t.GroupId) {
                    const g = await Group.findByPk(t.GroupId);
                    if (g) groupName = g.name;
                }
                if (t.SubjectId) {
                    const s = await Subject.findByPk(t.SubjectId);
                    if (s) subjectName = s.name;
                }
                if (t.creatorId) {
                    const c = await User.findByPk(t.creatorId);
                    if (c) creatorInfo = c.username ? `@${c.username}` : `ID ${c.id}`;
                }

                const date = moment(t.deadline).format('DD.MM HH:mm');

                const msgText = `
<b>Задача</b>
${t.title}
Предмет: ${subjectName}
Группа: ${groupName}
Дедлайн: ${date}
От: ${creatorInfo}
`;
                await bot.sendMessage(chatId, msgText, {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [[
                        { text: 'Одобрить', callback_data: `adm_apr_tsk_${t.id}` },
                        { text: 'Удалить', callback_data: `adm_del_tsk_${t.id}` }
                    ]]}
                });
            }
            return bot.sendMessage(chatId, '--- Конец списка ---', {
                reply_markup: { inline_keyboard: [[{ text: 'В меню админа', callback_data: 'back_to_admin' }]] }
            });
        }

        if (data.startsWith('adm_apr_tsk_')) {
            const taskId = data.split('_')[3];
            await Task.update({ isApproved: true }, { where: { id: taskId } });
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            return bot.sendMessage(chatId, 'Задача одобрена!');
        }

        if (data.startsWith('adm_del_tsk_')) {
            const taskId = data.split('_')[3];
            await Task.destroy({ where: { id: taskId } });
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            return bot.sendMessage(chatId, 'Задача удалена.');
        }

        if (data === 'back_to_admin') {
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            return startAdminPanel(chatId);
        }

        if (data === 'admin_pending_grps') {
            const pending = await Group.findAll({ where: { isActive: false } });
            if (!pending.length) return bot.sendMessage(chatId, 'Заявок нет.');
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            for (const g of pending) {
                await bot.sendMessage(chatId, `Заявка: ${g.name}`, {
                    reply_markup: { inline_keyboard: [[
                        { text: 'Принять', callback_data: `adm_apr_grp_${g.id}` },
                        { text: 'Отказ', callback_data: `adm_rej_grp_${g.id}` }
                    ]]}
                });
            }
            return bot.sendMessage(chatId, 'Меню:', { reply_markup: { inline_keyboard: [[{ text: 'Назад', callback_data: 'back_to_admin' }]] } });
        }

        if (data.startsWith('adm_apr_grp_')) {
            await Group.update({ isActive: true }, { where: { id: data.split('_')[3] } });
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            bot.sendMessage(chatId, 'Группа создана.');
        }
        if (data.startsWith('adm_rej_grp_')) {
            await Group.destroy({ where: { id: data.split('_')[3] } });
            await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            bot.sendMessage(chatId, 'Группа удалена.');
        }

        if (data.startsWith('adm_mod_grp_')) {
            const gid = data.split('_')[3];
            const group = await Group.findByPk(gid, { include: User });
            if (!group) return bot.sendMessage(chatId, 'Группа не найдена');
            const btns = group.Users.map(u => [{ text: `${u.username} (ID:${u.id})`, callback_data: `adm_mod_usr_${gid}_${u.id}` }]);
            btns.push([{ text: 'Назад', callback_data: 'back_to_admin' }]);
            await bot.editMessageText(`Пользователи ${group.name}:`, {
                chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: btns }
            });
        }

        if (data.startsWith('adm_mod_usr_')) {
            const [, , , gid, uid] = data.split('_');
            const btns = [
                [{ text: 'Участник', callback_data: `adm_setrole_${gid}_${uid}_participant` }],
                [{ text: 'Куратор', callback_data: `adm_setrole_${gid}_${uid}_curator` }],
                [{ text: 'Назад', callback_data: `adm_mod_grp_${gid}` }]
            ];
            await bot.editMessageText(`Роль для ID ${uid}:`, {
                chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: btns }
            });
        }

        if (data.startsWith('adm_setrole_')) {
            const [, , gid, uid, role] = data.split('_');
            const [gu, created] = await GroupUser.findOrCreate({ where: { UserId: uid, GroupId: gid }, defaults: { role } });
            if (!created) { gu.role = role; await gu.save(); }
            await bot.answerCallbackQuery(query.id, { text: 'Сохранено!' });
            await bot.sendMessage(chatId, `Роль ${role} установлена.`);
        }

    } catch (error) {
        bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
    }
};

module.exports.startAdminPanel = startAdminPanel;