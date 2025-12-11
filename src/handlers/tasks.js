const bot = require('../bot');
const moment = require('moment');
const { Op } = require('sequelize');
const { User, Task, Subject, TaskCompletion } = require('../models');
const { cancelKb, isCurator } = require('../utils');

async function startTaskCreation(user) {
    if (!user.currentGroupId) return bot.sendMessage(user.telegramId, 'Сначала выберите группу!');
    
    user.state = JSON.stringify({ step: 'add_task_title' });
    await user.save();
    bot.sendMessage(user.telegramId, 'Введите название задачи:', cancelKb);
}

async function showTasks(user) {
    if (!user.currentGroupId) return bot.sendMessage(user.telegramId, 'Выберите группу.');

    const tasks = await Task.findAll({
        where: {
            GroupId: user.currentGroupId,
            [Op.or]: [
                { isPrivate: false, isApproved: true },
                { isPrivate: true, creatorId: user.id }
            ],
            deadline: { [Op.gte]: new Date() }
        },
        include: [{ model: Subject }],
        order: [['deadline', 'ASC']]
    });

    if (!tasks.length) return bot.sendMessage(user.telegramId, 'Задач нет.');

    for (const task of tasks) {
        let isDone = false;
        if (task.isPrivate) isDone = task.isCompleted;
        else {
            const done = await TaskCompletion.findOne({ where: { UserId: user.id, TaskId: task.id } });
            if (done && done.isCompleted) isDone = true;
        }

        if (isDone) continue; 

        const deadline = moment(task.deadline).format('DD.MM HH:mm');
        bot.sendMessage(user.telegramId, ` ${task.title}\n ${task.Subject?.name}\n ${deadline}`, {
            reply_markup: { inline_keyboard: [[{ text: 'Выполнено', callback_data: `done_task_${task.id}` }]] }
        });
    }
}

module.exports = async function (query, user, data) {
    const chatId = user.telegramId;

    if (data.startsWith('sel_sbj_')) {
        const subjId = data.split('_')[2];
        const state = JSON.parse(user.state);
        state.subjectId = subjId;
        
        const isCur = await isCurator(user.id, user.currentGroupId);
        
        state.step = 'finish_task';
        user.state = JSON.stringify(state);
        await user.save();

        const buttons = [[{ text: 'Для себя', callback_data: 'tsk_scp_self' }]];
        if (isCur) buttons.push([{ text: 'Для всей группы', callback_data: 'tsk_scp_force' }]);
        else buttons.push([{ text: 'Запрос куратору', callback_data: 'tsk_scp_req' }]);

        bot.sendMessage(chatId, 'Для кого задача?', { reply_markup: { inline_keyboard: buttons } });
    }

    if (data === 'add_new_sbj') {
        const state = JSON.parse(user.state);
        state.step = 'create_subject_name';
        user.state = JSON.stringify(state);
        await user.save();
        bot.sendMessage(chatId, 'Название предмета:', cancelKb);
    }

    if (data.startsWith('tsk_scp_')) {
        const type = data.split('_')[2];
        const state = JSON.parse(user.state);

        let subjectId = state.subjectId;

        if (state.newSubjectName) {
            const sbj = await Subject.create({
                name: state.newSubjectName,
                GroupId: user.currentGroupId,
                isPrivate: type === 'self',
                isApproved: (type === 'self' || isCur)
            });
            subjectId = sbj.id;
        }

        const isPrivate = type === 'self';
        const isApproved = isPrivate; 

        await Task.create({
            title: state.title,
            deadline: state.date,
            SubjectId: subjectId,
            GroupId: user.currentGroupId,
            creatorId: user.id, 
            isPrivate,
            isApproved
        });

        bot.deleteMessage(chatId, query.message.message_id);
        bot.sendMessage(chatId, isApproved ? 'Задача создана!' : 'Отправлено на модерацию.');
        
        user.state = null;
        await user.save();
    }

    if (data.startsWith('done_task_')) {
        const taskId = data.split('_')[2];
        const task = await Task.findByPk(taskId);
        
        if (task.isPrivate) {
            task.isCompleted = true;
            await task.save();
        } else {
            await TaskCompletion.findOrCreate({
                where: { UserId: user.id, TaskId: taskId },
                defaults: { isCompleted: true }
            });
        }
        bot.answerCallbackQuery(query.id, { text: 'Выполнено!' });
        bot.deleteMessage(chatId, query.message.message_id);
    }
};

module.exports.startTaskCreation = startTaskCreation;
module.exports.showTasks = showTasks;