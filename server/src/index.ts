import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/authRoutes.js';
import { collegeRouter } from './routes/collegeRoutes.js';
import { studentRouter } from './routes/studentRoutes.js';
import { challanRouter } from './routes/challanRoutes.js';
import { paymentRouter } from './routes/paymentRoutes.js';
import { feeRouter } from './routes/feeRoutes.js';
import { reportRouter } from './routes/reportRoutes.js';
import { auditRouter } from './routes/auditRoutes.js';
import { syncRouter } from './routes/syncRoutes.js';
import { staffRouter } from './routes/staffRoutes.js';
import { attendanceRouter } from './routes/attendanceRoutes.js';
import { backupRouter } from './routes/backupRoutes.js';


export const app = express();

// Security Headers
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Tauri desktop or curl)
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    return callback(null, true); // Dev/desktop flexibility
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Workstation-Id', 'X-Idempotency-Key'],
}));

// Rate Limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    errorCode: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    system: 'ZEC Portal',
    college: 'Zakariya Educational Complex (ZEC)',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/college', collegeRouter);
app.use('/api/students', studentRouter);
app.use('/api/challans', challanRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/fees', feeRouter);
app.use('/api/reports', reportRouter);
app.use('/api/audit', auditRouter);
app.use('/api/sync', syncRouter);
app.use('/api/staff', staffRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/backup', backupRouter);


// Centralized Error Handling
app.use(errorHandler);

// Start server if executed directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const isDefaultAny = config.host === '0.0.0.0' || !config.host;
  // Binding without '0.0.0.0' enables dual-stack IPv4/IPv6 on Windows (supporting both 127.0.0.1 and localhost)
  if (isDefaultAny) {
    app.listen(config.port, () => {
      console.log(`🚀 ZEC Portal Server running on http://127.0.0.1:${config.port} & http://localhost:${config.port}`);
      console.log(`🏛️  College: ${config.college.name} (${config.college.shortName})`);
      console.log(`💰 Database: ${config.database.url}`);
    });
  } else {
    app.listen(config.port, config.host, () => {
      console.log(`🚀 ZEC Portal Server running on http://${config.host}:${config.port}`);
      console.log(`🏛️  College: ${config.college.name} (${config.college.shortName})`);
      console.log(`💰 Database: ${config.database.url}`);
    });
  }
}
