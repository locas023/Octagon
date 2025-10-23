const TelegramBot = require('node-telegram-bot-api');
const token = '8365901414:AAHE4IVcj9G3oLK2pRAoZ02ro6ZcJ_1fjxs';
const bot = new TelegramBot(token, {polling: true});


bot.onText(/\/echo (.+)/, (msg, match) => {

  const chatId = msg.chat.id;
  const resp = match[1]; 
  
  bot.sendMessage(chatId, resp);

});


bot.on('message', (msg) => {

  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет, октагон!');

});