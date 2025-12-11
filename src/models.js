const { DataTypes } = require('sequelize');
const sequelize = require('./db');

const User = sequelize.define('User', {
    telegramId: { type: DataTypes.BIGINT, unique: true, allowNull: false },
    username: { type: DataTypes.STRING },
    currentGroupId: { type: DataTypes.INTEGER, allowNull: true },
    state: { type: DataTypes.TEXT, allowNull: true },
    notificationsEnabled: { type: DataTypes.BOOLEAN, defaultValue: true }
});

const Group = sequelize.define('Group', {
    name: { type: DataTypes.STRING, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const GroupUser = sequelize.define('GroupUser', {
    role: { type: DataTypes.ENUM('participant', 'curator'), defaultValue: 'participant' }
});

const Subject = sequelize.define('Subject', {
    name: { type: DataTypes.STRING, allowNull: false },
    isPrivate: { type: DataTypes.BOOLEAN, defaultValue: false },
    isApproved: { type: DataTypes.BOOLEAN, defaultValue: true }
});

const Task = sequelize.define('Task', {
    title: { type: DataTypes.STRING, allowNull: false },
    deadline: { type: DataTypes.DATE, allowNull: false },
    isPrivate: { type: DataTypes.BOOLEAN, defaultValue: false },
    isCompleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    isApproved: { type: DataTypes.BOOLEAN, defaultValue: true },
    creatorId: { type: DataTypes.INTEGER }
});

const TaskCompletion = sequelize.define('TaskCompletion', {
    isCompleted: { type: DataTypes.BOOLEAN, defaultValue: false }
});


User.belongsToMany(Group, { through: GroupUser });
Group.belongsToMany(User, { through: GroupUser });

Group.hasMany(Subject);
Subject.belongsTo(Group);

Subject.hasMany(Task);
Task.belongsTo(Subject);

Group.hasMany(Task);
Task.belongsTo(Group);

User.hasMany(Task, { foreignKey: 'creatorId', as: 'createdTasks' });
Task.belongsTo(User, { foreignKey: 'creatorId', as: 'creator' });

User.belongsToMany(Task, { through: TaskCompletion, as: 'assignedTasks' });
Task.belongsToMany(User, { through: TaskCompletion, as: 'assignees' });

module.exports = { sequelize, User, Group, GroupUser, Subject, Task, TaskCompletion };