import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { createBackup, verifyBackup, restoreBackup, listBackups } from '../services/backupService.js';

export const backupRouter = Router();


// All backup routes require authentication
backupRouter.use(authenticate);

/**
 * GET /api/backup
 * Lists all historical database backups with file availability and record counts
 */
backupRouter.get('/', requirePermission('backup:manage'), async (_req, res, next) => {
  try {
    const backups = await listBackups();
    res.json({
      success: true,
      data: backups,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/backup/create
 * Creates a new complete WAL-flushed backup snapshot with SHA-256 verification
 */
backupRouter.post('/create', requirePermission('backup:manage'), async (req, res, next) => {
  try {
    const notes = req.body?.notes;
    const backup = await createBackup(req.user!.id, notes);
    res.status(201).json({
      success: true,
      message: 'Database backup created and verified successfully',
      data: backup,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/backup/verify/:id
 * Verifies a backup's SHA-256 checksum and executes SQLite PRAGMA integrity_check
 */
backupRouter.post('/verify/:id', requirePermission('backup:manage'), async (req, res, next) => {
  try {
    const verification = await verifyBackup(req.params.id as string);
    res.json({
      success: true,
      data: verification,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/backup/restore/:id
 * Restores database from a verified backup (Admin-only, requires explicit confirm: true)
 * Automatically takes a pre-restore safety snapshot before modifying database
 */
backupRouter.post('/restore/:id', requireRole('admin'), requirePermission('backup:manage'), async (req, res, next) => {
  try {
    const confirm = Boolean(req.body?.confirm);
    const result = await restoreBackup(req.params.id as string, req.user!.id, confirm);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});
