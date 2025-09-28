export class JiraCommentDto {
  id: string;
  author: {
    accountId: string;
    displayName: string;
    avatarUrl?: string;
  };
  body: string;
  renderedBody?: string;
  created: Date;
  updated: Date;
}

export class JiraAttachmentDto {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
  thumbnail?: string;
  author: {
    accountId: string;
    displayName: string;
  };
  created: Date;
}

export class TicketDetailsDto {
  id: string;
  key: string;
  summary: string;
  description?: string;
  renderedDescription?: string;
  issueType: string;
  status: string;
  priority?: string;
  assignee?: {
    accountId: string;
    displayName: string;
    avatarUrl?: string;
  };
  reporter?: {
    accountId: string;
    displayName: string;
    avatarUrl?: string;
  };
  labels?: string[];
  components?: string[];
  comments: JiraCommentDto[];
  attachments: JiraAttachmentDto[];
  createdAt: Date;
  updatedAt: Date;
}