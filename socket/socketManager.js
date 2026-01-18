const { Server } = require('socket.io');

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });

    io.on('connection', (socket) => {
        console.log('✨ Client connected to AnjoaurA Live');

        socket.on('viewing_product', (data) => {
            socket.broadcast.emit('product_hot', data);
        });

        socket.on('disconnect', () => console.log('Client disconnected'));
    });

    return io;
};

const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

module.exports = { initSocket, getIO };