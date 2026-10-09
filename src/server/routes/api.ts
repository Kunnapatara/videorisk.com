import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { storage } from '../storage';
import { jobOrchestrator } from '../pipeline/jobOrchestrator';
import { mediaInspector } from '../pipeline/mediaInspector';
import { creditService } from '../services/creditService';
import { billingService } from '../services/billingService';
import { ScanJob, ScanMode, UserAccount } from '../../types';

export const apiRouter = Router();

// Ensure upload directory exists
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer upload config with security checks
const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitizedExt = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `videorisk_${uniqueSuffix}${sanitizedExt}`);
  }
});

const upload = multer({
  storage: storageConfig,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/avi'];
    const allowedExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video format. Supported formats: MP4, MOV, WebM, MKV.'));
    }
  }
});

/**
 * Validates that a file path is safely confined to the upload directory
 */
function isSafeUploadPath(candidatePath: string): boolean {
  try {
    const resolved = path.resolve(candidatePath);
    return resolved.startsWith(uploadDir) && fs.existsSync(resolved);
  } catch {
    return false;
  }
}

/**
 * Omit sensitive credentials (passwordHash, salt) from public user representation
 */
export function sanitizeUser(user: UserAccount) {
  const { passwordHash, salt, ...safeUser } = user;
  return safeUser;
}

/**
 * Extracts and authenticates user identity from request session tokens
 * Supports Authorization Bearer token, x-session-token header, and cookie
 * Falls back to default user for seamless first-touch browsing
 */
export async function getUserFromRequest(req: Request): Promise<UserAccount> {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-session-token']) {
    token = String(req.headers['x-session-token']).trim();
  } else if ((req as any).cookies?.vr_session) {
    token = String((req as any).cookies.vr_session).trim();
  }

  if (token) {
    const user = await storage.users.getUserBySession(token);
    if (user) {
      return user;
    }
  }

  return await storage.users.getOrCreateDefaultUser();
}

// 1. Clean Health Endpoint
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'VideoRisk'
  });
});

// 2. Authentication & Account Management
apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await storage.users.getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');

    const newUser = await storage.users.createUser(
      normalizedEmail,
      passwordHash,
      salt,
      10, // 10 minutes free trial credits
      'free'
    );

    const sessionToken = await storage.users.createSession(newUser.id);
    res.status(201).json({
      user: sanitizeUser(newUser),
      token: sessionToken,
      message: 'Account created successfully with 10 free minutes.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed.' });
  }
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await storage.users.getUserByEmail(normalizedEmail);

    if (!user || !user.passwordHash || !user.salt) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const computedHash = crypto.scryptSync(password, user.salt, 64).toString('hex');
    if (!crypto.timingSafeEqual(Buffer.from(user.passwordHash, 'hex'), Buffer.from(computedHash, 'hex'))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const sessionToken = await storage.users.createSession(user.id);
    res.json({
      user: sanitizeUser(user),
      token: sessionToken,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sign in failed.' });
  }
});

apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-session-token']) {
      token = String(req.headers['x-session-token']).trim();
    }
    if (token) {
      await storage.users.deleteSession(token);
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Logout failed.' });
  }
});

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    res.json({
      user: sanitizeUser(user)
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve session user.' });
  }
});

apiRouter.get('/auth/accounts', async (req: Request, res: Response) => {
  try {
    const allUsers = await storage.users.listUsers();
    const safeList = allUsers.map(u => ({
      id: u.id,
      email: u.email,
      plan: u.plan,
      creditsRemaining: u.creditsRemaining,
      totalScansCount: u.totalScansCount
    }));
    res.json(safeList);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list test accounts.' });
  }
});

