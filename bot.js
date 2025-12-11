const TelegramBot = require('node-telegram-bot-api');
const { sequelize, User, Group, GroupRequest, UserGroup, Task, UserTask, TaskRequest } = require('./models');
const { Sequelize } = require('sequelize');

const TOKEN = '8261063267:AAGo3bXQWI29GZwXNygQBB_Kgty7gjUXmSw';

const bot = new TelegramBot(TOKEN, { 
  polling: { 
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  } 
});

const userStates = new Map();

const USER_STATES = {
  AWAITING_GROUP_NAME: 'awaiting_group_name',
  AWAITING_GROUP_DESCRIPTION: 'awaiting_group_description',
  AWAITING_TASK_TITLE: 'awaiting_task_title',
  AWAITING_TASK_DESCRIPTION: 'awaiting_task_description',
  AWAITING_TASK_SUBJECT: 'awaiting_task_subject',
  AWAITING_TASK_DEADLINE: 'awaiting_task_deadline',
  AWAITING_TASK_PRIORITY: 'awaiting_task_priority',
  AWAITING_TASK_SCOPE: 'awaiting_task_scope',
  AWAITING_NEW_SUBJECT: 'awaiting_new_subject',
  AWAITING_TASK_REQUEST_REASON: 'awaiting_task_request_reason'
};

function parseDeadlineDate(text) {
  const now = new Date();
  
  const exactMatch = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (exactMatch) {
    const [_, day, month, year, hours, minutes] = exactMatch;
    return new Date(year, month - 1, day, hours, minutes);
  }
  
  const tomorrowMatch = text.match(/завтра\s+(\d{2}):(\d{2})/i);
  if (tomorrowMatch) {
    const [_, hours, minutes] = tomorrowMatch;
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return date;
  }
  
  const daysMatch = text.match(/через\s+(\d+)\s+дн?я?й?\s+(\d{2}):(\d{2})/i);
  if (daysMatch) {
    const [_, days, hours, minutes] = daysMatch;
    const date = new Date(now);
    date.setDate(date.getDate() + parseInt(days));
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return date;
  }
  
  const nextWeekMatch = text.match(/следующая\s+неделя\s+(\w+)\s+(\d{2}):(\d{2})/i);
  if (nextWeekMatch) {
    const [_, dayOfWeek, hours, minutes] = nextWeekMatch;
    const daysOfWeek = {
      'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4,
      'пятница': 5, 'суббота': 6, 'воскресенье': 0
    };
    
    const targetDay = daysOfWeek[dayOfWeek.toLowerCase()];
    if (targetDay !== undefined) {
      const date = new Date(now);
      const currentDay = date.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      date.setDate(date.getDate() + daysToAdd);
      date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      return date;
    }
  }
  
  return null;
}

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
    
    setInterval(checkDeadlines, 30 * 60 * 1000);
    
    setTimeout(checkDeadlines, 60 * 1000);
    
    console.log('Таймеры для проверки дедлайнов установлены');
    
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
      const buttonText = isSubscribed ? `✓ ${group.name}` : group.name;
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
      { text: '📋 Задачи', callback_data: 'tasks' },
      { text: 'Добавить группу', callback_data: 'add_group' },
      { text: 'Ожидающие группы', callback_data: 'show_pending_groups' }
    ]);

    if (user.isAdmin) {
      const pendingCount = await GroupRequest.count({ where: { status: 'pending' } });
      const pendingTaskCount = await TaskRequest.count({ where: { status: 'pending' } });
      keyboard.inline_keyboard.push([
        { text: `Админ-панель (${pendingCount + pendingTaskCount})`, callback_data: 'admin_panel' }
      ]);
    }

    const message = `Выберите группу из списка (страница ${page + 1}):\n\n(✓ - вы подписаны)`;

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
    const pendingTaskCount = await TaskRequest.count({ where: { status: 'pending' } });
    const totalGroups = await Group.count();
    const totalUsers = await User.count();

    const message = `👑 <b>Панель администратора</b>\n\n` +
                   `<b>Статистика:</b>\n` +
                   `📋 Ожидающие заявки групп: <b>${pendingCount}</b>\n` +
                   `📝 Ожидающие заявки задач: <b>${pendingTaskCount}</b>\n` +
                   `👥 Активных групп: <b>${totalGroups}</b>\n` +
                   `👤 Пользователей: <b>${totalUsers}</b>\n\n` +
                   `<b>Выберите действие:</b>`;

    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: `📋 Заявки на группы (${pendingCount})`, callback_data: 'admin_pending_requests' }],
          [{ text: `📝 Заявки на задачи (${pendingTaskCount})`, callback_data: 'admin_task_requests' }],
          [{ text: '📊 Полная статистика', callback_data: 'admin_stats' }],
          [{ text: '↩️ Главное меню', callback_data: 'back_to_groups' }]
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

