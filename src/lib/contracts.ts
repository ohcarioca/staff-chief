export type ViewName = "dashboard" | "map" | "notes";
export type FindingCategory =
  | "connection"
  | "risk"
  | "contradiction"
  | "gap"
  | "follow_up";
export type FindingPriority = "low" | "medium" | "high";
export type FindingStatus = "open" | "resolved" | "dismissed";
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
  scopeType: "note" | "object";
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
  scope: {
    type: "note" | "object";
    id: string;
    label: string;
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
}

export interface SpecialistOutput {
  summary: string;
  findings: SpecialistFinding[];
}