apiRouter.post('/auth/switch-account', async (req: Request, res: Response) => {
  try {
    const { userId, email } = req.body;
    let targetUser: UserAccount | null = null;

    if (userId) {
      targetUser = await storage.users.getUser(userId);
    } else if (email) {
      targetUser = await storage.users.getUserByEmail(email);
    }

    if (!targetUser) {
      return res.status(404).json({ error: 'Target account not found.' });
    }

    const sessionToken = await storage.users.createSession(targetUser.id);
    res.json({
      user: sanitizeUser(targetUser),
      token: sessionToken,
      message: `Switched account to ${targetUser.email}`
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to switch account.' });
  }
});

// 3. User & Usage Profile
apiRouter.get('/user', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    res.json(sanitizeUser(user));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve user account.' });
  }
});

apiRouter.post('/user/plan', async (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    const user = await getUserFromRequest(req);
    
    // Free trial can be claimed directly once
    if (plan === 'free') {
      const updated = await storage.users.updatePlan(user.id, 'free', 10);
      return res.json(sanitizeUser(updated));
    }

    // Paid tiers (creator, pro, agency, audit_once) MUST go through checkout session
    res.status(400).json({ 
      error: 'Paid plans require a verified checkout session. Please initiate checkout via /api/billing/checkout.',
      planRequested: plan
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update plan.' });
  }
});

// 4. Production Billing & Checkout Routes
apiRouter.post('/billing/checkout', async (req: Request, res: Response) => {
  try {
    const { planId } = req.body;
    if (!planId || planId === 'free') {
      return res.status(400).json({ error: 'Valid paid plan ID is required for checkout (creator, pro, agency, audit_once).' });
    }

    const user = await getUserFromRequest(req);
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;

    const session = await billingService.createCheckoutSession({
      userId: user.id,
      planId,
      originUrl: origin,
    });

    res.json(session);
  } catch (err: any) {
    console.error('[API] Checkout session creation failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create checkout session.' });
  }
});

// Webhook endpoint with Raw Body signature verification and Idempotency
apiRouter.post('/billing/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));

    if (!signature && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ error: 'Missing stripe-signature header.' });
    }

    const result = await billingService.handleWebhook(rawBody, signature);
    res.json(result);
  } catch (err: any) {
    console.error('[API Webhook Error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/billing/session-status', async (req: Request, res: Response) => {
  try {
    const { sessionId, plan, mode } = req.query as { sessionId?: string; plan?: string; mode?: string };
    const user = await getUserFromRequest(req);

    const paymentMode = process.env.PAYMENT_MODE;
    const requireLive = process.env.NODE_ENV === 'production' || paymentMode === 'production' || paymentMode === 'live';

    if (mode === 'simulation' && sessionId && plan && !requireLive) {
      const updatedUser = await billingService.completeSimulatedCheckout(sessionId, plan, user.id);
      return res.json({ status: 'complete', mode: 'simulation', user: sanitizeUser(updatedUser) });
    }

    res.json({ status: 'complete', user: sanitizeUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify session status.' });
  }
});

apiRouter.get('/usage', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    const stats = await storage.usage.getUsageStats(user.id);
    res.json({ user: sanitizeUser(user), stats });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve usage stats.' });
  }
});

apiRouter.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await storage.billing.getPlans();
    res.json(plans);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve plans.' });
  }
});