async function showTasksMenu(chatId, user, page = 0) {
  try {
    const tasksPerPage = 5;
    
    const userWithTasks = await User.findOne({
      where: { id: user.id },
      include: [{
        model: Task,
        through: {
          where: { userId: user.id }
        },
        include: [{
          model: User,
          as: 'creator',
          attributes: ['firstName', 'lastName']
        }],
        order: [
          ['deadline', 'ASC'],
          ['priority', 'DESC']
        ]
      }]
    });

    const tasks = userWithTasks?.Tasks || [];
    const now = new Date();
    
    const pendingTasks = tasks
      .filter(task => task.UserTask.status === 'pending' && new Date(task.deadline) > now)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    
    const inProgressTasks = tasks
      .filter(task => task.UserTask.status === 'in_progress')
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    
    const completedTasks = tasks
      .filter(task => task.UserTask.status === 'completed')
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    
    const overdueTasks = tasks
      .filter(task => task.UserTask.status === 'overdue' || new Date(task.deadline) < now)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    let message = '📋 <b>Ваши задачи</b>\n\n';
    
    if (pendingTasks.length > 0) {
      message += '🟡 <b>Ожидающие:</b>\n';
      pendingTasks.forEach((task, index) => {
        const daysLeft = Math.ceil((new Date(task.deadline) - now) / (1000 * 60 * 60 * 24));
        message += `${index + 1}. ${task.title} (${task.subject})\n`;
        message += `   📅 ${new Date(task.deadline).toLocaleDateString()} (осталось ${daysLeft} дн.)\n`;
        message += `   👤 ${task.creator.firstName}\n\n`;
      });
    }
    
    if (inProgressTasks.length > 0) {
      message += '🔵 <b>В процессе:</b>\n';
      inProgressTasks.forEach((task, index) => {
        const daysLeft = Math.ceil((new Date(task.deadline) - now) / (1000 * 60 * 60 * 24));
        message += `${index + 1}. ${task.title} (${task.subject})\n`;
        message += `   📅 ${new Date(task.deadline).toLocaleDateString()} (осталось ${daysLeft} дн.)\n\n`;
      });
    }
    
    if (overdueTasks.length > 0) {
      message += '🔴 <b>Просроченные:</b>\n';
      overdueTasks.forEach((task, index) => {
        const daysOverdue = Math.ceil((now - new Date(task.deadline)) / (1000 * 60 * 60 * 24));
        message += `${index + 1}. ${task.title} (${task.subject})\n`;
        message += `   ⚠️ Просрочено на ${daysOverdue} дней\n\n`;
      });
    }
    
    if (completedTasks.length > 0) {
      message += '✅ <b>Выполненные:</b>\n';
      completedTasks.slice(0, 3).forEach((task, index) => {
        message += `${index + 1}. ${task.title} (${task.subject})\n`;
        message += `   ✔️ ${new Date(task.completedAt).toLocaleDateString()}\n\n`;
      });
    }
    
    if (tasks.length === 0) {
      message = 'У вас пока нет задач.\n\nДобавьте свою первую задачу!';
    }

    const keyboard = {
      inline_keyboard: []
    };

    const allTasks = [...pendingTasks, ...inProgressTasks, ...overdueTasks];
    const startIndex = page * tasksPerPage;
    const endIndex = startIndex + tasksPerPage;
    const pageTasks = allTasks.slice(startIndex, endIndex);

    pageTasks.forEach(task => {
      const statusIcon = task.UserTask.status === 'completed' ? '✅' :
                        task.UserTask.status === 'overdue' ? '🔴' :
                        task.UserTask.status === 'in_progress' ? '🔵' : '🟡';
      
      keyboard.inline_keyboard.push([{
        text: `${statusIcon} ${task.title.substring(0, 20)}...`,
        callback_data: `view_task_${task.id}`
      }]);
    });

    const navButtons = [];
    if (page > 0) {
      navButtons.push({ text: '⬅️ Назад', callback_data: `tasks_page_${page - 1}` });
    }
    if (endIndex < allTasks.length) {
      navButtons.push({ text: 'Вперед ➡️', callback_data: `tasks_page_${page + 1}` });
    }
    if (navButtons.length > 0) {
      keyboard.inline_keyboard.push(navButtons);
    }

    keyboard.inline_keyboard.push([
      { text: '➕ Добавить задачу', callback_data: 'add_task' },
      { text: '📊 Статистика', callback_data: 'task_stats' }
    ]);
    
    keyboard.inline_keyboard.push([
      { text: '↩️ Назад в меню', callback_data: 'back_to_main' }
    ]);

    if (user.isAdmin) {
      const pendingTaskRequests = await TaskRequest.count({ 
        where: { status: 'pending' }
      });
      keyboard.inline_keyboard.push([
        { text: `👑 Запросы на задачи (${pendingTaskRequests})`, callback_data: 'task_requests_admin' }
      ]);
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Ошибка показа задач:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке задач.');
  }
}

async function startAddTask(chatId, user, messageId = null) {
  try {
    const userWithGroups = await User.findOne({
      where: { id: user.id },
      include: [{
        model: Group,
        through: { attributes: [] },
        where: { isActive: true }
      }]
    });

    const groups = userWithGroups?.Groups || [];
    
    if (groups.length === 0) {
      const message = 'Сначала присоединитесь к группе, чтобы добавлять задачи.';
      if (messageId) {
        await bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Выбрать группу', callback_data: 'back_to_groups' }]
            ]
          }
        });
      } else {
        await bot.sendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Выбрать группу', callback_data: 'back_to_groups' }]
            ]
          }
        });
      }
      return;
    }

    userStates.set(chatId, {
      state: USER_STATES.AWAITING_TASK_TITLE,
      selectedGroups: groups.map(g => ({ id: g.id, name: g.name }))
    });

    const keyboard = {
      inline_keyboard: []
    };

    groups.forEach(group => {
      keyboard.inline_keyboard.push([{
        text: group.name,
        callback_data: `select_group_for_task_${group.id}`
      }]);
    });

    keyboard.inline_keyboard.push([
      { text: 'Отмена', callback_data: 'back_to_tasks' }
    ]);

    const message = 'Выберите группу для добавления задачи:';

    if (messageId) {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard
      });
    } else {
      await bot.sendMessage(chatId, message, {
        reply_markup: keyboard
      });
    }

  } catch (error) {
    console.error('Ошибка начала добавления задачи:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
}

async function showTaskDetails(chatId, taskId, user, messageId = null) {
  try {
    const task = await Task.findOne({
      where: { id: taskId },
      include: [
        { model: User, as: 'creator', attributes: ['firstName', 'lastName', 'username'] },
        { model: Group, as: 'group', attributes: ['name'] },
        {
          model: User,
          through: {
            where: { userId: user.id }
          },
          attributes: ['id']
        }
      ]
    });

    if (!task) {
      throw new Error('Задача не найдена');
    }

    const userTask = task.Users && task.Users[0] ? task.Users[0].UserTask : null;
    const now = new Date();
    const deadline = new Date(task.deadline);
    const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    
    let statusText = '';
    let statusEmoji = '';
    
    switch(userTask?.status || task.status) {
      case 'completed':
        statusText = '✅ Выполнена';
        statusEmoji = '✅';
        break;
      case 'in_progress':
        statusText = '🔵 В процессе';
        statusEmoji = '🔵';
        break;
      case 'overdue':
        statusText = '🔴 Просрочена';
        statusEmoji = '🔴';
        break;
      default:
        statusText = daysLeft <= 3 ? '🟡 Срочно' : '🟡 Ожидает';
        statusEmoji = daysLeft <= 3 ? '🟡' : '🟡';
    }

    let message = `${statusEmoji} <b>${task.title}</b>\n\n`;
    message += `<b>Предмет:</b> ${task.subject}\n`;
    if (task.description) {
      message += `<b>Описание:</b> ${task.description}\n`;
    }
    message += `<b>Статус:</b> ${statusText}\n`;
    message += `<b>Приоритет:</b> ${getPriorityText(task.priority)}\n`;
    message += `<b>Дедлайн:</b> ${deadline.toLocaleDateString()} ${deadline.toLocaleTimeString()}\n`;
    message += `<b>Осталось дней:</b> ${daysLeft > 0 ? daysLeft : 'Просрочено'}\n`;
    message += `<b>Создатель:</b> ${task.creator.firstName}\n`;
    if (task.group) {
      message += `<b>Группа:</b> ${task.group.name}\n`;
    }
    message += `<b>Тип:</b> ${task.scope === 'personal' ? 'Личная' : 'Групповая'}\n`;

    const keyboard = {
      inline_keyboard: []
    };

    if (userTask?.status !== 'completed') {
      if (userTask?.status === 'in_progress') {
        keyboard.inline_keyboard.push([
          { text: '✅ Отметить выполненной', callback_data: `complete_task_${task.id}` }
        ]);
      } else {
        keyboard.inline_keyboard.push([
          { text: '🔵 Начать выполнение', callback_data: `start_task_${task.id}` },
          { text: '✅ Выполнить', callback_data: `complete_task_${task.id}` }
        ]);
      }
    }

    if (task.creatorId === user.id || user.isAdmin) {
      keyboard.inline_keyboard.push([
        { text: '✏️ Редактировать', callback_data: `edit_task_${task.id}` },
        { text: '🗑️ Удалить', callback_data: `delete_task_${task.id}` }
      ]);
    }

    if (task.scope === 'personal' && task.groupId && user.id === task.creatorId) {
      keyboard.inline_keyboard.push([
        { text: '📨 Запросить для группы', callback_data: `request_task_for_group_${task.id}` }
      ]);
    }

    keyboard.inline_keyboard.push([
      { text: '↩️ Назад к задачам', callback_data: 'back_to_tasks' }
    ]);

    if (messageId) {
      try {
        await bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } catch (editError) {
        console.warn('Не удалось отредактировать сообщение, отправляем новое:', editError.message);
        await bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }
    } else {
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }

  } catch (error) {
    console.error('Ошибка показа деталей задачи:', error);
    await bot.sendMessage(chatId, 'Ошибка при загрузке задачи.');
  }
}

function getPriorityText(priority) {
  switch(priority) {
    case 'high': return '🔴 Высокий';
    case 'medium': return '🟡 Средний';
    case 'low': return '🟢 Низкий';
    default: return '🟡 Средний';
  }
}

async function checkDeadlines() {
  try {
    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    const weekDeadlineTasks = await Task.findAll({
      where: {
        deadline: {
          [Sequelize.Op.between]: [now, oneWeekLater]
        },
        status: {
          [Sequelize.Op.in]: ['pending', 'in_progress']
        }
      },
      include: [{
        model: User,
        through: {
          where: {
            status: {
              [Sequelize.Op.in]: ['pending', 'in_progress']
            }
          }
        }
      }]
    });

    const urgentDeadlineTasks = await Task.findAll({
      where: {
        deadline: {
          [Sequelize.Op.between]: [now, threeDaysLater]
        },
        status: {
          [Sequelize.Op.in]: ['pending', 'in_progress']
        }
      },
      include: [{
        model: User,
        through: {
          where: {
            status: {
              [Sequelize.Op.in]: ['pending', 'in_progress']
            }
          }
        }
      }]
    });

    for (const task of weekDeadlineTasks) {
      const deadlineDate = new Date(task.deadline);
      const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      
      if (daysLeft === 7) {
        for (const user of task.Users) {
          await bot.sendMessage(user.telegramId, 
            `⏰ <b>Напоминание о задаче</b>\n\n` +
            `<b>Задача:</b> ${task.title}\n` +
            `<b>Предмет:</b> ${task.subject}\n` +
            `<b>Дедлайн:</b> ${deadlineDate.toLocaleDateString()}\n` +
            `<b>Осталось:</b> 7 дней\n\n` +
            `Не забудьте выполнить задачу вовремя!`,
            { parse_mode: 'HTML' }
          );
        }
      }
    }

    for (const task of urgentDeadlineTasks) {
      const deadlineDate = new Date(task.deadline);
      const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      
      if (daysLeft <= 3 && daysLeft > 0) {
        for (const user of task.Users) {
          await bot.sendMessage(user.telegramId, 
            `⚠️ <b>Срочное напоминание!</b>\n\n` +
            `<b>Задача:</b> ${task.title}\n` +
            `<b>Предмет:</b> ${task.subject}\n` +
            `<b>Дедлайн:</b> ${deadlineDate.toLocaleDateString()}\n` +
            `<b>Осталось:</b> ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft <= 4 ? 'дня' : 'дней'}\n\n` +
            `Задача скоро должна быть выполнена!`,
            { parse_mode: 'HTML' }
          );
        }
      }
    }

    const overdueTasks = await Task.findAll({
      where: {
        deadline: {
          [Sequelize.Op.lt]: now
        },
        status: {
          [Sequelize.Op.in]: ['pending', 'in_progress']
        }
      },
      include: [{
        model: User,
        through: {
          where: {
            status: {
              [Sequelize.Op.in]: ['pending', 'in_progress']
            }
          }
        }
      }]
    });

    for (const task of overdueTasks) {
      const deadlineDate = new Date(task.deadline);
      await task.update({ status: 'overdue' });
      
      for (const user of task.Users) {
        await UserTask.update(
          { status: 'overdue' },
          { where: { userId: user.id, taskId: task.id } }
        );
        
        await bot.sendMessage(user.telegramId,
          `🔴 <b>Задача просрочена!</b>\n\n` +
          `<b>Задача:</b> ${task.title}\n` +
          `<b>Предмет:</b> ${task.subject}\n` +
          `<b>Дедлайн был:</b> ${deadlineDate.toLocaleDateString()}\n\n` +
          `Пожалуйста, выполните задачу как можно скорее!`,
          { parse_mode: 'HTML' }
        );
      }
    }

  } catch (error) {
    console.error('Ошибка проверки дедлайнов:', error);
  }
}

async function showTaskRequestsAdmin(chatId, messageId = null) {
  try {
    const pendingRequests = await TaskRequest.findAll({
      where: { status: 'pending' },
      include: [
        {
          model: Task,
          as: 'task',
          attributes: ['title', 'subject', 'description', 'deadline']
        },
        {
          model: User,
          as: 'requester',
          attributes: ['firstName', 'lastName', 'username']
        },
        {
          model: Group,
          as: 'group',
          attributes: ['name']
        }
      ],
      order: [['requestedAt', 'ASC']]
    });

    if (pendingRequests.length === 0) {
      const message = 'Нет ожидающих заявок на задачи.';
      const keyboard = {
        inline_keyboard: [
          [{ text: 'Назад в админку', callback_data: 'admin_back' }],
          [{ text: 'Обновить', callback_data: 'admin_task_requests' }]
        ]
      };

      if (messageId) {
        try {
          await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: keyboard
          });
        } catch (editError) {
          await bot.sendMessage(chatId, message, { reply_markup: keyboard });
        }
      } else {
        await bot.sendMessage(chatId, message, { reply_markup: keyboard });
      }
      return;
    }

    let message = '📋 <b>Заявки на добавление задач для групп:</b>\n\n';
    const keyboard = { inline_keyboard: [] };

    pendingRequests.forEach((request, index) => {
      const userInfo = request.requester.username 
        ? `@${request.requester.username}`
        : `${request.requester.firstName}${request.requester.lastName ? ' ' + request.requester.lastName : ''}`;
      
      message += `<b>Заявка #${request.id}</b>\n`;
      message += `<b>Задача:</b> ${request.task.title}\n`;
      message += `<b>Предмет:</b> ${request.task.subject}\n`;
      if (request.task.description) {
        message += `<b>Описание:</b> ${request.task.description.substring(0, 100)}${request.task.description.length > 100 ? '...' : ''}\n`;
      }
      message += `<b>Дедлайн:</b> ${new Date(request.task.deadline).toLocaleDateString()}\n`;
      message += `<b>Группа:</b> ${request.group.name}\n`;
      message += `<b>От:</b> ${userInfo}\n`;
      message += `<b>Дата заявки:</b> ${request.requestedAt.toLocaleDateString()}\n\n`;

      keyboard.inline_keyboard.push([
        { text: `✅ Одобрить`, callback_data: `admin_approve_task_${request.id}` },
        { text: `❌ Отклонить`, callback_data: `admin_reject_task_${request.id}` }
      ]);
    });

    keyboard.inline_keyboard.push([
      { text: '🔄 Обновить', callback_data: 'admin_task_requests' },
      { text: '↩️ Назад в админку', callback_data: 'admin_back' }
    ]);

    if (messageId) {
      try {
        await bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } catch (editError) {
        console.warn('Не удалось отредактировать сообщение, отправляем новое:', editError.message);
        await bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }
    } else {
      await bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }

  } catch (error) {
    console.error('Ошибка показа заявок на задачи админу:', error);
    let errorMessage = 'Ошибка при загрузке заявок на задачи.';
    
    if (error.name === 'SequelizeEagerLoadingError') {
      errorMessage = 'Ошибка загрузки данных. Возможно, проблема с моделями в базе данных.';
      console.error('Проверьте связи моделей TaskRequest:', error);
    }
    
    await bot.sendMessage(chatId, errorMessage);
  }
}

