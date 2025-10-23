const TelegramBot = require('node-telegram-bot-api')
const TOKEN = '8365901414:AAHE4IVcj9G3oLK2pRAoZ02ro6ZcJ_1fjxs';
const bot = new TelegramBot(TOKEN, { polling: true });

const allowedCommands = ['/start', '/help', '/site', '/creator'];

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = `
Привет Октагон!
    `;
    
    bot.sendMessage(chatId, welcomeText);
});


bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `
Список доступных команд:

/site - Отправляет в чат ссылку на сайт октагона.
/creator - Показать информацию о создателе бота.
    `;
    
    bot.sendMessage(chatId, helpText);
});


bot.onText(/\/site/, (msg) => {
    const chatId = msg.chat.id;
    const siteUrl = 'https://octagon-students.ru/'; 
    const siteText = `Сайт Октагона: ${siteUrl}`;
    
    bot.sendMessage(chatId, siteText);
});


bot.onText(/\/creator/, (msg) => {
    const chatId = msg.chat.id;
    const creatorName = 'Нефедьев Евгений Алексеевич';
    const creatorText = `Создатель бота: ${creatorName}`;
  
    bot.sendMessage(chatId, creatorText);
});


bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    
    const isAllowedCommand = allowedCommands.some(command => 
        msg.text.toLowerCase() === command.toLowerCase() || 
        msg.text.toLowerCase().startsWith(command.toLowerCase() + '@')
    );
    
    
    if (!isAllowedCommand) {
        const errorText = `
Ошибка: Неизвестная команда

Доступные команды:
/help - Список команд с описанием  
/site - Ссылка на сайт Октагона
/creator - Информация о создателе

Пожалуйста, используйте только указанные команды.
        `;
        
        bot.sendMessage(chatId, errorText, { parse_mode: 'Markdown' });
    }
    
});


bot.on('polling_error', (error) => {
    console.log('Polling error:', error);
});

bot.on('webhook_error', (error) => {
    console.log('Webhook error:', error);
});

console.log('Бот запущен и ожидает сообщений...');

