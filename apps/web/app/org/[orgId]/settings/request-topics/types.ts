/** Requests spec 02 — one row of `GET /api/organizations/{orgId}/request-topics`. */
export interface RequestTopicRow {
  id: string;
  audience: 'staff' | 'client';
  type: 'access' | 'question';
  name: string;
  sortOrder: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface RequestTopicsResponse {
  topics: RequestTopicRow[];
}
