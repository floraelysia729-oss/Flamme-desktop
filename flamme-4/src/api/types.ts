export interface RelatedDomain {
  community_id: number
  name: string
  topic_path?: string
  bridge_entities?: string[]
  weight?: number
  insight?: string | null
}

export interface Domain {
  name: string
  entity_count: number
  community_id: number
  topic_path?: string
  hub_entity?: string
  entities?: string[]
  related_topics?: string[]
  summary_snippet?: string
  related_domains?: RelatedDomain[]
  bridge_count?: number
}

export interface DomainLink {
  source_cid: number
  source_name: string
  target_cid: number
  target_name: string
  source_topic_path?: string
  target_topic_path?: string
  weight: number
  bridge_entities?: string[]
  insight?: string | null
}

export interface DomainLinksResponse {
  links: DomainLink[]
}

export interface Tag {
  name: string
  count: number
}

export interface Folder {
  name: string
  count: number
}

export interface OverviewResponse {
  domains: Domain[]
  top_tags: Tag[]
  folders: Folder[]
  total_docs: number
  total_entities: number
  total_relations: number
  streak: number
  week_activity: number
}

export interface HeatmapEntry {
  date: string
  count: number
  details: { documents: number; chats: number }
}

export interface IngestDepMissing {
  package: string
  feature: string
  fix: string
}

export interface StatusResponse {
  total_documents?: number
  vault_path?: string
  vault_source?: string
  ingest_deps_ok?: boolean
  ingest_deps_missing?: IngestDepMissing[]
}

export interface EntityStaleSource {
  entity_path: string
  title: string
  dead_sources: string[]
  live_sources?: string[]
}

export interface OrphanEntity {
  entity_path: string
  title: string
  dead_sources: string[]
  reason?: string
}

export interface PipelineScan {
  md_new: string[]
  md_updated: string[]
  md_removed: string[]
  binary_unprocessed: string[]
  missing_embed: string[]
  missing_entity_extract_md?: string[]
  missing_entity_extract_binary?: string[]
  missing_entity_extract_count?: number
  entity_stale_sources?: EntityStaleSource[]
  entity_stale_sources_count?: number
  orphan_entities?: OrphanEntity[]
  orphan_entities_count?: number
  entity_state_orphan_keys?: string[]
}

export interface PipelinePlan {
  pending_count: number
  entity_pending_count?: number
  maintenance_count?: number
  estimate_seconds: number
  scan: PipelineScan
  actions: string[]
  scope?: string
}

export interface IngestStage {
  id: string
  label: string
  status: 'pending' | 'running' | 'ok' | 'failed' | 'skipped'
  detail?: string
}

export interface IngestStructuredResult {
  message?: string
  stages?: IngestStage[]
  error?: string
}

export interface IngestFileResponse {
  status: 'ok' | 'error' | 'running'
  task_id?: number
  result?: IngestStructuredResult | string
  error?: string
}

export interface IngestStartResponse {
  status: 'running' | 'error'
  task_id?: number
  error?: string
}

export interface IngestTaskStatusResponse {
  status: 'pending' | 'running' | 'ok' | 'error'
  task_id?: number
  path?: string
  stages?: IngestStage[]
  message?: string
  result?: IngestStructuredResult
  error?: string
}

export interface EntityBackfillPathResult {
  path: string
  entity_count?: number
  skipped?: boolean
  reason?: string
  error?: string | null
}

export interface PipelineStep {
  step: string
  summary?: string
  total?: number
  ok?: number
  failed?: number
  added?: number
  updated?: number
  removed?: number
  deleted?: number
  built?: number
  skipped?: number
  unchanged?: number
  paths?: EntityBackfillPathResult[]
  pruned_entities?: string[]
  deleted_entities?: string[]
}

export interface PipelineRunResponse {
  status: 'ok' | 'error'
  preset?: string
  paths_queued?: number
  entity_limit?: number
  steps?: PipelineStep[]
  error?: string
}

export interface ResolveLinkResponse {
  found: boolean
  target: string
  path?: string
  title?: string
  entity_name?: string
  match_kind?: string
}

/** POST /ingest/sync 返回（run_vault_sync 原始 data） */
export interface VaultSyncResponse {
  status: 'ok' | 'error'
  error?: string
  added?: string[]
  updated?: string[]
  removed?: string[]
  unchanged?: number
  to_embed?: string[]
  embed_result?: unknown
  embed_error?: string
  graph_result?: unknown
  graph_skipped?: boolean
  topics_result?: {
    built?: number
    skipped?: number
    unchanged?: number
    errors?: unknown[]
  }
  topics_error?: string
  entities_result?: {
    built?: number
    skipped?: number
    unchanged?: number
    errors?: unknown[]
    paths?: unknown[]
  }
  entities_error?: string
}
