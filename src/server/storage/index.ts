import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  ScanJob, 
  EvidenceItem, 
  RiskReport, 
  ReScanComparison, 
  UserAccount,
  SubscriptionRecord,
  WebhookEventRecord,
  AuthSessionRecord,
  ChannelContextProfile
} from '../../types';

export interface IChannelProfileRepository {
  getProfile(userId: string): Promise<ChannelContextProfile | null>;
  saveProfile(userId: string, data: Partial<ChannelContextProfile>): Promise<ChannelContextProfile>;
  deleteProfile(userId: string): Promise<boolean>;
}

export interface IUserRepository {
  getUser(id: string): Promise<UserAccount | null>;
  getUserByEmail(email: string): Promise<UserAccount | null>;
  listUsers(): Promise<UserAccount[]>;
  createUser(email: string, passwordHash?: string, salt?: string, initialCredits?: number, initialPlan?: 'free' | 'creator' | 'pro' | 'agency'): Promise<UserAccount>;
  getOrCreateDefaultUser(): Promise<UserAccount>;
  deductCredits(userId: string, amount: number): Promise<boolean>;
  addCredits(userId: string, amount: number): Promise<UserAccount>;
  updatePlan(userId: string, plan: 'free' | 'creator' | 'pro' | 'agency', credits: number): Promise<UserAccount>;
  updateUser(userId: string, updates: Partial<UserAccount>): Promise<UserAccount | null>;
  createSession(userId: string): Promise<string>;
  getUserBySession(token: string): Promise<UserAccount | null>;
  deleteSession(token: string): Promise<void>;
}

export interface IScanRepository {
  createScan(scan: ScanJob): Promise<ScanJob>;
  getScan(id: string): Promise<ScanJob | null>;
  getAllScans(userId?: string): Promise<ScanJob[]>;
  updateScan(id: string, updates: Partial<ScanJob>): Promise<ScanJob | null>;
  saveReport(scanId: string, report: RiskReport): Promise<void>;
  getReport(scanId: string): Promise<RiskReport | null>;
  saveComparison(comparison: ReScanComparison): Promise<void>;
  getComparison(revisedScanId: string): Promise<ReScanComparison | null>;
}

export interface IEvidenceRepository {
  saveEvidence(scanId: string, items: EvidenceItem[]): Promise<void>;
  getEvidence(scanId: string): Promise<EvidenceItem[]>;
}

export interface IUsageRepository {
  recordUsage(userId: string, scanId: string, durationMinutes: number, creditsDeducted: number, mode: string): Promise<void>;
  getUsageStats(userId: string): Promise<{ totalMinutes: number; totalCredits: number; scanCount: number }>;
}

export interface UploadRecord {
  fileId: string;
  userId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  type: 'video' | 'thumbnail';
  createdAt: string;
}

export interface IUploadRepository {
  recordUpload(upload: UploadRecord): Promise<UploadRecord>;
  getUpload(fileId: string): Promise<UploadRecord | null>;
  getUploadByPath(filePath: string): Promise<UploadRecord | null>;
  deleteUpload(fileId: string): Promise<boolean>;
}

export interface IBillingRepository {
  getPlans(): Promise<any[]>;
  isEventProcessed(eventId: string): Promise<boolean>;
  markEventProcessed(record: WebhookEventRecord): Promise<void>;
  saveSubscription(sub: SubscriptionRecord): Promise<void>;
  getSubscription(id: string): Promise<SubscriptionRecord | null>;
  getSubscriptionsByUserId(userId: string): Promise<SubscriptionRecord[]>;
}

export interface IStorageRepository {
  users: IUserRepository;
  uploads: IUploadRepository;
  channelProfiles: IChannelProfileRepository;
  scans: IScanRepository;
  evidence: IEvidenceRepository;
  usage: IUsageRepository;
  billing: IBillingRepository;
}

// In-Memory Storage with pure JSON file persistence (Zero SQLite, Zero native binary dependency)
export class InMemoryStorageRepository implements IStorageRepository {
  private dataFile: string;
  private state: {
    users: Record<string, UserAccount>;
    sessions: Record<string, AuthSessionRecord>;
    uploads: Record<string, UploadRecord>;
    channelProfiles: Record<string, ChannelContextProfile>;
    scans: Record<string, ScanJob>;
    reports: Record<string, RiskReport>;
    evidence: Record<string, EvidenceItem[]>;
    comparisons: Record<string, ReScanComparison>;
    usage: Array<{ userId: string; scanId: string; durationMinutes: number; creditsDeducted: number; mode: string; timestamp: string }>;
    webhookEvents: Record<string, WebhookEventRecord>;
    subscriptions: Record<string, SubscriptionRecord>;
  };

