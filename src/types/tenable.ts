/**
 * Type definitions for Tenable.io API responses.
 *
 * All interfaces match the exact field names returned by the Tenable.io REST API.
 * No `any` types -- fields with unconfirmed shapes use `unknown`.
 */

// ---------------------------------------------------------------------------
// Branded type aliases for scan identifiers (TYPE-02)
// ---------------------------------------------------------------------------

/** Numeric scan identifier used in most Tenable.io endpoints. */
export type ScanId = number;

/** UUID string that uniquely identifies a scan configuration or history entry. */
export type ScanUuid = string;

// ---------------------------------------------------------------------------
// Folder types
// ---------------------------------------------------------------------------

export interface TenableFolder {
  id: number;
  name: string;
  type: string;
  default_tag: number;
  custom: number;
  unread_count: number;
}

// ---------------------------------------------------------------------------
// Scan list types
// ---------------------------------------------------------------------------

export interface TenableScan {
  id: ScanId;
  uuid: ScanUuid;
  name: string;
  type: string;
  owner: string;
  enabled: boolean;
  folder_id: number;
  read: boolean;
  status: string;
  shared: boolean;
  user_permissions: number;
  creation_date: number;
  last_modification_date: number;
}

export interface TenableScanListResponse {
  folders: TenableFolder[];
  /** null when the account has no scans */
  scans: TenableScan[] | null;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Scan detail types
// ---------------------------------------------------------------------------

export interface TenableScanInfo {
  status: string;
  name: string;
  uuid: ScanUuid;
  folder_id: number;
  targets: string;
  scan_start: string | null;
  scan_end: string | null;
  scanner_name: string;
  hostcount: number;
  user_permissions: number;
  policy: string;
  scan_type: string;
  object_id: number;
  tag_targets: string[];
  acls: unknown[];
}

export interface TenableScanHost {
  host_id: number;
  host_index: number;
  hostname: string;
  progress: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  totalchecksconsidered: number;
  numchecksconsidered: number;
  scanprogresstotal: number;
  scanprogresscurrent: number;
  score: number;
}

export interface TenableScanVulnerability {
  plugin_id: number;
  plugin_name: string;
  plugin_family: string;
  count: number;
  vuln_index: number;
  severity_index: number;
  /** 0=info, 1=low, 2=medium, 3=high, 4=critical */
  severity: number;
}

export interface TenableScanHistory {
  history_id: number;
  uuid: ScanUuid;
  owner_id: number;
  status: string;
  creation_date: number;
  last_modification_date: number;
}

export interface TenableScanDetailsResponse {
  info: TenableScanInfo;
  hosts: TenableScanHost[];
  vulnerabilities: TenableScanVulnerability[];
  compliance: unknown[];
  history: TenableScanHistory[];
  notes: unknown;
  remediations: unknown;
  filters: unknown[];
}

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export interface TenableTemplate {
  uuid: string;
  name: string;
  title: string;
  description: string;
  cloud_only: boolean;
  subscription_only: boolean;
  is_agent: boolean;
  more_info?: string;
}

export interface TenableTemplateListResponse {
  templates: TenableTemplate[];
}

// ---------------------------------------------------------------------------
// Scan create / launch types
// ---------------------------------------------------------------------------

export interface TenableCreateScanResponse {
  scan: {
    id: ScanId;
    uuid: ScanUuid;
    name: string;
    type: string;
    owner: string;
    enabled: boolean;
    folder_id: number;
    creation_date: number;
    last_modification_date: number;
  };
}

export interface TenableLaunchScanResponse {
  scan_uuid: ScanUuid;
}

// ---------------------------------------------------------------------------
// Workbench vulnerability types
// ---------------------------------------------------------------------------

export interface TenableWorkbenchVulnerability {
  plugin_id: number;
  plugin_name: string;
  plugin_family: string;
  severity: number;
  vpr_score?: number;
  count: number;
}

export interface TenableWorkbenchVulnsResponse {
  vulnerabilities: TenableWorkbenchVulnerability[];
  total_vulnerability_count: number;
}
