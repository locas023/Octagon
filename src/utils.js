const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const { GroupUser } = require('./models');

async function isCurator(userId, groupId) {
    if (userId === ADMIN_ID) return true;
    const link = await GroupUser.findOne({ where: { UserId: userId, GroupId: groupId } });
    return link && link.role === 'curator';
}

function getMainMenu(chatId) {
    const keyboard = [
        ['Задачи', 'Добавить задачу'],
        ['Сменить группу', 'Настройки'] 
    ];

    if (chatId === ADMIN_ID) {
        keyboard.push(['Админ-панель']);
    }

    return {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true
        }
    };
}


const cancelKb = {
    reply_markup: {
        inline_keyboard: [[{ text: 'Отмена', callback_data: 'cancel_action' }]]
    }
};


const HELP_TEXTS = {
    user: `
<b>Инструкция пользователя:</b>

<b>Меню:</b>
<b>Задачи</b> - Показать список активных задач в выбранной группе.
<b>Добавить задачу</b> - Создать задачу (для себя или отправить запрос куратору).
<b>Сменить группу</b> - Выбрать другую учебную группу.

<b>Команды:</b>
/start - Перезапуск бота.
/help - Вызов этого сообщения.
`,
    admin: `
<b>Инструкция Администратора:</b>

<b>Управление:</b>
1. Нажмите кнопку <b>Админ-панель</b> в меню.
2. В разделе <b>Заявки</b> одобряйте создание новых групп.
3. В списке групп выберите нужную, затем пользователя, чтобы назначить его <b>Куратором</b>.

<b>Команды:</b>
/setrole @username role - (Альтернатива) Выдача роли через консоль.
`
};

module.exports = { isCurator, getMainMenu, cancelKb, ADMIN_ID, HELP_TEXTS };