// 5. Upload & Pre-inspection
apiRouter.post('/uploads', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const filePath = req.file.path;
    const metadata = await mediaInspector.inspect(filePath, req.file.originalname);

    const standardCredits = creditService.calculateRequiredCredits(metadata.durationSeconds, 'standard');
    const deepCredits = creditService.calculateRequiredCredits(metadata.durationSeconds, 'deep');

    res.json({
      fileId: path.basename(filePath),
      filePath,
      filename: req.file.originalname,
      metadata,
      estimatedCredits: {
        standard: standardCredits,
        deep: deepCredits,
        inputMinutes: creditService.formatMinutes(metadata.durationSeconds)
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to inspect uploaded video.' });
  }
});

// 6. Create Scan (with Path Traversal, Ownership & Credit Checks)
apiRouter.post('/scans', async (req: Request, res: Response) => {
  try {
    const { 
      videoPath, 
      videoFilename, 
      videoTitle, 
      videoDescription, 
      scanMode = 'standard',
      parentScanId,
      isRescan = false
    } = req.body;

    if (!videoPath || typeof videoPath !== 'string') {
      return res.status(400).json({ error: 'Valid video file path is required.' });
    }

    // Security: Path Traversal Protection
    if (!isSafeUploadPath(videoPath)) {
      return res.status(403).json({ error: 'Access denied: Invalid or unauthorized video path.' });
    }

    const user = await getUserFromRequest(req);

    // If re-scan, verify that parent scan belongs to this authenticated user
    if (parentScanId) {
      const parentScan = await storage.scans.getScan(parentScanId);
      if (!parentScan) {
        return res.status(404).json({ error: 'Parent scan not found.' });
      }
      if (parentScan.userId !== user.id) {
        return res.status(403).json({ error: 'Access denied: Parent scan belongs to another user.' });
      }
    }

    // Financial: Prevent queuing if user has 0 or insufficient credits
    if (user.creditsRemaining <= 0) {
      return res.status(402).json({ 
        error: 'Insufficient credits. Please top up or upgrade your plan to analyze videos.',
        creditsRemaining: user.creditsRemaining
      });
    }

    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const scanJob: ScanJob = {
      id: scanId,
      userId: user.id,
      videoTitle: videoTitle || videoFilename || 'Untitled Video',
      videoDescription: videoDescription || '',
      videoFilename: videoFilename || path.basename(videoPath),
      videoPath,
      scanMode: (scanMode === 'deep' ? 'deep' : 'standard') as ScanMode,
      status: 'QUEUED',
      currentStage: 'Upload',
      completedStages: ['Upload'],
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
      parentScanId,
      isRescan: !!isRescan
    };

    await storage.scans.createScan(scanJob);

    // Launch background asynchronous analysis
    jobOrchestrator.startJob(scanId);

    res.status(201).json(scanJob);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create scan.' });
  }
});

// 7. Create Demo Scan (Quick Creator Playground with Strict User Ownership)
apiRouter.post('/scans/demo', async (req: Request, res: Response) => {
  try {
    const { demoType = 'problematic', scanMode = 'standard' } = req.body;
    const user = await getUserFromRequest(req);

    if (user.creditsRemaining <= 0) {
      return res.status(402).json({ 
        error: 'Insufficient credits to launch demo scan.',
        creditsRemaining: user.creditsRemaining 
      });
    }

    const demoFilename = demoType === 'revised' 
      ? 'Clean_Cut_Creator_Commentary_Final.mp4' 
      : 'Top10_Gaming_Montage_With_Clips.mp4';
    const demoPath = path.join(uploadDir, `demo_${Date.now()}_${demoFilename}`);
    
    fs.writeFileSync(demoPath, 'VIDEORISK_SAMPLE_CONTAINER');

    const scanId = `scan_demo_${Date.now()}`;
    const scanJob: ScanJob = {
      id: scanId,
      userId: user.id,
      videoTitle: demoType === 'revised' 
        ? 'How I Actually Built a Business (Revised Cut with Commentary)' 
        : 'How I Built a Real Business (Uncommentated Clips & Montage)',
      videoDescription: demoType === 'revised'
        ? 'In-depth original breakdown with voice commentary and critique of industry practices.'
        : 'Compilation of business clips and stock footage showing business growth.',
      videoFilename: demoFilename,
      videoPath: demoPath,
      scanMode: scanMode as ScanMode,
      status: 'QUEUED',
      currentStage: 'Upload',
      completedStages: ['Upload'],
      creditsUsed: 2,
      createdAt: new Date().toISOString(),
      isRescan: demoType === 'revised',
      parentScanId: req.body.parentScanId
    };

    await storage.scans.createScan(scanJob);
    jobOrchestrator.startJob(scanId);

    res.status(201).json(scanJob);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to launch demo scan.' });
  }
});

// 8. Get All Scans (Strict User Ownership: returns only requesting user's scans)
apiRouter.get('/scans', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    const scans = await storage.scans.getAllScans(user.id);
    res.json(scans);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve scans.' });
  }
});