async function handleDeleteTask(chatId, taskId, user, messageId) {
  try {
    const task = await Task.findOne({
      where: { id: taskId },
      include: [
        { model: User, as: 'creator' }
      ]
    });

    if (!task) {
      await bot.answerCallbackQuery({ text: 'Задача не найдена!' });
      return;
    }

    if (task.creatorId !== user.id && !user.isAdmin) {
      await bot.answerCallbackQuery({ text: 'Вы не можете удалить эту задачу!' });
      return;
    }

    await UserTask.destroy({ where: { taskId: taskId } });
    await TaskRequest.destroy({ where: { taskId: taskId } });
    await task.destroy();

    await bot.answerCallbackQuery({ text: 'Задача удалена!' });
    
    await bot.deleteMessage(chatId, messageId);
    await showTasksMenu(chatId, user, 0);
    
  } catch (error) {
    console.error('Ошибка удаления задачи:', error);
    await bot.answerCallbackQuery({ text: 'Ошибка при удалении задачи!' });
  }
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const user = await getOrCreateUser(msg.from);
    
    const welcomeMessage = `Привет, ${user.firstName}!\n\nДобро пожаловать в менеджер групп!\n\nВыберите нужную группу из списка или создайте новую.`;
    
    await bot.sendMessage(chatId, welcomeMessage);
    await showGroupSelection(chatId, user, 0);
  } catch (error) {
    console.error('Ошибка в /start:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `Справка по командам:\n\n/start - Начать работу с ботом\n/help - Получить справку по командам\n/groups - Показать список групп\n/tasks - Показать список задач\n/my_groups - Показать мои группы\n/admin - Панель администратора`;
  
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

bot.onText(/\/tasks/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const user = await getOrCreateUser(msg.from);
    await showTasksMenu(chatId, user, 0);
  } catch (error) {
    console.error('Ошибка в /tasks:', error);
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

    if (data.startsWith('delete_task_')) {
      const taskId = parseInt(data.split('_')[2]);
      await handleDeleteTask(chatId, taskId, user, message.message_id);
      return;
    }
    
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
    else if (data.startsWith('admin_approve_task_')) {
      try {
        const requestId = parseInt(data.split('_')[3]);
        const taskRequest = await TaskRequest.findOne({
          where: { id: requestId },
          include: [
            { model: Task, as: 'task' },
            { model: Group, as: 'group' },
            { model: User, as: 'requester' }
          ]
        });

        if (!taskRequest) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Заявка не найдена!'
          });
          return;
        }

        const groupWithMembers = await Group.findOne({
          where: { id: taskRequest.groupId },
          include: [{
            model: User,
            through: { attributes: [] }
          }]
        });

        if (groupWithMembers && groupWithMembers.Users) {
          for (const member of groupWithMembers.Users) {
            await UserTask.findOrCreate({
              where: {
                userId: member.id,
                taskId: taskRequest.taskId
              },
              defaults: {
                status: 'pending'
              }
            });
          }
        }

        await Task.update(
          {
            scope: 'group',
            isForAllMembers: true,
            groupId: taskRequest.groupId
          },
          { where: { id: taskRequest.taskId } }
        );

        await taskRequest.update({
          status: 'approved',
          processedAt: new Date(),
          approverId: user.id,
          adminNotes: `Одобрено администратором: ${user.firstName} (ID: ${user.id})`
        });

        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Задача добавлена для всей группы!'
        });

        try {
          await bot.sendMessage(
            taskRequest.requester.telegramId,
            `✅ <b>Ваша заявка на добавление задачи одобрена!</b>\n\n` +
            `<b>Задача:</b> ${taskRequest.task.title}\n` +
            `<b>Группа:</b> ${taskRequest.group.name}\n` +
            `<b>Статус:</b> Одобрено\n` +
            `<b>Одобрено:</b> ${user.firstName}\n\n` +
            `Теперь задача доступна всем участникам группы ${taskRequest.group.name}.`,
            { parse_mode: 'HTML' }
          );
        } catch (notifyError) {
          console.error('Ошибка отправки уведомления создателю:', notifyError);
        }

        await showTaskRequestsAdmin(chatId, message.message_id);

      } catch (error) {
        console.error('Ошибка одобрения заявки на задачу:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Ошибка при одобрении заявки!'
        });
      }
    }
    else if (data.startsWith('admin_reject_task_')) {
      try {
        const requestId = parseInt(data.split('_')[3]);
        const taskRequest = await TaskRequest.findOne({
          where: { id: requestId },
          include: [
            { model: Task, as: 'task' },
            { model: Group, as: 'group' },
            { model: User, as: 'requester' }
          ]
        });

        if (!taskRequest) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Заявка не найдена!'
          });
          return;
        }

        await taskRequest.update({
          status: 'rejected',
          processedAt: new Date(),
          approverId: user.id,
          adminNotes: `Отклонено администратором: ${user.firstName} (ID: ${user.id})`
        });

        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Заявка на задачу отклонена!'
        });

        try {
          await bot.sendMessage(
            taskRequest.requester.telegramId,
            `❌ <b>Ваша заявка на добавление задачи отклонена</b>\n\n` +
            `<b>Задача:</b> ${taskRequest.task.title}\n` +
            `<b>Группа:</b> ${taskRequest.group.name}\n` +
            `<b>Статус:</b> Отклонено\n` +
            `<b>Отклонил:</b> ${user.firstName}\n\n` +
            `При необходимости свяжитесь с администратором.`,
            { parse_mode: 'HTML' }
          );
        } catch (notifyError) {
          console.error('Ошибка отправки уведомления создателю:', notifyError);
        }

        await showTaskRequestsAdmin(chatId, message.message_id);

      } catch (error) {
        console.error('Ошибка отклонения заявки на задачу:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Ошибка при отклонении заявки!'
        });
      }
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
      const totalTasks = await Task.count();
      const completedTasks = await Task.count({ where: { status: 'completed' } });
      
      const statsMessage = `Полная статистика:\n\n` +
                          `Пользователи: ${totalUsers}\n` +
                          `Группы: ${totalGroups}\n` +
                          `Задачи: ${totalTasks}\n` +
                          `Выполнено задач: ${completedTasks}\n\n` +
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
    else if (data === 'admin_task_requests') {
      await bot.answerCallbackQuery(callbackQuery.id);
      await showTaskRequestsAdmin(chatId, message.message_id);
    }
    else if (data === 'tasks') {
      await bot.deleteMessage(chatId, message.message_id);
      await showTasksMenu(chatId, user, 0);
    }
    else if (data.startsWith('tasks_page_')) {
      const page = parseInt(data.split('_')[2]);
      await bot.deleteMessage(chatId, message.message_id);
      await showTasksMenu(chatId, user, page);
    }
    else if (data === 'add_task') {
      await startAddTask(chatId, user, message.message_id);
    }
    else if (data.startsWith('select_group_for_task_')) {
      const groupId = parseInt(data.split('_')[4]);
      const state = userStates.get(chatId);
      state.selectedGroupId = groupId;
      userStates.set(chatId, { ...state, state: USER_STATES.AWAITING_TASK_TITLE });
      
      await bot.editMessageText('Введите название задачи:', {
        chat_id: chatId,
        message_id: message.message_id
      });
    }
    else if (data.startsWith('view_task_')) {
      const taskId = parseInt(data.split('_')[2]);
      await showTaskDetails(chatId, taskId, user, message.message_id);
    }
    else if (data.startsWith('complete_task_')) {
      const taskId = parseInt(data.split('_')[2]);
      
      await UserTask.update(
        {
          status: 'completed',
          completedAt: new Date()
        },
        {
          where: {
            userId: user.id,
            taskId: taskId
          }
        }
      );
      
      await Task.update(
        { status: 'completed' },
        {
          where: {
            id: taskId,
            scope: 'personal'
          }
        }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Задача отмечена как выполненная!'
      });
      
      await showTaskDetails(chatId, taskId, user, message.message_id);
    }
    else if (data.startsWith('start_task_')) {
      const taskId = parseInt(data.split('_')[2]);
      
      await UserTask.update(
        { status: 'in_progress' },
        {
          where: {
            userId: user.id,
            taskId: taskId
          }
        }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Вы начали выполнение задачи!'
      });
      
      await showTaskDetails(chatId, taskId, user, message.message_id);
    }
    else if (data === 'back_to_tasks') {
      await bot.deleteMessage(chatId, message.message_id);
      await showTasksMenu(chatId, user, 0);
    }
    else if (data === 'back_to_main') {
      await bot.deleteMessage(chatId, message.message_id);
      await showGroupSelection(chatId, user, 0);
    }
    else if (data === 'task_stats') {
      const userTaskStats = await UserTask.findAll({
        where: { userId: user.id },
        attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('status')), 'count']],
        group: ['status']
      });
      
      const totalTasks = await UserTask.count({ where: { userId: user.id } });
      const completedTasks = await UserTask.count({ 
        where: { 
          userId: user.id,
          status: 'completed'
        }
      });
      
      const pendingTasks = await UserTask.count({
        where: {
          userId: user.id,
          status: 'pending'
        }
      });
      
      const overdueTasks = await UserTask.count({
        where: {
          userId: user.id,
          status: 'overdue'
        }
      });
      
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      const statsMessage = `📊 <b>Ваша статистика по задачам</b>\n\n` +
                         `Всего задач: ${totalTasks}\n` +
                         `✅ Выполнено: ${completedTasks}\n` +
                         `🟡 Ожидает: ${pendingTasks}\n` +
                         `🔴 Просрочено: ${overdueTasks}\n` +
                         `📈 Выполнено: ${completionRate}%\n\n` +
                         `Продолжайте в том же духе!`;
      
      await bot.editMessageText(statsMessage, {
        chat_id: chatId,
        message_id: message.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '↩️ Назад к задачам', callback_data: 'back_to_tasks' }]
          ]
        }
      });
    }
    else if (data === 'task_requests_admin') {
      await showTaskRequestsAdmin(chatId, message.message_id);
    }
    else if (data === 'new_subject') {
      try {
        const state = userStates.get(chatId);
        if (!state) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Сессия устарела. Начните создание задачи заново.'
          });
          return;
        }
        
        userStates.set(chatId, {
          ...state,
          state: USER_STATES.AWAITING_NEW_SUBJECT
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
        
        await bot.sendMessage(chatId, 'Введите название нового предмета:');
        
      } catch (error) {
        console.error('Ошибка обработки new_subject:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Произошла ошибка. Попробуйте снова.'
        });
      }
    }
    else if (data === 'select_subject_from_group') {
      try {
        const state = userStates.get(chatId);
        if (!state) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Сессия устарела. Начните создание задачи заново.'
          });
          return;
        }
        
        userStates.set(chatId, {
          ...state,
          state: USER_STATES.AWAITING_TASK_SUBJECT
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(chatId, 'Введите название предмета:');
        
      } catch (error) {
        console.error('Ошибка обработки select_subject_from_group:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Произошла ошибка. Попробуйте снова.'
        });
      }
    }
    else if (data.startsWith('priority_')) {
      try {
        const priority = data.split('_')[1];
        const state = userStates.get(chatId);
        
        if (!state) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Сессия устарела. Начните создание задачи заново.'
          });
          return;
        }
        
        state.taskPriority = priority;
        userStates.set(chatId, {
          ...state,
          state: USER_STATES.AWAITING_TASK_SCOPE
        });
        
        await bot.answerCallbackQuery(callbackQuery.id);
        
        await bot.sendMessage(chatId, 'Выберите тип задачи:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👤 Личная (только для меня)', callback_data: 'scope_personal' }],
              [{ text: '👥 Для группы (требует одобрения)', callback_data: 'scope_group_request' }]
            ]
          }
        });
        
      } catch (error) {
        console.error('Ошибка обработки priority:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Произошла ошибка. Попробуйте снова.'
        });
      }
    }
    else if (data === 'scope_personal') {
      try {
        const state = userStates.get(chatId);
        
        if (!state) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Сессия устарела. Начните создание задачи заново.'
          });
          return;
        }
        
        if (!state.taskTitle || !state.taskSubject || !state.taskDeadline) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Недостаточно данных. Начните создание задачи заново.'
          });
          userStates.delete(chatId);
          return;
        }
        
        const taskData = {
          title: state.taskTitle,
          description: state.taskDescription,
          subject: state.taskSubject,
          deadline: state.taskDeadline,
          priority: state.taskPriority || 'medium',
          scope: 'personal',
          creatorId: user.id,
          groupId: state.selectedGroupId
        };
        
        const task = await Task.create(taskData);
        
        await UserTask.create({
          userId: user.id,
          taskId: task.id,
          status: 'pending'
        });
        
        userStates.delete(chatId);
        
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Задача создана!'
        });
        
        await bot.sendMessage(chatId,
          `✅ <b>Задача создана!</b>\n\n` +
          `<b>Название:</b> ${task.title}\n` +
          `<b>Предмет:</b> ${task.subject}\n` +
          `<b>Дедлайн:</b> ${task.deadline.toLocaleDateString()} ${task.deadline.toLocaleTimeString()}\n` +
          `<b>Приоритет:</b> ${getPriorityText(task.priority)}\n` +
          `<b>Тип:</b> Личная\n\n` +
          `Задача доступна в вашем списке задач.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📋 Перейти к задачам', callback_data: 'tasks' }]
              ]
            }
          }
        );
        
      } catch (error) {
        console.error('Ошибка создания личной задачи:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Ошибка при создании задачи. Попробуйте снова.'
        });
      }
    }
    else if (data === 'scope_group_request') {
      try {
        const state = userStates.get(chatId);
        
        if (!state) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Сессия устарела. Начните создание задачи заново.'
          });
          return;
        }
        
        if (!state.taskTitle || !state.taskSubject || !state.taskDeadline || !state.selectedGroupId) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Недостаточно данных. Начните создание задачи заново.'
          });
          userStates.delete(chatId);
          return;
        }
        
        const taskData = {
          title: state.taskTitle,
          description: state.taskDescription,
          subject: state.taskSubject,
          deadline: state.taskDeadline,
          priority: state.taskPriority || 'medium',
          scope: 'personal',
          creatorId: user.id,
          groupId: state.selectedGroupId
        };
        
        const task = await Task.create(taskData);
        
        await UserTask.create({
          userId: user.id,
          taskId: task.id,
          status: 'pending'
        });
        
        const taskRequest = await TaskRequest.create({
          taskId: task.id,
          groupId: state.selectedGroupId,
          requesterId: user.id,
          status: 'pending'
        });
        
        userStates.delete(chatId);
        
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Заявка на задачу отправлена!'
        });
        
        await bot.sendMessage(chatId,
          `📨 <b>Заявка на задачу отправлена!</b>\n\n` +
          `<b>Название:</b> ${task.title}\n` +
          `<b>Предмет:</b> ${task.subject}\n` +
          `<b>Дедлайн:</b> ${task.deadline.toLocaleDateString()}\n` +
          `<b>Группа:</b> ${state.selectedGroupId}\n` +
          `<b>Тип:</b> Для группы (ожидает одобрения)\n\n` +
          `Заявка отправлена администраторам на рассмотрение.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📋 Перейти к задачам', callback_data: 'tasks' }]
              ]
            }
          }
        );
        
        try {
          const admins = await User.findAll({ where: { isAdmin: true } });
          const group = await Group.findByPk(state.selectedGroupId);
          
          for (const admin of admins) {
            const adminMessage = `📨 <b>Новая заявка на задачу для группы!</b>\n\n` +
                                `<b>Задача:</b> ${task.title}\n` +
                                `<b>Предмет:</b> ${task.subject}\n` +
                                `<b>Группа:</b> ${group?.name || 'Неизвестно'}\n` +
                                `<b>Пользователь:</b> ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}\n` +
                                (user.username ? `<b>Username:</b> @${user.username}\n` : '') +
                                `<b>ID заявки:</b> ${taskRequest.id}\n` +
                                `<b>Время:</b> ${new Date().toLocaleString()}\n\n` +
                                `Для управления заявкой используйте /admin`;
            
            await bot.sendMessage(admin.telegramId, adminMessage, { parse_mode: 'HTML' });
          }
        } catch (adminError) {
          console.error('Ошибка отправки уведомления админам:', adminError);
        }
        
      } catch (error) {
        console.error('Ошибка создания запроса на задачу:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Ошибка при создании заявки. Попробуйте снова.'
        });
      }
    }
    else if (data.startsWith('request_task_for_group_')) {
      try {
        const taskId = parseInt(data.split('_')[4]);
        const task = await Task.findOne({
          where: { id: taskId },
          include: [{ model: Group, as: 'group' }]
        });
        
        if (!task) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Задача не найдена!'
          });
          return;
        }
        
        if (task.creatorId !== user.id) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Вы не являетесь создателем этой задачи!'
          });
          return;
        }
        
        if (!task.groupId) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'У задачи не указана группа!'
          });
          return;
        }
        
        const existingRequest = await TaskRequest.findOne({
          where: {
            taskId: task.id,
            groupId: task.groupId,
            status: 'pending'
          }
        });
        
        if (existingRequest) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Заявка на эту задачу уже отправлена и ожидает рассмотрения!'
          });
          return;
        }
        
        const taskRequest = await TaskRequest.create({
          taskId: task.id,
          groupId: task.groupId,
          requesterId: user.id,
          status: 'pending'
        });
        
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Заявка на добавление задачи для группы отправлена!'
        });
        
        try {
          const admins = await User.findAll({ where: { isAdmin: true } });
          
          for (const admin of admins) {
            const adminMessage = `📨 <b>Новая заявка на добавление задачи для группы!</b>\n\n` +
                                `<b>Задача:</b> ${task.title}\n` +
                                `<b>Предмет:</b> ${task.subject}\n` +
                                `<b>Группа:</b> ${task.group?.name || 'Неизвестно'}\n` +
                                `<b>Пользователь:</b> ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}\n` +
                                (user.username ? `<b>Username:</b> @${user.username}\n` : '') +
                                `<b>ID заявки:</b> ${taskRequest.id}\n` +
                                `<b>Время:</b> ${new Date().toLocaleString()}\n\n` +
                                `Для управления заявкой используйте /admin`;
            
            await bot.sendMessage(admin.telegramId, adminMessage, { parse_mode: 'HTML' });
          }
        } catch (adminError) {
          console.error('Ошибка отправки уведомления админам:', adminError);
        }
        
        await showTaskDetails(chatId, taskId, user, message.message_id);
        
      } catch (error) {
        console.error('Ошибка создания запроса для группы:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Ошибка при отправке заявки. Попробуйте снова.'
        });
      }
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
      
    } 
    else if (userState && userState.state === USER_STATES.AWAITING_TASK_TITLE) {
      userStates.set(chatId, {
        ...userState,
        state: USER_STATES.AWAITING_TASK_DESCRIPTION,
        taskTitle: text
      });
      
      await bot.sendMessage(chatId, 'Введите описание задачи (или отправьте "-" чтобы пропустить):');
      return;
    }
    
    else if (userState && userState.state === USER_STATES.AWAITING_TASK_DESCRIPTION) {
      userStates.set(chatId, {
        ...userState,
        state: USER_STATES.AWAITING_TASK_SUBJECT,
        taskDescription: text === '-' ? null : text
      });
      
      await bot.sendMessage(chatId, 
        'Введите название предмета для задачи.\n\n' +
        'Например: "Математика", "Программирование", "Английский язык"'
      );
      return;
    }
    
    else if (userState && userState.state === USER_STATES.AWAITING_TASK_SUBJECT) {
      userStates.set(chatId, {
        ...userState,
        state: USER_STATES.AWAITING_TASK_DEADLINE,
        taskSubject: text
      });
      
      await bot.sendMessage(chatId, 
        'Введите дату и время дедлайна в формате ДД.ММ.ГГГГ ЧЧ:ММ\n\n' +
        'Например: 25.12.2024 18:00\n' +
        'Или используйте один из вариантов:\n' +
        '• Завтра 18:00\n' +
        '• Через 3 дня 14:00\n' +
        '• Следующая неделя понедельник 10:00'
      );
      return;
    }
    
    else if (userState && userState.state === USER_STATES.AWAITING_TASK_DEADLINE) {
      const deadline = parseDeadlineDate(text);
      
      if (!deadline) {
        await bot.sendMessage(chatId, 
          'Неверный формат даты. Пожалуйста, используйте один из форматов:\n\n' +
          '• ДД.ММ.ГГГГ ЧЧ:ММ (например: 25.12.2024 18:00)\n' +
          '• Завтра ЧЧ:ММ (например: Завтра 18:00)\n' +
          '• Через N дней ЧЧ:ММ (например: Через 3 дня 14:00)\n' +
          '• Следующая неделя день недели ЧЧ:ММ (например: Следующая неделя понедельник 10:00)'
        );
        return;
      }
      
      if (deadline <= new Date()) {
        await bot.sendMessage(chatId, 'Дедлайн должен быть в будущем. Введите корректную дату:');
        return;
      }
      
      userStates.set(chatId, {
        ...userState,
        state: USER_STATES.AWAITING_TASK_PRIORITY,
        taskDeadline: deadline
      });
      
      await bot.sendMessage(chatId, 
        'Выберите приоритет задачи:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔴 Высокий', callback_data: 'priority_high' }],
              [{ text: '🟡 Средний', callback_data: 'priority_medium' }],
              [{ text: '🟢 Низкий', callback_data: 'priority_low' }]
            ]
          }
        }
      );
      return;
    }
    
    else if (userState && userState.state === USER_STATES.AWAITING_NEW_SUBJECT) {
      try {
        if (!userState.taskTitle || !userState.taskDeadline) {
          await bot.sendMessage(chatId, 'Недостаточно данных. Начните создание задачи заново.');
          userStates.delete(chatId);
          return;
        }
        
        const taskData = {
          title: userState.taskTitle,
          description: userState.taskDescription,
          subject: text.trim(),
          deadline: userState.taskDeadline,
          priority: userState.taskPriority || 'medium',
          scope: 'personal',
          creatorId: user.id,
          groupId: userState.selectedGroupId
        };
        
        const task = await Task.create(taskData);
        
        await UserTask.create({
          userId: user.id,
          taskId: task.id,
          status: 'pending'
        });
        
        userStates.delete(chatId);
        
        await bot.sendMessage(chatId,
          `✅ <b>Задача создана!</b>\n\n` +
          `<b>Название:</b> ${task.title}\n` +
          `<b>Предмет:</b> ${task.subject}\n` +
          `<b>Дедлайн:</b> ${task.deadline.toLocaleDateString()} ${task.deadline.toLocaleTimeString()}\n` +
          `<b>Приоритет:</b> ${getPriorityText(task.priority)}\n\n` +
          `Задача доступна в вашем списке задач.`,
          { parse_mode: 'HTML' }
        );
        
        await showTasksMenu(chatId, user, 0);
        
      } catch (error) {
        console.error('Ошибка создания задачи с новым предметом:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при создании задачи. Попробуйте снова.');
      }
      return;
    }
    
    else {
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