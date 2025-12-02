const TelegramBot = require('node-telegram-bot-api');
const { sequelize, User, Group, GroupRequest, UserGroup } = require('./models');

const TOKEN = '8261063267:AAGo3bXQWI29GZwXNygQBB_Kgty7gjUXmSw';

const bot = new TelegramBot(TOKEN, { 
  polling: { 
    interval: 300,
    timeout: 10,
    autoStart: true
  } 
});


const userStates = new Map();

const USER_STATES = {
  AWAITING_GROUP_NAME: 'awaiting_group_name',
  AWAITING_GROUP_DESCRIPTION: 'awaiting_group_description'
};

async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Подключение к MySQL установлено');
    
    await sequelize.sync({ force: false });
    console.log('Модели синхронизированы');

    await User.findOrCreate({
      where: { telegramId: 6056171152 }, 
      defaults: {
        firstName: 'Admin',
        isAdmin: true
      }
    });
    
    console.log('Администратор создан');

    const groupsCount = await Group.count();
    if (groupsCount === 0) {
      await Group.bulkCreate([
        { name: 'JavaScript Developers', description: 'Группа для разработчиков JavaScript' },
        { name: 'Python Programmers', description: 'Сообщество Python разработчиков' },
        { name: 'Web Design', description: 'Дизайнеры и фронтенд разработчики' },
        { name: 'Mobile Development', description: 'Разработка мобильных приложений' },
        { name: 'Data Science', description: 'Data Science и машинное обучение' },
        { name: 'DevOps', description: 'DevOps инженеры и системные администраторы' }
      ]);
      console.log('Тестовые группы созданы');
    }
    
  } catch (error) {
    console.error('Ошибка инициализации БД:', error);
    process.exit(1);
  }
}


async function getOrCreateUser(telegramUser) {
  try {
    const [user] = await User.findOrCreate({
      where: { telegramId: telegramUser.id },
      defaults: {
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name || '',
        username: telegramUser.username || ''
      }
    });

    await user.update({ lastActivity: new Date() });
    
    return user;
  } catch (error) {
    console.error('Ошибка создания пользователя:', error);
    throw error;
  }
}

