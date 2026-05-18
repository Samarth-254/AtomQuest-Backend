let ioInstance = null;

const initSocket = (server) => {
  const { Server } = require('socket.io');
  ioInstance = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  ioInstance.on('connection', (socket) => {

    socket.on('join_user_room', (userId) => {
      if (userId) {
        socket.join(`room-user-${userId}`);
      }
    });

    socket.on('join_manager_room', (managerId) => {
      if (managerId) {
        socket.join(`room-manager-${managerId}`);
      }
    });

    socket.on('join_admin_room', () => {
      socket.join('room-admin');
    });

    socket.on('disconnect', () => {
    });
  });

  return ioInstance;
};

const getIo = () => ioInstance;

const emitToUser = (userId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`room-user-${userId}`).emit(event, data);
  }
};

const emitToManager = (managerId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`room-manager-${managerId}`).emit(event, data);
  }
};

const emitToAdmin = (event, data) => {
  if (ioInstance) {
    ioInstance.to('room-admin').emit(event, data);
  }
};

const emitToAll = (event, data) => {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
};

module.exports = {
  initSocket,
  getIo,
  emitToUser,
  emitToManager,
  emitToAdmin,
  emitToAll
};