  constructor(customDataFile?: string) {
    if (customDataFile) {
      this.dataFile = path.resolve(customDataFile);
    } else if (process.env.STORE_PATH) {
      this.dataFile = path.resolve(process.env.STORE_PATH);
    } else if (process.env.DATA_DIR) {
      this.dataFile = path.resolve(process.env.DATA_DIR, 'store.json');
    } else {
      this.dataFile = path.resolve(process.cwd(), 'data', 'store.json');
    }

    this.state = {
      users: {},
      sessions: {},
      uploads: {},
      channelProfiles: {},
      scans: {},
      reports: {},
      evidence: {},
      comparisons: {},
      usage: [],
      webhookEvents: {},
      subscriptions: {},
    };
    this.load();
    this.seedDefaultUserIfNeeded();
  }

  private seedDefaultUserIfNeeded() {
    // SECURITY: Do NOT seed default or demo credentials in production mode!
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    let modified = false;
    const defaultId = 'user_default';
    if (!this.state.users[defaultId]) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.scryptSync('creator123', salt, 64).toString('hex');
      this.state.users[defaultId] = {
        id: defaultId,
        email: 'creator@videorisk.com',
        plan: 'creator',
        creditsRemaining: 30, // Starter evaluation credits
        creditsUsedTotal: 0,
        totalScansCount: 0,
        createdAt: new Date().toISOString(),
        passwordHash,
        salt,
      };
      modified = true;
    } else if (!this.state.users[defaultId].passwordHash) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.scryptSync('creator123', salt, 64).toString('hex');
      this.state.users[defaultId].passwordHash = passwordHash;
      this.state.users[defaultId].salt = salt;
      modified = true;
    }

    const proId = 'user_pro';
    if (!this.state.users[proId]) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.scryptSync('pro123', salt, 64).toString('hex');
      this.state.users[proId] = {
        id: proId,
        email: 'pro@videorisk.com',
        plan: 'pro',
        creditsRemaining: 75,
        creditsUsedTotal: 0,
        totalScansCount: 0,
        createdAt: new Date().toISOString(),
        passwordHash,
        salt,
      };
      modified = true;
    }

    const freeId = 'user_free';
    if (!this.state.users[freeId]) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.scryptSync('free123', salt, 64).toString('hex');
      this.state.users[freeId] = {
        id: freeId,
        email: 'free@videorisk.com',
        plan: 'free',
        creditsRemaining: 10,
        creditsUsedTotal: 0,
        totalScansCount: 0,
        createdAt: new Date().toISOString(),
        passwordHash,
        salt,
      };
      modified = true;
    }

    if (modified) {
      this.save();
    }
  }

  private load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf-8');
        const parsed = JSON.parse(raw);
        this.state = {
          users: parsed.users || {},
          sessions: parsed.sessions || {},
          uploads: parsed.uploads || {},
          channelProfiles: parsed.channelProfiles || {},
          scans: parsed.scans || {},
          reports: parsed.reports || {},
          evidence: parsed.evidence || {},
          comparisons: parsed.comparisons || {},
          usage: parsed.usage || [],
          webhookEvents: parsed.webhookEvents || {},
          subscriptions: parsed.subscriptions || {},
        };
      }
    } catch (err) {
      console.warn('[Storage] Failed to read store.json, using fresh in-memory storage:', err);
    }
  }

  private save() {
    try {
      const dir = path.dirname(this.dataFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataFile, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[Storage] Failed to write store.json:', err);
    }
  }

  public users: IUserRepository = {
    getUser: async (id: string) => {
      return this.state.users[id] || null;
    },
    getUserByEmail: async (email: string) => {
      const normalized = email.toLowerCase().trim();
      return Object.values(this.state.users).find(u => u.email.toLowerCase() === normalized) || null;
    },
    listUsers: async () => {
      return Object.values(this.state.users);
    },
    createUser: async (
      email: string, 
      passwordHash?: string, 
      salt?: string, 
      initialCredits: number = 10,
      initialPlan: 'free' | 'creator' | 'pro' | 'agency' = 'free'
    ) => {
      const id = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const newUser: UserAccount = {
        id,
        email: email.toLowerCase().trim(),
        plan: initialPlan,
        creditsRemaining: initialCredits,
        creditsUsedTotal: 0,
        totalScansCount: 0,
        createdAt: new Date().toISOString(),
        passwordHash,
        salt,
      };
      this.state.users[id] = newUser;
      this.save();
      return newUser;
    },
    getOrCreateDefaultUser: async () => {
      const defaultId = 'user_default';
      if (!this.state.users[defaultId]) {
        this.seedDefaultUserIfNeeded();
      }
      return this.state.users[defaultId];
    },
    createSession: async (userId: string) => {
      const token = `vr_sess_${crypto.randomBytes(32).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
      this.state.sessions[token] = {
        token,
        userId,
        createdAt: new Date().toISOString(),
        expiresAt,
      };
      this.save();
      return token;
    },
    getUserBySession: async (token: string) => {
      const session = this.state.sessions[token];
      if (!session) return null;
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        delete this.state.sessions[token];
        this.save();
        return null;
      }
      return this.state.users[session.userId] || null;
    },
    deleteSession: async (token: string) => {
      if (this.state.sessions[token]) {
        delete this.state.sessions[token];
        this.save();
      }
    },
    deductCredits: async (userId: string, amount: number) => {
      const user = this.state.users[userId];
      if (!user) return false;
      const cleanAmount = Math.max(0, Math.round(amount));
      if (cleanAmount <= 0) return true;
      if (user.creditsRemaining < cleanAmount) return false;
      user.creditsRemaining -= cleanAmount;
      user.creditsUsedTotal += cleanAmount;
      this.save();
      return true;
    },
    addCredits: async (userId: string, amount: number) => {
      const user = this.state.users[userId] || await this.users.getOrCreateDefaultUser();
      const cleanAmount = Math.max(0, Math.round(amount));
      user.creditsRemaining += cleanAmount;
      this.save();
      return user;
    },
    updatePlan: async (userId: string, plan: 'free' | 'creator' | 'pro' | 'agency', credits: number) => {
      const user = this.state.users[userId] || await this.users.getOrCreateDefaultUser();
      user.plan = plan;
      const cleanCredits = Math.max(0, Math.round(credits));
      user.creditsRemaining = Math.max(0, user.creditsRemaining) + cleanCredits;
      this.save();
      return user;
    },
    updateUser: async (userId: string, updates: Partial<UserAccount>) => {
      const user = this.state.users[userId];
      if (!user) return null;
      Object.assign(user, updates);
      this.save();
      return user;
    }
  };

  public scans: IScanRepository = {
    createScan: async (scan: ScanJob) => {
      this.state.scans[scan.id] = scan;
      const user = this.state.users[scan.userId];
      if (user) {
        user.totalScansCount += 1;
      }
      this.save();
      return scan;
    },
    getScan: async (id: string) => {
      return this.state.scans[id] || null;
    },
    getAllScans: async (userId?: string) => {
      const list = Object.values(this.state.scans);
      if (userId) {
        return list.filter(s => s.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    updateScan: async (id: string, updates: Partial<ScanJob>) => {
      const scan = this.state.scans[id];
      if (!scan) return null;
      Object.assign(scan, updates);
      this.save();
      return scan;
    },
    saveReport: async (scanId: string, report: RiskReport) => {
      this.state.reports[scanId] = report;
      this.save();
    },
    getReport: async (scanId: string) => {
      return this.state.reports[scanId] || null;
    },
    saveComparison: async (comparison: ReScanComparison) => {
      this.state.comparisons[comparison.revisedScanId] = comparison;
      this.save();
    },
    getComparison: async (revisedScanId: string) => {
      return this.state.comparisons[revisedScanId] || null;
    }
  };

  public evidence: IEvidenceRepository = {
    saveEvidence: async (scanId: string, items: EvidenceItem[]) => {
      this.state.evidence[scanId] = items;
      this.save();
    },
    getEvidence: async (scanId: string) => {
      return this.state.evidence[scanId] || [];
    }
  };

  public usage: IUsageRepository = {
    recordUsage: async (userId: string, scanId: string, durationMinutes: number, creditsDeducted: number, mode: string) => {
      this.state.usage.push({
        userId,
        scanId,
        durationMinutes,
        creditsDeducted,
        mode,
        timestamp: new Date().toISOString()
      });
      this.save();
    },
    getUsageStats: async (userId: string) => {
      const records = this.state.usage.filter(u => u.userId === userId);
      const totalMinutes = records.reduce((acc, curr) => acc + curr.durationMinutes, 0);
      const totalCredits = records.reduce((acc, curr) => acc + curr.creditsDeducted, 0);
      return { totalMinutes, totalCredits, scanCount: records.length };
    }
  };

  public billing: IBillingRepository = {
    getPlans: async () => {
      return [
        {
          id: 'free',
          name: 'Free Trial',
          priceUsd: 0,
          period: 'one-time',
          credits: 10,
          costPerMinuteStandard: 'Free (10 mins)',
          features: [
            'Up to 1080p Full HD scans',
            'Standard Scan engine',
            'Full evidence timeline',
            'Explainable risk report',
            '10 total input minutes'
          ]
        },
        {
          id: 'creator',
          name: 'Creator',
          priceUsd: 9,
          period: 'month',
          credits: 30,
          costPerMinuteStandard: '$0.30 / min',
          features: [
            '30 input minutes per month',
            'Standard & Deep Scan modes',
            '4K with 1080p proxy decode',
            'Re-scan comparison engine',
            'Exportable PDF & JSON reports',
            'Metadata coherence analysis'
          ],
          highlight: true
        },
        {
          id: 'pro',
          name: 'Pro Studio',
          priceUsd: 19,
          period: 'month',
          credits: 75,
          costPerMinuteStandard: '$0.25 / min',
          features: [
            '75 input minutes per month',
            'Prioritized analysis queue',
            'Deep cross-segment pattern audit',
            'Unlimited re-scan comparisons',
            'AI disclosure flag check',
            'Advertiser-friendly deep flags'
          ]
        },
        {
          id: 'agency',
          name: 'Agency & MCN',
          priceUsd: 99,
          period: 'month',
          credits: 600,
          costPerMinuteStandard: '$0.16 / min',
          features: [
            '600 input minutes per month',
            'Multiple channel workflows',
            'Bulk upload analysis',
            'Dedicated processing throughput',
            'Direct developer API access',
            'Priority support'
          ]
        },
        {
          id: 'audit_once',
          name: 'One-time Audit',
          priceUsd: 29,
          period: 'one-time',
          credits: 60,
          costPerMinuteStandard: '$0.48 / min',
          features: [
            '60 input minutes (never expires)',
            'Standard or Deep scan',
            'Full fix recommendations',
            'Includes 2 re-scan comparisons'
          ]
        }
      ];
    },

    isEventProcessed: async (eventId: string) => {
      return !!this.state.webhookEvents[eventId];
    },

    markEventProcessed: async (record: WebhookEventRecord) => {
      this.state.webhookEvents[record.eventId] = record;
      this.save();
    },

    saveSubscription: async (sub: SubscriptionRecord) => {
      this.state.subscriptions[sub.id] = sub;
      this.save();
    },

    getSubscription: async (id: string) => {
      return this.state.subscriptions[id] || null;
    },

    getSubscriptionsByUserId: async (userId: string) => {
      return Object.values(this.state.subscriptions).filter(s => s.userId === userId);
    }
  };

  public channelProfiles: IChannelProfileRepository = {
    getProfile: async (userId: string) => {
      return this.state.channelProfiles[userId] || null;
    },
    saveProfile: async (userId: string, data: Partial<ChannelContextProfile>) => {
      const existing = this.state.channelProfiles[userId];
      const version = existing ? existing.version + 1 : 1;
      const profile: ChannelContextProfile = {
        id: existing?.id || `cp_${userId}_${Date.now()}`,
        userId,
        version,
        channelTopic: data.channelTopic ?? existing?.channelTopic ?? 'General Video Analysis',
        contentType: data.contentType ?? existing?.contentType ?? 'commentary',
        productionWorkflow: data.productionWorkflow ?? existing?.productionWorkflow ?? 'Creator scripted commentary with original voice narration.',
        thirdPartyFootageUsage: data.thirdPartyFootageUsage ?? existing?.thirdPartyFootageUsage ?? 'fair_use_commentary',
        originalVoiceNarration: data.originalVoiceNarration ?? existing?.originalVoiceNarration ?? 'always',
        aiAssistedContent: data.aiAssistedContent ?? existing?.aiAssistedContent ?? false,
        aiDisclosureDetails: data.aiDisclosureDetails ?? existing?.aiDisclosureDetails ?? '',
        typicalSources: data.typicalSources ?? existing?.typicalSources ?? 'Original screen recordings and licensed stock clips.',
        updatedAt: new Date().toISOString()
      };
      this.state.channelProfiles[userId] = profile;
      this.save();
      return profile;
    },
    deleteProfile: async (userId: string) => {
      if (this.state.channelProfiles[userId]) {
        delete this.state.channelProfiles[userId];
        this.save();
        return true;
      }
      return false;
    }
  };

  public uploads: IUploadRepository = {
    recordUpload: async (upload: UploadRecord) => {
      this.state.uploads[upload.fileId] = upload;
      this.save();
      return upload;
    },
    getUpload: async (fileId: string) => {
      return this.state.uploads[fileId] || null;
    },
    getUploadByPath: async (filePath: string) => {
      const resolved = path.resolve(filePath);
      return Object.values(this.state.uploads).find(u => path.resolve(u.filePath) === resolved) || null;
    },
    deleteUpload: async (fileId: string) => {
      if (this.state.uploads[fileId]) {
        delete this.state.uploads[fileId];
        this.save();
        return true;
      }
      return false;
    }
  };
}

export function createStorage(customPath?: string): IStorageRepository {
  return new InMemoryStorageRepository(customPath);
}

export const storage = new InMemoryStorageRepository();
