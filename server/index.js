const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { Server } = require('socket.io');
const { initAssistantSocket } = require('./socket/assistantSocket');
const { initRedis } = require('./ai/sessionMemory');
const { ensureVectorIndex } = require('./config/vectorSearch');

dotenv.config();
const { startAutoCancellationJob } = require('./utils/cron-jobs');

const app = express();

// Middleware
const configuredOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim()).filter(Boolean)
    : [];

const defaultOrigins = ['http://localhost:8080', 'http://127.0.0.1:8080'];
const allowedOrigins = [...new Set([...configuredOrigins, ...defaultOrigins])];
const localhostOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const corsOptions = {
    origin: (origin, callback) => {
        // Allow non-browser requests (Postman/curl/server-side jobs)
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        if (localhostOriginPattern.test(origin)) {
            return callback(null, true);
        }

        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).json({ message: 'MediConnect backend is running' });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Database Connection
connectDB().then(async () => {
    // Initialize memory system after DB connects
    await initRedis().catch(e => console.warn('[Startup] Redis init failed:', e?.message));
    await ensureVectorIndex().catch(e => console.warn('[Startup] Vector index init failed:', e?.message));
    console.log('[MediAI] ✅ Memory system initialized');
}).catch(e => console.error('[Startup] DB connection failed:', e?.message));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/prescriptions', require('./routes/prescriptions'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/medical-records', require('./routes/medicalRecords'));
app.use('/api/platform-settings', require('./routes/platformSettings'));

// MediAI Assistant Route
app.use('/api/assistant', require('./routes/assistant'));

const PORT = process.env.PORT || 5000;

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin) || localhostOriginPattern.test(origin)) {
                return callback(null, true);
            }
            return callback(null, false);
        },
        credentials: true,
        methods: ['GET', 'POST'],
    },
});

// Initialize MediAI Socket.IO handler
initAssistantSocket(io);

// Start server only if not running in test environment
if (!process.env.JEST_WORKER_ID) {
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`[MediAI] Socket.IO initialized on port ${PORT}`);
        startAutoCancellationJob();
    });
}

module.exports = app;
