const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const { SetIntervalAsyncTimer, setIntervalAsync, clearIntervalAsync } = require('set-interval-async');
const axios = require('axios');

const app = express();

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',    
    database: 'ChatBotTests'
});

connection.connect((err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err);
        return;
    }
    console.log('Успешное подключение к базе данных');
});

const TelegramBot = require('node-telegram-bot-api');
const TOKEN = '8365901414:AAHE4IVcj9G3oLK2pRAoZ02ro6ZcJ_1fjxs';
const bot = new TelegramBot(TOKEN, { polling: true });

const allowedCommands = ['/start', '/help', '/site',
'/creator', '/translate'];


async function translateText(text, targetLang = 'en', sourceLang = 'auto') {
    try {
        const response = await axios.get(`https://translate.googleapis.com/translate_a/single`, {
            params: {
                client: 'gtx',
                sl: sourceLang,
                tl: targetLang,
                dt: 't',
                q: text
            }
        });

        if (response.data && response.data[0]) {
            const translatedText = response.data[0]
                .map(item => item[0])
                .filter(text => text)
                .join('');
            

            const detectedLang = response.data[2] || sourceLang;
            
            return {
                text: translatedText,
                from: detectedLang,
                to: targetLang
            };
        } else {
            throw new Error('Некорректный ответ от сервиса перевода');
        }
        
    } catch (error) {
        console.error('Ошибка перевода:', error);
        throw new Error('Не удалось выполнить перевод. Попробуйте позже.');
    }
}


function getLangCode(langName) {

    const normalizedLang = langName.toLowerCase().trim();
    
    const languages = {
        'русский': 'ru',
        'русского': 'ru',
        'русскому': 'ru',
        'русским': 'ru',
        'русском': 'ru',
        'russian': 'ru',
        'ru': 'ru',
        
        'английский': 'en',
        'английского': 'en',
        'английскому': 'en',
        'английским': 'en',
        'английском': 'en',
        'english': 'en',
        'en': 'en',
        
        'испанский': 'es',
        'испанского': 'es',
        'испанскому': 'es',
        'испанским': 'es',
        'испанском': 'es',
        'spanish': 'es',
        'es': 'es',
        
        'французский': 'fr',
        'французского': 'fr',
        'французскому': 'fr',
        'французским': 'fr',
        'французском': 'fr',
        'french': 'fr',
        'fr': 'fr',
        
        'немецкий': 'de',
        'немецкого': 'de',
        'немецкому': 'de',
        'немецким': 'de',
        'немецком': 'de',
        'german': 'de',
        'de': 'de',
        
        'китайский': 'zh',
        'китайского': 'zh',
        'китайскому': 'zh',
        'китайским': 'zh',
        'китайском': 'zh',
        'chinese': 'zh',
        'zh': 'zh',
        
        'японский': 'ja',
        'японского': 'ja',
        'японскому': 'ja',
        'японским': 'ja',
        'японском': 'ja',
        'japanese': 'ja',
        'ja': 'ja',
        
        'корейский': 'ko',
        'корейского': 'ko',
        'корейскому': 'ko',
        'корейским': 'ko',
        'корейском': 'ko',
        'korean': 'ko',
        'ko': 'ko',
        
        'арабский': 'ar',
        'арабского': 'ar',
        'арабскому': 'ar',
        'арабским': 'ar',
        'арабском': 'ar',
        'arabic': 'ar',
        'ar': 'ar',
        
        'итальянский': 'it',
        'итальянского': 'it',
        'итальянскому': 'it',
        'итальянским': 'it',
        'итальянском': 'it',
        'italian': 'it',
        'it': 'it',
        

        'португальский': 'pt',
        'португальского': 'pt',
        'португальскому': 'pt',
        'португальским': 'pt',
        'португальском': 'pt',
        'portuguese': 'pt',
        'pt': 'pt',
        

        'украинский': 'uk',
        'украинского': 'uk',
        'украинскому': 'uk',
        'украинским': 'uk',
        'украинском': 'uk',
        'ukrainian': 'uk',
        'uk': 'uk',
        

        'турецкий': 'tr',
        'турецкого': 'tr',
        'турецкому': 'tr',
        'турецким': 'tr',
        'турецком': 'tr',
        'turkish': 'tr',
        'tr': 'tr'
    };
    
    const code = languages[normalizedLang];
    if (!code) {
        throw new Error(`Язык "${langName}" не поддерживается. Используйте: русский, английский, испанский, французский, немецкий, китайский, японский, корейский`);
    }
    return code;
}

function updateUserLastMessage(userId) {
    const query = `
        INSERT INTO Users (id, lastMessage)
        VALUES (?, NOW())
        ON DUPLICATE KEY UPDATE lastMessage = NOW()
    `;
   
    connection.query(query, [userId], (error, results) => {
        if (error) {
            console.error('Ошибка при обновлении пользователя:', error);
        } else {
            if (results.affectedRows > 0) {
                console.log(`Обновлена запись пользователя ${userId}`);
            }
        }
    });
}