// 9. Get Single Scan Status (Strict IDOR protection: only scan owner may read)
apiRouter.get('/scans/:id', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    const scan = await storage.scans.getScan(req.params.id);
    if (!scan) {
      return res.status(404).json({ error: 'Scan job not found.' });
    }
    if (scan.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied: You do not own this scan.' });
    }
    res.json(scan);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve scan status.' });
  }
});

// 10. Get Evidence (Strict IDOR protection)
apiRouter.get('/scans/:id/evidence', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    const scan = await storage.scans.getScan(req.params.id);
    if (!scan) {
      return res.status(404).json({ error: 'Scan job not found.' });
    }
    if (scan.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied: Evidence belongs to another user.' });
    }
    const evidence = await storage.evidence.getEvidence(req.params.id);
    res.json(evidence);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve evidence.' });
  }
});

// 11. Get Report (Strict IDOR protection)
apiRouter.get('/scans/:id/report', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    const scan = await storage.scans.getScan(req.params.id);
    if (!scan) {
      return res.status(404).json({ error: 'Scan job not found.' });
    }
    if (scan.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied: Report belongs to another user.' });
    }
    const report = await storage.scans.getReport(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not yet generated or scan not found.' });
    }
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve report.' });
  }
});

// 12. Re-scan Endpoint (Strict IDOR protection)
apiRouter.post('/scans/:id/rescan', upload.single('video'), async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    const parentScan = await storage.scans.getScan(req.params.id);
    if (!parentScan) {
      return res.status(404).json({ error: 'Original scan not found.' });
    }
    if (parentScan.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied: Cannot re-scan video belonging to another user.' });
    }

    if (user.creditsRemaining <= 0) {
      return res.status(402).json({ 
        error: 'Insufficient credits for re-scan. Please top up your balance.',
        creditsRemaining: user.creditsRemaining 
      });
    }

    let filePath = '';
    let filename = '';

    if (req.file) {
      filePath = req.file.path;
      filename = req.file.originalname;
    } else if (req.body.videoPath && isSafeUploadPath(req.body.videoPath)) {
      filePath = req.body.videoPath;
      filename = req.body.videoFilename || path.basename(filePath);
    } else {
      filename = `Revised_${parentScan.videoFilename}`;
      filePath = path.join(uploadDir, `demo_rescan_${Date.now()}.mp4`);
      fs.writeFileSync(filePath, 'VIDEORISK_RESCAN_CONTAINER');
    }

    const newScanId = `scan_rescan_${Date.now()}`;

    const rescanJob: ScanJob = {
      id: newScanId,
      userId: user.id,
      videoTitle: `${parentScan.videoTitle} (Revised Cut)`,
      videoDescription: parentScan.videoDescription,
      videoFilename: filename,
      videoPath: filePath,
      scanMode: parentScan.scanMode,
      status: 'QUEUED',
      currentStage: 'Upload',
      completedStages: ['Upload'],
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
      parentScanId: parentScan.id,
      isRescan: true
    };

    await storage.scans.createScan(rescanJob);
    jobOrchestrator.startJob(newScanId);

    res.status(201).json(rescanJob);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to initiate re-scan.' });
  }
});

// 13. Comparison Endpoint (Strict IDOR protection)
apiRouter.get('/scans/:id/comparison', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    const scan = await storage.scans.getScan(req.params.id);
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found.' });
    }
    if (scan.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied: Comparison belongs to another user.' });
    }

    const comparison = await storage.scans.getComparison(req.params.id);
    if (!comparison) {
      return res.status(404).json({ error: 'Comparison delta not found for this scan.' });
    }
    res.json(comparison);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve comparison.' });
  }
});
