const { Sequelize } = require('sequelize');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('Подключение к БД:', {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    db: process.env.DB_NAME,
    dialect: 'mysql'
});

const sequelize = new Sequelize({
    dialect: 'mysql', 
    host: process.env.DB_HOST || 'localhost',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'taskbot_db',
    logging: false
});

module.exports = sequelize;