bot.onText(/\/translate(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    updateUserLastMessage(chatId);
    
    if (!match[1]) {
        const helpText = `
*Команда перевода*

Использование:
• /translate текст - перевести на английский
• /translate на язык: текст - перевести на указанный язык
• /translate с языка на язык: текст - перевести между языками

*Примеры:*
\`/translate Привет, как дела?\`
\`/translate на английский: Привет, как дела?\`
\`/translate с русского на испанский: Доброе утро\`

*Доступные языки:* русский, английский, испанский, французский, немецкий, китайский, японский, корейский, арабский, итальянский, португальский
        `;
        
        bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
        return;
    }
    
    const inputText = match[1].trim();
    
    try {

        const processingMsg = await bot.sendMessage(chatId, 'Перевод...');
        
        let targetLang = 'en'; 
        let sourceLang = 'auto'; 
        let textToTranslate = inputText;

        if (inputText.toLowerCase().startsWith('на ')) {
            const matchResult = inputText.toLowerCase().match(/на\s+([^:]+):\s*(.+)/);
            if (matchResult) {
                targetLang = getLangCode(matchResult[1].trim());
                textToTranslate = matchResult[2].trim();
            }
        } else if (inputText.toLowerCase().startsWith('с ')) {
            const matchResult = inputText.toLowerCase().match(/с\s+([^\\s]+)\s+на\s+([^:]+):\s*(.+)/);
            if (matchResult) {
                sourceLang = getLangCode(matchResult[1].trim());
                targetLang = getLangCode(matchResult[2].trim());
                textToTranslate = matchResult[3].trim();
            } else {

                const parts = inputText.substring(2).split(' на ');
                if (parts.length >= 2) {
                    const sourcePart = parts[0].trim();
                    const targetAndText = parts[1].split(':');
                    if (targetAndText.length >= 2) {
                        sourceLang = getLangCode(sourcePart);
                        targetLang = getLangCode(targetAndText[0].trim());
                        textToTranslate = targetAndText.slice(1).join(':').trim();
                    }
                }
            }
        }
        
        if (!textToTranslate) {
            bot.editMessageText('Ошибка: Не указан текст для перевода', {
                chat_id: chatId,
                message_id: processingMsg.message_id
            });
            return;
        }
        

        if (textToTranslate.length > 500) {
            bot.editMessageText('Ошибка: Текст слишком длинный (максимум 500 символов)', {
                chat_id: chatId,
                message_id: processingMsg.message_id
            });
            return;
        }
        

        const translation = await translateText(textToTranslate, targetLang, sourceLang);

        if (!translation.text) {
            throw new Error('Получен пустой перевод');
        }
        
        const resultText = `
*Перевод:*

*Исходный текст (${translation.from}):*
${textToTranslate}

*Перевод (${translation.to}):*
${translation.text}
        `;
        
        bot.editMessageText(resultText, {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'Markdown'
        });
        
    } catch (error) {
        console.error('Ошибка при переводе:', error);
        
        bot.sendMessage(chatId, ` Ошибка перевода: ${error.message}`);
    }
});


bot.onText(/^\!tr(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    updateUserLastMessage(chatId);
    
    if (!match[1]) {
        bot.sendMessage(chatId, 'Использование: `!tr текст` - быстрый перевод на английский', { parse_mode: 'Markdown' });
        return;
    }
    
    const textToTranslate = match[1].trim();
    
    try {

        if (textToTranslate.length > 500) {
            bot.sendMessage(chatId, 'Ошибка: Текст слишком длинный (максимум 500 символов)');
            return;
        }
        
        const translation = await translateText(textToTranslate, 'en');
        

        if (!translation.text) {
            throw new Error('Получен пустой перевод');
        }
        
        const resultText = `
*Быстрый перевод:*
${translation.text}
        `;
        bot.sendMessage(chatId, resultText, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('Ошибка при быстром переводе:', error);
        bot.sendMessage(chatId, `Ошибка перевода: ${error.message}`);
    }
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = `
Мегапуперсупер Переводчик!

Используйте:
• /translate - помощь по переводу
• !tr текст - быстрый перевод на английский

Пример: /translate с русского на испанский: Доброе утро
    `;
    

    updateUserLastMessage(chatId);
    
    bot.sendMessage(chatId, welcomeText);
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `
Список доступных команд:
/start - Начать работу с ботом
/help - Показать это сообщение
/site - Отправляет в чат ссылку на сайт октагона
/creator - Показать информацию о создателе бота
/translate - Переводчик текста
!tr - Быстрый перевод на английский (использование: !tr текст)

*Примеры перевода:*
• /translate Привет мир
• /translate на французский: Как дела?
• /translate с русского на немецкий: Доброе утро
    `;
    

    updateUserLastMessage(chatId);
    
    bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

bot.onText(/\/site/, (msg) => {
    const chatId = msg.chat.id;
    const siteUrl = 'https://octagon-students.ru/';
    const siteText = `Сайт Октагона: ${siteUrl}`;
    

    updateUserLastMessage(chatId);
    
    bot.sendMessage(chatId, siteText);
});

bot.onText(/\/creator/, (msg) => {
    const chatId = msg.chat.id;
    const creatorName = 'Нефедьев Евгений Алексеевич';
    const creatorText = `Создатель бота: ${creatorName}`;


    updateUserLastMessage(chatId);
    
    bot.sendMessage(chatId, creatorText);
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    

    updateUserLastMessage(chatId);
    
    const isAllowedCommand = allowedCommands.some(command =>
        msg.text.toLowerCase() === command.toLowerCase() ||
        msg.text.toLowerCase().startsWith(command.toLowerCase() + '@') ||
        msg.text.toLowerCase().startsWith('/translate') ||
        msg.text.toLowerCase().startsWith('!tr')
    );
    
    if (!isAllowedCommand && msg.text.startsWith('/')) {
        const errorText = `
Ошибка: Неизвестная команда

Доступные команды:
/help - Список команд с описанием  
/site - Ссылка на сайт Октагона
/creator - Информация о создателе
/translate - Переводчик текста
!tr - Быстрый перевод на английский

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