async function showGroupSelection(chatId, user, page = 0) {
  try {
    const groupsPerPage = 3;
    const { count, rows: groups } = await Group.findAndCountAll({
      where: { isActive: true },
      limit: groupsPerPage,
      offset: page * groupsPerPage,
      order: [['name', 'ASC']]
    });

    const userWithGroups = await User.findOne({
      where: { id: user.id },
      include: [{
        model: Group,
        through: { attributes: [] },
        attributes: ['id']
      }]
    });

    const userGroupIds = userWithGroups?.Groups?.map(g => g.id) || [];

    const keyboard = {
      inline_keyboard: []
    };

    groups.forEach(group => {
      const isSubscribed = userGroupIds.includes(group.id);
      const buttonText = isSubscribed ? `${group.name}` : group.name;
      const callbackData = isSubscribed ? `unsubscribe_${group.id}` : `subscribe_${group.id}`;
      
      keyboard.inline_keyboard.push([
        { text: buttonText, callback_data: callbackData }
      ]);
    });

    const navButtons = [];
    if (page > 0) {
      navButtons.push({ text: 'Назад', callback_data: `groups_page_${page - 1}` });
    }
    if ((page + 1) * groupsPerPage < count) {
      navButtons.push({ text: 'Вперёд', callback_data: `groups_page_${page + 1}` });
    }
    if (navButtons.length > 0) {
      keyboard.inline_keyboard.push(navButtons);
    }

    keyboard.inline_keyboard.push([
      { text: 'Добавить группу', callback_data: 'add_group' },
      { text: 'Ожидающие группы', callback_data: 'show_pending_groups' }
    ]);

    if (user.isAdmin) {
      const pendingCount = await GroupRequest.count({ where: { status: 'pending' } });
      keyboard.inline_keyboard.push([
        { text: `Админ-панель (${pendingCount})`, callback_data: 'admin_panel' }
      ]);
    }

    const message = `Выберите группу из списка (страница ${page + 1}):\n\n(вы подписаны)`;

    await bot.sendMessage(chatId, message, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Ошибка показа групп:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке групп.');
  }
}

async function showPendingGroups(chatId, messageId = null) {
  try {
    const pendingRequests = await GroupRequest.findAll({
      where: { status: 'pending' },
      include: [{
        model: User,
        attributes: ['firstName', 'lastName', 'username', 'telegramId']
      }],
      order: [['requestedAt', 'ASC']]
    });

    if (pendingRequests.length === 0) {
      const message = 'Нет групп, ожидающих одобрения.';
      if (messageId) {
        await bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Назад к группам', callback_data: 'back_to_groups' }]
            ]
          }
        });
      } else {
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Назад к группам', callback_data: 'back_to_groups' }]
            ]
          }
        });
      }
      return;
    }

    let message = 'Группы, ожидающие одобрения:\n\n';
    
    pendingRequests.forEach((request, index) => {
      const user = request.User;
      const userInfo = user.username 
        ? `@${user.username}`
        : `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
      
      message += `${index + 1}. <b>${request.groupName}</b>\n`;
      if (request.description) {
        message += `   ${request.description}\n`;
      }
      message += `   От: ${userInfo}\n`;
      message += `   ${request.requestedAt.toLocaleDateString()}\n\n`;
    });

    if (messageId) {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Назад к группам', callback_data: 'back_to_groups' }]
          ]
        }
      });
    } else {
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Назад к группам', callback_data: 'back_to_groups' }]
          ]
        }
      });
    }

  } catch (error) {
    console.error('Ошибка показа ожидающих групп:', error);
    await bot.sendMessage(chatId, 'Ошибка при загрузке ожидающих групп.');
  }
}

async function showAdminPanel(chatId, user) {
  try {
    if (!user.isAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав администратора.');
      return;
    }

    const pendingCount = await GroupRequest.count({ where: { status: 'pending' } });
    const totalGroups = await Group.count();
    const totalUsers = await User.count();

    const message = `Панель администратора\n\n` +
                   `Статистика:\n` +
                   `Ожидающие заявки: ${pendingCount}\n` +
                   `Активных групп: ${totalGroups}\n` +
                   `Пользователей: ${totalUsers}\n\n` +
                   `Выберите действие:`;

    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: `Заявки на группы (${pendingCount})`, callback_data: 'admin_pending_requests' }],
          [{ text: 'Полная статистика', callback_data: 'admin_stats' }],
          [{ text: 'Главное меню', callback_data: 'back_to_groups' }]
        ]
      }
    });
  } catch (error) {
    console.error('Ошибка показа админ-панели:', error);
    await bot.sendMessage(chatId, 'Ошибка при загрузке панели администратора.');
  }
}

async function showPendingRequestsAdmin(chatId, messageId = null) {
  try {
    const pendingRequests = await GroupRequest.findAll({
      where: { status: 'pending' },
      include: [{
        model: User,
        attributes: ['firstName', 'lastName', 'username', 'telegramId']
      }],
      order: [['requestedAt', 'ASC']]
    });

    if (pendingRequests.length === 0) {
      const message = 'Нет ожидающих заявок.';
      const keyboard = {
        inline_keyboard: [
          [{ text: 'Назад в админку', callback_data: 'admin_back' }],
          [{ text: 'Обновить', callback_data: 'admin_pending_requests' }]
        ]
      };

      if (messageId) {
        await bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard
        });
      } else {
        await bot.sendMessage(chatId, message, { reply_markup: keyboard });
      }
      return;
    }

    let message = 'Заявки на создание групп:\n\n';
    const keyboard = { inline_keyboard: [] };

    pendingRequests.forEach((request, index) => {
      const userInfo = request.User.username 
        ? `@${request.User.username}`
        : `${request.User.firstName}${request.User.lastName ? ' ' + request.User.lastName : ''}`;
      
      message += `<b>Заявка #${request.id}</b>\n`;
      message += `<b>Название:</b> ${request.groupName}\n`;
      if (request.description) {
        message += `<b>Описание:</b> ${request.description}\n`;
      }
      message += `<b>От:</b> ${userInfo}\n`;
      message += `<b>Дата:</b> ${request.requestedAt.toLocaleDateString()}\n\n`;

      keyboard.inline_keyboard.push([
        { text: `Одобрить "${request.groupName}"`, callback_data: `admin_approve_${request.id}` },
        { text: `Отклонить`, callback_data: `admin_reject_${request.id}` }
      ]);
    });

    keyboard.inline_keyboard.push([
      { text: 'Обновить', callback_data: 'admin_pending_requests' },
      { text: 'Назад в админку', callback_data: 'admin_back' }
    ]);

    if (messageId) {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } else {
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }

  } catch (error) {
    console.error('Ошибка показа заявок админу:', error);
    await bot.sendMessage(chatId, 'Ошибка при загрузке заявок.');
  }
}

