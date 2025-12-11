const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  telegramId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true
  },
  firstName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  username: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastActivity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'users'
});

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  memberCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'groups'
});

const GroupRequest = sequelize.define('GroupRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  groupName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  requestedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  adminNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'group_requests'
});

const UserGroup = sequelize.define('UserGroup', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_groups'
});

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  subject: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  deadline: {
    type: DataTypes.DATE,
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    defaultValue: 'medium'
  },
  scope: {
    type: DataTypes.ENUM('personal', 'group', 'requested'),
    defaultValue: 'personal'
  },
  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'overdue'),
    defaultValue: 'pending'
  },
  isForAllMembers: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  assignedToAll: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  creatorId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'tasks',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

const UserTask = sequelize.define('UserTask', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'overdue'),
    defaultValue: 'pending'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'user_tasks'
});

const TaskRequest = sequelize.define('TaskRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  taskId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  requestedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  adminNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  requesterId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  approverId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'task_requests'
});

User.hasMany(GroupRequest, { foreignKey: 'userId' });
GroupRequest.belongsTo(User, { foreignKey: 'userId' });

User.belongsToMany(Group, { through: UserGroup, foreignKey: 'userId' });
Group.belongsToMany(User, { through: UserGroup, foreignKey: 'groupId' });

Task.belongsTo(User, { foreignKey: 'creatorId', as: 'creator' });
Task.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

User.belongsToMany(Task, { through: UserTask, foreignKey: 'userId' });
Task.belongsToMany(User, { through: UserTask, foreignKey: 'taskId' });

TaskRequest.belongsTo(Task, { foreignKey: 'taskId', as: 'task' });
TaskRequest.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
TaskRequest.belongsTo(User, { foreignKey: 'requesterId', as: 'requester' });
TaskRequest.belongsTo(User, { foreignKey: 'approverId', as: 'approver' });

Task.hasMany(TaskRequest, { foreignKey: 'taskId', as: 'taskRequests' });
Group.hasMany(TaskRequest, { foreignKey: 'groupId', as: 'taskRequests' });
User.hasMany(TaskRequest, { foreignKey: 'requesterId', as: 'requestedTasks' });
User.hasMany(TaskRequest, { foreignKey: 'approverId', as: 'approvedTasks' });

module.exports = {
  sequelize,
  User,
  Group,
  GroupRequest,
  UserGroup,
  Task,
  UserTask,
  TaskRequest
};