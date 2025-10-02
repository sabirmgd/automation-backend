export enum CronJobType {
  GENERIC = 'generic',
  JIRA_SYNC = 'jira_sync',
  DATABASE_BACKUP = 'database_backup',
  GIT_SYNC = 'git_sync',
  REPORT_GENERATION = 'report_generation',
  DATA_CLEANUP = 'data_cleanup',
  HEALTH_CHECK = 'health_check',
}

export enum JiraSyncMode {
  SINGLE_BOARD = 'single_board',
  ALL_BOARDS = 'all_boards',
  CUSTOM_JQL = 'custom_jql',
  BY_ACCOUNT = 'by_account',
}

export enum JiraSyncOption {
  CLEAR_EXISTING = 'clear_existing',
  SYNC_COMMENTS = 'sync_comments',
  SYNC_ATTACHMENTS = 'sync_attachments',
  SYNC_WATCHERS = 'sync_watchers',
  SYNC_WORK_LOGS = 'sync_work_logs',
}