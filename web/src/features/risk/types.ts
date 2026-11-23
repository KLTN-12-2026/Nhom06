export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export type AnalysisTriggerType = 'MANUAL' | 'SCHEDULED' | 'STOCK_CHANGE';

export type AnalysisRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AnalysisActor {
  id: string;
  username: string;
  fullName: string;
}

export interface AnalysisWarning {
  code: 'MISSING_FORECAST';
  productId: string;
  productCode: string;
  productName: string;
  lotCount: number;
  reason: string;
}

export interface RiskRunSummary {
  id: string;
  trigger: AnalysisTriggerType;
  requestedBy: AnalysisActor | null;
  finishedAt: string | null;
  lotCount: number;
  modelVersion: string | null;
  evaluationDate: string;
  warnings: AnalysisWarning[];
}

export interface RiskAssessmentItem {
  assessmentId: string;
  lot: {
    id: string;
    lotCode: string;
    expiryDate: string;
    daysRemaining: number;
    status: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
  };
  onHandSnapshot: string;
  allocatedDemand: string;
  estimatedConsumption: string;
  estimatedSurplus: string;
  riskLevel: RiskLevel;
  isExpired: boolean;
}

export interface LatestRiskResponse {
  run: RiskRunSummary | null;
  items: RiskAssessmentItem[];
}

export interface LotRiskBasis {
  evaluationDate: string;
  expiryDate: string;
  daysRemaining: number;
  isExpired: boolean;
  lotStatus: string;
  minDeliveryDays: number;
  windowStart: string | null;
  windowEnd: string | null;
  windowDays: number;
  forecastHorizonStart: string;
  forecastHorizonEnd: string;
  inHorizonDays: number;
  extrapolatedDays: number;
  extrapolatedDailyRate: string;
  demandWindow: string;
  consumedByEarlierLots: string;
  allocatedDemand: string;
  estimatedConsumption: string;
  estimatedSurplus: string;
  fefoOrder: number | null;
  ineligibleReason: string | null;
  highRiskDaysThreshold: number;
  forecastRunId: string | null;
  modelVersion: string | null;
}

export interface LotRiskDetailResponse {
  run: RiskRunSummary;
  assessment: RiskAssessmentItem & {
    calculatedAt: string;
    lot: RiskAssessmentItem['lot'] & {
      receivedAt: string;
    };
    product: RiskAssessmentItem['product'] & {
      unit: string;
    };
    basis: LotRiskBasis;
  };
}

export interface AnalysisRunHistoryItem {
  id: string;
  runType: string;
  trigger: AnalysisTriggerType;
  status: AnalysisRunStatus;
  requestedBy: AnalysisActor | null;
  lotCount: number;
  modelVersion: string | null;
  evaluationDate: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  warningsCount: number;
}

export interface AnalysisRunHistoryResponse {
  items: AnalysisRunHistoryItem[];
}

export interface TriggerAnalysisResponse {
  id: string;
  runType: string;
  trigger: AnalysisTriggerType;
  status: AnalysisRunStatus;
  lotCount: number;
  evaluationDate: string;
}
