export interface Command {
  cmd: string[];
  details?: Record<string, unknown>;
  isGroup?: boolean;
  isPrivate?: boolean;
  isPremium?: boolean;
  isOwner?: boolean;
  code: (args: {
    conn: any;
    details?: any;
    from: string;
    m: any;
  }) => Promise<void>;
}
