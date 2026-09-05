export type ViewName = "dashboard" | "map" | "notes" | "objects" | "library" | "research";
export type AnalysisScopeType = "note" | "object" | "collection";
export type AnalysisScope = { type: AnalysisScopeType; id: string };
export type AnalysisDateRange = { start: string; end: string };
export type FindingCategory =
  | "connection"
  | "risk"
  | "contradiction"
  | "gap"
  | "follow_up";
export type FindingPriority = "low" | "medium" | "high";
export type FindingStatus = "open" | "resolved" | "dismissed";
export type AnalysisType = "connections" | "risks" | "contradictions" | "gaps" | "follow_ups";
export type AnalysisStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface ObjectTypeRecord {
  id: string;
  name: string;
  icon: string;
  color: string;
  archivedAt: string | null;
}

export interface KnowledgeObjectRecord {
  id: string;
  typeId: string;
  typeName: string;
  typeIcon: string;
  typeColor: string;
  name: string;
  description: string;
  archivedAt: string | null;
}

export interface NoteRecord {
  id: string;
  title: string;
  contentJson: Record<string, unknown>;
  contentText: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  mentions: KnowledgeObjectRecord[];
}

export interface RelationshipRecord {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  label: string;
  origin: "manual" | "analysis";
  findingId: string | null;
  createdAt: string;
}

export interface FindingRecord {
  id: string;
  runId: string;
  category: FindingCategory;
  title: string;
  explanation: string;
  priority: FindingPriority;
  confidence: number;
  suggestedAction: string;
  status: FindingStatus;
  sourceNoteIds: string[];
  sourceObjectIds: string[];
  createdAt: string;
  detail?: FindingDetail;
}

export interface FindingDetail {
  evidence: Array<{ noteId: string; quote: string }>;
  impact: string;
  limitation: string;
  priorityReason: string;
  evidenceStrength: "limited" | "supported" | "strong";
  previousFindingId: string | null;
}

export interface DraftBlock { id: string; text: string; protected: boolean }
export interface DraftSuggestion { blockId: string; before: string; after: string; format: "paragraph" | "heading" | "bullet"; reason: string }
export interface ObjectSuggestion { blockId: string; text: string; typeId: string; objectId: string | null }
export interface AssistanceResult {
  changes: DraftSuggestion[];
  objects: ObjectSuggestion[];
  findings: SpecialistFinding[];
}
export interface AiPreview {
  previewId: string;
  overLimit: boolean;
  sources: Array<{ id: string; title: string; content: string; updatedAt: string }>;
  candidateObjects: Array<{ id: string; name: string; typeId: string }>;
  notice: string;
}

export interface AnalysisStepRecord {
  id: string;
  name: string;
  position: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AnalysisRunRecord {
  id: string;
  provider: string;
  scopeType: AnalysisScopeType;
  scopeId: string;
  status: AnalysisStatus;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  steps?: AnalysisStepRecord[];
  findings?: FindingRecord[];
}

export interface DashboardMetrics {
  notes: number;
  objects: number;
  openFindings: number;
  pendingFollowUps: number;
  unlinkedNotes: number;
}

export interface GraphEdgeRecord {
  id: string;
  source: string;
  target: string;
  kind: "cooccurrence" | "relationship" | "suggestion" | "mention";
  label: string;
  weight: number;
  findingId?: string;
}

export interface AppState {
  metrics: DashboardMetrics;
  objectTypes: ObjectTypeRecord[];
  objects: KnowledgeObjectRecord[];
  notes: NoteRecord[];
  relationships: RelationshipRecord[];
  graphEdges: GraphEdgeRecord[];
  recentRuns: AnalysisRunRecord[];
  priorityFindings: FindingRecord[];
}

export interface AnalysisSnapshot {
  analysisTypes?: AnalysisType[];
  mode?: "full" | "incremental";
  changedNoteIds?: string[];
  previousFindings?: FindingRecord[];
  prepared?: AiPreview;
  scope: {
    type: AnalysisScopeType;
    id: string;
    label: string;
    dateRange?: AnalysisDateRange;
  };
  notes: Array<{
    id: string;
    title: string;
    content: string;
    updatedAt: string;
    objectIds: string[];
  }>;
  objects: Array<{
    id: string;
    type: string;
    name: string;
    description: string;
  }>;
  relationships: Array<{
    id: string;
    sourceObjectId: string;
    targetObjectId: string;
    label: string;
  }>;
}

export interface SpecialistFinding {
  category: FindingCategory;
  title: string;
  explanation: string;
  priority: FindingPriority;
  confidence: number;
  suggestedAction: string;
  sourceNoteIds: string[];
  sourceObjectIds: string[];
  detail?: FindingDetail;
}

export interface SpecialistOutput {
  summary: string;
  findings: SpecialistFinding[];
}
