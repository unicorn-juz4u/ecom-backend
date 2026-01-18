const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const { initSocket } = require('./socket/socketManager');
const dotenv = require('dotenv');

if (process.env.NODE_ENV === 'production') {
    dotenv.config({ path: './.env.production' });
} else {
    dotenv.config({ path: './.env.development' });
}

// Passport config
require('./config/passport');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io via a separate module
const io = initSocket(server);
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

app.use(
    session({
        secret: 'keyboard cat',
        resave: false,
        saveUninitialized: false,
    })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/checkout', require('./routes/checkout'));

// Database & Server Start
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
    })
    .catch(err => console.log('❌ DB Connection Error:', err));