async function approveGroupRequest(requestId, adminUser) {
  try {
    const request = await GroupRequest.findOne({
      where: { id: requestId },
      include: [User]
    });

    if (!request) {
      throw new Error('Заявка не найдена');
    }

    const group = await Group.create({
      name: request.groupName,
      description: request.description
    });

    await request.update({
      status: 'approved',
      processedAt: new Date(),
      adminNotes: `Одобрено администратором: ${adminUser.firstName} (ID: ${adminUser.id})`
    });

    await bot.sendMessage(
      request.User.telegramId,
      `Ваша заявка на группу "<b>${request.groupName}</b>" была <b>одобрена</b>!\n\n` +
      `Теперь группа доступна в общем списке для подписки.`,
      { parse_mode: 'HTML' }
    );

    return group;
  } catch (error) {
    console.error('Ошибка одобрения заявки:', error);
    throw error;
  }
}

async function rejectGroupRequest(requestId, adminUser) {
  try {
    const request = await GroupRequest.findOne({
      where: { id: requestId },
      include: [User]
    });

    if (!request) {
      throw new Error('Заявка не найдена');
    }

    await request.update({
      status: 'rejected',
      processedAt: new Date(),
      adminNotes: `Отклонено администратором: ${adminUser.firstName} (ID: ${adminUser.id})`
    });

    await bot.sendMessage(
      request.User.telegramId,
      `Ваша заявка на группу "<b>${request.groupName}</b>" была <b>отклонена</b>.\n\n` +
      `При необходимости свяжитесь с администратором.`,
      { parse_mode: 'HTML' }
    );

    return true;
  } catch (error) {
    console.error('Ошибка отклонения заявки:', error);
    throw error;
  }
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const user = await getOrCreateUser(msg.from);
    
    const welcomeMessage = `
Привет, ${user.firstName}!

Добро пожаловать в менеджер групп! 

Выберите нужную группу из списка или создайте новую.
    `;
    
    await bot.sendMessage(chatId, welcomeMessage);
    await showGroupSelection(chatId, user, 0);
  } catch (error) {
    console.error('Ошибка в /start:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `
Справка по командам:

/start - Начать работу с ботом
/help - Получить справку по командам
/groups - Показать список групп
/my_groups - Показать мои группы
/admin - Панель администратора

Функционал:
• Выбор группы из списка с пагинацией
• Добавление новой группы через заявку
• Просмотр ожидающих одобрения групп
• Подписка/отписка от групп
• Управление заявками (для администраторов)

Как использовать:
1. Выберите группу из списка
2. Нажмите "Добавить группу" для создания новой
3. Следите за статусом заявок в "Ожидающие группы"
  `;
  
  await bot.sendMessage(chatId, helpMessage);
});

bot.onText(/\/groups/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const user = await getOrCreateUser(msg.from);
    await showGroupSelection(chatId, user, 0);
  } catch (error) {
    console.error('Ошибка в /groups:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
});

bot.onText(/\/my_groups/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const user = await getOrCreateUser(msg.from);
    
    const userWithGroups = await User.findOne({
      where: { id: user.id },
      include: [{
        model: Group,
        through: { attributes: [] },
        where: { isActive: true }
      }]
    });
    
    if (!userWithGroups || !userWithGroups.Groups || userWithGroups.Groups.length === 0) {
      await bot.sendMessage(chatId, 'Вы пока не подписаны ни на одну группу.\n\nИспользуйте /groups чтобы выбрать группы.');
      return;
    }
    
    let message = 'Ваши группы:\n\n';
    userWithGroups.Groups.forEach((group, index) => {
      message += `${index + 1}. <b>${group.name}</b>\n`;
      if (group.description) {
        message += `   ${group.description}\n`;
      }
      message += '\n';
    });
    
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Выбрать еще группы', callback_data: 'back_to_groups' }]
        ]
      }
    });
    
  } catch (error) {
    console.error('Ошибка загрузки моих групп:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке ваших групп.');
  }
});

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const user = await getOrCreateUser(msg.from);
    await showAdminPanel(chatId, user);
  } catch (error) {
    console.error('Ошибка в /admin:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  try {
    const user = await getOrCreateUser(callbackQuery.from);

    if (data.startsWith('groups_page_')) {
      const page = parseInt(data.split('_')[2]);
      await bot.deleteMessage(chatId, message.message_id);
      await showGroupSelection(chatId, user, page);
    }
    else if (data.startsWith('subscribe_')) {
      const groupId = parseInt(data.split('_')[1]);
      await UserGroup.findOrCreate({
        where: { userId: user.id, groupId }
      });
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Вы подписались на группу!' });
      await bot.deleteMessage(chatId, message.message_id);
      await showGroupSelection(chatId, user, 0);
    }
    else if (data.startsWith('unsubscribe_')) {
      const groupId = parseInt(data.split('_')[1]);
      await UserGroup.destroy({
        where: { userId: user.id, groupId }
      });
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Вы отписались от группы!' });
      await bot.deleteMessage(chatId, message.message_id);
      await showGroupSelection(chatId, user, 0);
    }
    else if (data === 'add_group') {
      userStates.set(chatId, USER_STATES.AWAITING_GROUP_NAME);
      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.editMessageText('Введите название для новой группы:', {
        chat_id: chatId,
        message_id: message.message_id
      });
    }
    else if (data === 'show_pending_groups') {
      await bot.answerCallbackQuery(callbackQuery.id);
      await showPendingGroups(chatId, message.message_id);
    }
    else if (data === 'back_to_groups') {
      await bot.deleteMessage(chatId, message.message_id);
      await showGroupSelection(chatId, user, 0);
    }
    else if (data === 'admin_panel') {
      await showAdminPanel(chatId, user);
    }
    else if (data === 'admin_pending_requests') {
      await showPendingRequestsAdmin(chatId, message.message_id);
    }
    else if (data.startsWith('admin_approve_')) {
      const requestId = parseInt(data.split('_')[2]);
      const group = await approveGroupRequest(requestId, user);
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: `Группа "${group.name}" создана!` 
      });
      await showPendingRequestsAdmin(chatId, message.message_id);
    }
    else if (data.startsWith('admin_reject_')) {
      const requestId = parseInt(data.split('_')[2]);
      await rejectGroupRequest(requestId, user);
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: 'Заявка отклонена!' 
      });
      await showPendingRequestsAdmin(chatId, message.message_id);
    }
    else if (data === 'admin_back') {
      await showAdminPanel(chatId, user);
    }
    else if (data === 'admin_stats') {

      const pendingCount = await GroupRequest.count({ where: { status: 'pending' } });
      const approvedCount = await GroupRequest.count({ where: { status: 'approved' } });
      const rejectedCount = await GroupRequest.count({ where: { status: 'rejected' } });
      const totalGroups = await Group.count();
      const totalUsers = await User.count();
      
      const statsMessage = `Полная статистика:\n\n` +
                          `Пользователи: ${totalUsers}\n` +
                          `Группы: ${totalGroups}\n\n` +
                          `Заявки на группы:\n` +
                          `Ожидающие: ${pendingCount}\n` +
                          `Одобренные: ${approvedCount}\n` +
                          `Отклоненные: ${rejectedCount}\n` +
                          `Всего заявок: ${pendingCount + approvedCount + rejectedCount}`;

      await bot.editMessageText(statsMessage, {
        chat_id: chatId,
        message_id: message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Управление заявками', callback_data: 'admin_pending_requests' }],
            [{ text: 'Назад в админку', callback_data: 'admin_back' }]
          ]
        }
      });
    }

  } catch (error) {
    console.error('Ошибка обработки callback:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Произошла ошибка. Попробуйте снова.'
    });
  }
});


bot.on('message', async (msg) => {

  if (!msg.text || msg.text.startsWith('/')) {
    return;
  }

  const chatId = msg.chat.id;
  const text = msg.text;

  try {
    const user = await getOrCreateUser(msg.from);
    const userState = userStates.get(chatId);
    
    if (userState === USER_STATES.AWAITING_GROUP_NAME) {

      userStates.set(chatId, { 
        state: USER_STATES.AWAITING_GROUP_DESCRIPTION,
        groupName: text 
      });
      
      await bot.sendMessage(chatId, 'Теперь введите описание для группы (или отправьте "-" чтобы пропустить):');
      return;
    }
    
    if (userState && userState.state === USER_STATES.AWAITING_GROUP_DESCRIPTION) {
      const groupName = userState.groupName;
      const description = text === '-' ? null : text;
      

      userStates.delete(chatId);
      

      const groupRequest = await GroupRequest.create({
        groupName,
        description,
        userId: user.id,
        status: 'pending'
      });
      
      const message = `Заявка на добавление группы отправлена!\n\n` +
                     `<b>Название:</b> ${groupName}\n` +
                     (description ? `<b>Описание:</b> ${description}\n` : '') +
                     `<b>Отправитель:</b> ${user.firstName}\n\n` +
                     `Ожидайте одобрения администратора.`;
      
      await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      

      try {
        const admins = await User.findAll({ where: { isAdmin: true } });
        for (const admin of admins) {
          const adminMessage = `Новая заявка на группу!\n\n` +
                              `<b>Название:</b> ${groupName}\n` +
                              (description ? `<b>Описание:</b> ${description}\n` : '') +
                              `<b>Пользователь:</b> ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}\n` +
                              (user.username ? `<b>Username:</b> @${user.username}\n` : '') +
                              `<b>ID заявки:</b> ${groupRequest.id}\n` +
                              `<b>Время:</b> ${new Date().toLocaleString()}\n\n` +
                              `Для управления заявкой используйте /admin`;

          await bot.sendMessage(admin.telegramId, adminMessage, { parse_mode: 'HTML' });
        }
      } catch (adminError) {
        console.error('Ошибка отправки уведомления админам:', adminError);
      }
      

      await showGroupSelection(chatId, user, 0);
      
    } else {

      await bot.sendMessage(chatId, 'Используйте кнопки для навигации или /help для справки');
    }
  } catch (error) {
    console.error('Ошибка обработки сообщения:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
});


bot.on('error', (error) => {
  console.error('Ошибка бота:', error);
});

bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error);
});

async function startBot() {
  try {
    await initializeDatabase();
    console.log('Бот запущен и ожидает сообщений...');
  } catch (error) {
    console.error('Не удалось запустить бота:', error);
    process.exit(1);
  }
}

startBot();