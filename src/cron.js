const cron = require('node-cron');
const moment = require('moment');
const { Op } = require('sequelize');
const { Task, GroupUser, User, TaskCompletion } = require('./models');
const bot = require('./bot');

function initCron() {
    cron.schedule('0 * * * *', async () => {
        console.log('Проверка дедлайнов...');
        
        const tasks = await Task.findAll({
            where: { 
                deadline: { [Op.gt]: new Date() }, 
                isApproved: true 
            }
        });

        for (const task of tasks) {
            const now = moment();
            const dl = moment(task.deadline);
            const diffDays = dl.diff(now, 'days');
            const diffHours = dl.diff(now, 'hours');

            let msg = '';
            
            if (diffDays === 7 && diffHours % 24 === 0) msg = `<b>Напоминание (1 неделя):</b>\n${task.title}`;
            else if (diffDays <= 3 && diffHours % 24 === 0) msg = `<b>СКОРО ДЕДЛАЙН (${diffDays} дн):</b>\n${task.title}`;

            if (!msg) continue;

            if (task.isPrivate) {
                const u = await User.findByPk(task.creatorId);
                if (u && u.notificationsEnabled && !task.isCompleted) {
                    bot.sendMessage(u.telegramId, msg, { parse_mode: 'HTML' }).catch(()=>{});
                }
            } 
            else {
                const users = await GroupUser.findAll({ where: { GroupId: task.GroupId } });
                for (const link of users) {
                    const done = await TaskCompletion.findOne({ where: { UserId: link.UserId, TaskId: task.id, isCompleted: true } });
                    
                    if (!done) {
                        const u = await User.findByPk(link.UserId);
                        if (u && u.notificationsEnabled) {
                            bot.sendMessage(u.telegramId, msg, { parse_mode: 'HTML' }).catch(()=>{});
                        }
                    }
                }
            }
        }
    });
}
module.exports = initCron;