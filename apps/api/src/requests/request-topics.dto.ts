/**
 * Requests spec 02 — the wire shapes of the topics routes.
 *
 * The row shape is exactly the one the contracts table documents and nothing more:
 * `createdByAccountId`, `archivedAt` and `archivedByAccountId` are audit columns the
 * cases observe through the database, and adding them here would be inventing a contract
 * the spec does not state.
 */

/** One topic, as every topic route returns it. */
export interface RequestTopicDto {
  id: string;
  audience: string;
  type: string;
  name: string;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** `GET …/request-topics`. */
export interface RequestTopicListDto {
  topics: RequestTopicDto[];
}

/** The body of every write route. */
export interface RequestTopicResponseDto {
  topic: RequestTopicDto;
}

/** `POST …/request-topics`. Every member is `unknown` — the body is validated, not typed. */
export interface CreateRequestTopicBody {
  audience?: unknown;
  type?: unknown;
  name?: unknown;
  sortOrder?: unknown;
}

/** `PATCH …/request-topics/{topicId}` — rename and reorder, in one route. */
export interface UpdateRequestTopicBody {
  name?: unknown;
  sortOrder?: unknown;
  /** Accepted only when equal to the stored value; a different one is refused. */
  audience?: unknown;
  type?: unknown;
}
