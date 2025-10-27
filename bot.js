const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const { SetIntervalAsyncTimer, setIntervalAsync, clearIntervalAsync } = require('set-interval-async');

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
'/creator', '/randomItem', '/deleteItem', '/getItemByID'];


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


function sendRandomItemToUser(userId) {
    const query = 'SELECT * FROM items ORDER BY RAND() LIMIT 1';
    
    connection.query(query, (error, results) => {
        if (error) {
            console.error('Ошибка при получении случайного предмета:', error);
            return;
        }
        
        if (results.length > 0) {
            const item = results[0];
            const responseText = `(${item.id}) - ${item.name}: ${item.desc}`;
            bot.sendMessage(userId, `Вы давно не писали! Вот случайный предмет:\n${responseText}`);
        } else {
            bot.sendMessage(userId, 'Вы давно не писали! К сожалению, в базе данных нет предметов');
        }
    });
}


function checkInactiveUsers() {
    console.log('Проверка неактивных пользователей...');
    
    const query = `
        SELECT id 
        FROM Users 
        WHERE lastMessage < DATE_SUB(NOW(), INTERVAL 2 DAY)
    `;
    
    connection.query(query, (error, results) => {
        if (error) {
            console.error('Ошибка при проверке неактивных пользователей:', error);
            return;
        }
        
        console.log(`Найдено неактивных пользователей: ${results.length}`);
        
        results.forEach(user => {
            console.log(`Отправка randomItem пользователю ${user.id}`);
            sendRandomItemToUser(user.id);
        });
    });
}


function setupDailyTimer() {
    const now = new Date();
    const mskOffset = 3 * 60 * 60 * 1000; 
    const mskTime = new Date(now.getTime() + mskOffset);
    
    let targetTime = new Date(mskTime);
    targetTime.setHours(13, 0, 0, 0);
    
    
    if (mskTime > targetTime) {
        targetTime.setDate(targetTime.getDate() + 1);
    }
    
    const timeUntilTarget = targetTime.getTime() - mskTime.getTime();
    
    console.log(`Таймер установлен, следующая проверка через ${Math.round(timeUntilTarget / 1000 / 60)} минут`);
    
    
    setTimeout(() => {
        checkInactiveUsers();
        
        setIntervalAsync(checkInactiveUsers, 24 * 60 * 60 * 1000);
    }, timeUntilTarget);
}


setupDailyTimer();


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = `
Привет Октагон!
    `;
    

    updateUserLastMessage(chatId);
    
    bot.sendMessage(chatId, welcomeText);
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `
Список доступных команд:
/site - Отправляет в чат ссылку на сайт октагона.
/creator - Показать информацию о создателе бота.
/randomItem - Получить случайный предмет из базы данных
/deleteItem - Удалить предмет по ID (использование: /deleteItem ID)
/getItemByID - Получить предмет по ID (использование: /getItemByID ID)
!qr - Получить qr с помощью ссылки (использование: !qr 'URL-адрес')
!webscr - Генератор скриншотов веб-сайта (использование: !webscr 'URL-адрес')
    `;
    

    updateUserLastMessage(chatId);
    
    bot.sendMessage(chatId, helpText);
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

bot.onText(/\/randomItem/, (msg) => {
    const chatId = msg.chat.id;
    

    updateUserLastMessage(chatId);
    
    const query = 'SELECT * FROM items ORDER BY RAND() LIMIT 1';
    
    connection.query(query, (error, results) => {
        if (error) {
            console.error('Ошибка при выполнении запроса:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении случайного предмета');
            return;
        }
        
        if (results.length > 0) {
            const item = results[0];
            const responseText = `(${item.id}) - ${item.name}: ${item.desc}`;
            bot.sendMessage(chatId, responseText);
        } else {
            bot.sendMessage(chatId, 'В базе данных нет предметов');
        }
    });
});

bot.onText(/\/deleteItem (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const itemId = match[1];
    

    updateUserLastMessage(chatId);
    
    if (!/^\d+$/.test(itemId)) {
        bot.sendMessage(chatId, 'Ошибка: ID должен быть числом');
        return;
    }
    
    const checkQuery = 'SELECT * FROM items WHERE id = ?';
    
    connection.query(checkQuery, [itemId], (error, results) => {
        if (error) {
            console.error('Ошибка при проверке предмета:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при проверке предмета');
            return;
        }
        
        if (results.length === 0) {
            bot.sendMessage(chatId, 'Ошибка: предмет с указанным ID не найден');
            return;
        }
        
        const deleteQuery = 'DELETE FROM items WHERE id = ?';
        
        connection.query(deleteQuery, [itemId], (error, results) => {
            if (error) {
                console.error('Ошибка при удалении предмета:', error);
                bot.sendMessage(chatId, 'Произошла ошибка при удалении предмета');
                return;
            }
            
            if (results.affectedRows > 0) {
                bot.sendMessage(chatId, 'Удачно: предмет успешно удален');
            } else {
                bot.sendMessage(chatId, 'Ошибка: не удалось удалить предмет');
            }
        });
    });
});

bot.onText(/\/getItemByID (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const itemId = match[1];
    

    updateUserLastMessage(chatId);
    
    if (!/^\d+$/.test(itemId)) {
        bot.sendMessage(chatId, 'Ошибка: ID должен быть числом');
        return;
    }
    
    const query = 'SELECT * FROM items WHERE id = ?';
    
    connection.query(query, [itemId], (error, results) => {
        if (error) {
            console.error('Ошибка при выполнении запроса:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении предмета');
            return;
        }
        
        if (results.length > 0) {
            const item = results[0];
            const responseText = `(${item.id}) - ${item.name}: ${item.desc}`;
            bot.sendMessage(chatId, responseText);
        } else {
            bot.sendMessage(chatId, 'Предмет с указанным ID не найден');
        }
    });
});

bot.onText(/^\!qr/, function(msg) {
    console.log(msg);
    var userId = msg.from.id;
    var data = msg.text.substring(3).trim();
    var imageqr = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + data;
    

    updateUserLastMessage(msg.chat.id);
    
    bot.sendMessage(msg.chat.id, "[✏️](" + imageqr + ")Qr код: " + data,{parse_mode : "Markdown"});
});

bot.onText(/^\!webscr/, function(msg) {
    console.log(msg);
    var userId = msg.from.id;
    var url = msg.text.substring(8).trim();
    var image = "https://api.letsvalidate.com/v1/thumbs/?url=" + url + "&width=1280&height=720";
    

    updateUserLastMessage(msg.chat.id);
    
    bot.sendMessage(msg.chat.id, "[📷](" + image + ") Скриншот: " + url,{parse_mode : "Markdown"});
});


bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    

    updateUserLastMessage(chatId);
    
    const isAllowedCommand = allowedCommands.some(command =>
        msg.text.toLowerCase() === command.toLowerCase() ||
        msg.text.toLowerCase().startsWith(command.toLowerCase() + '@') ||
        msg.text.toLowerCase().startsWith('/deleteitem ') ||
        msg.text.toLowerCase().startsWith('/getitembyid ')
    );
    
    if (!isAllowedCommand && msg.text.startsWith('/')) {
        const errorText = `
Ошибка: Неизвестная команда

Доступные команды:
/help - Список команд с описанием  
/site - Ссылка на сайт Октагона
/creator - Информация о создателе
/randomItem - Получить случайный предмет
/deleteItem ID - Удалить предмет по ID
/getItemByID ID - Получить предмет по ID

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