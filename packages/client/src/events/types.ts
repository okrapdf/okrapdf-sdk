/**
 * Real-time replay event system types
 *
 * Aligned with @steventsao/agent-session patterns:
 * - Persistable vs ephemeral events
 * - Cursor-based resumption (lastEventId)
 * - EVENTS_BATCH replay
 */

// --- Base Event (matches session-agent) ---

export interface BaseEvent {
  type: EventType
  eventId?: string        // Only on persistable events
  eventTimestamp?: number // Only on persistable events
}

export type EventType =
  // Lifecycle (persistable)
  | 'SESSION_START'
  | 'SESSION_END'
  // Agent Actions (persistable)
  | 'ACTION_START'
  | 'ACTION_COMPLETE'
  | 'ACTION_ERROR'
  // State Transitions (persistable)
  | 'STATE_CHANGE'
  // Reasoning (persistable)
  | 'THOUGHT'
  | 'DECISION'
  // Replay (ephemeral)
  | 'EVENTS_BATCH'
  | 'CURSOR_ACK'

// --- Persistable vs Ephemeral ---

const EPHEMERAL_EVENTS = new Set<EventType>(['EVENTS_BATCH', 'CURSOR_ACK'])

export function isPersistable(event: BaseEvent): boolean {
  return !EPHEMERAL_EVENTS.has(event.type)
}

export interface PersistableEvent extends BaseEvent {
  eventId: string
  eventTimestamp: number
}

// --- Action Events ---

export interface ActionStartEvent extends PersistableEvent {
  type: 'ACTION_START'
  action: string
  target: ActionTarget
}

export interface ActionCompleteEvent extends PersistableEvent {
  type: 'ACTION_COMPLETE'
  action: string
  target: ActionTarget
  result?: unknown
  durationMs: number
}

export interface ActionErrorEvent extends PersistableEvent {
  type: 'ACTION_ERROR'
  action: string
  target: ActionTarget
  error: string
  durationMs: number
}

export interface ActionTarget {
  resource: string        // 'ocrJobs' | 'documents' | 'chat'
  method: string
  args: unknown[]
}

export type ActionEvent = ActionStartEvent | ActionCompleteEvent | ActionErrorEvent

// --- State Change Events ---

export interface StateChangeEvent extends PersistableEvent {
  type: 'STATE_CHANGE'
  entity: EntityRef
  transition: Transition
}

export interface EntityRef {
  type: string            // 'page' | 'entity' | 'job'
  id: string
}

export interface Transition {
  from: string
  to: string
  reason?: string
}

// --- Thought Events ---

export interface ThoughtEvent extends PersistableEvent {
  type: 'THOUGHT' | 'DECISION'
  content: string
  context?: Record<string, unknown>
}

// --- Session Events ---

export interface SessionStartEvent extends PersistableEvent {
  type: 'SESSION_START'
  sessionId: string
  metadata?: Record<string, unknown>
}

export interface SessionEndEvent extends PersistableEvent {
  type: 'SESSION_END'
  sessionId: string
  summary?: {
    actionsCount: number
    errorsCount: number
    durationMs: number
  }
}

// --- Replay Events (ephemeral) ---

export interface EventsBatchEvent extends BaseEvent {
  type: 'EVENTS_BATCH'
  events: PersistableEvent[]
  lastEventId: string
  count: number
}

export interface CursorAckEvent extends BaseEvent {
  type: 'CURSOR_ACK'
  lastEventId: string
}

// --- Union Types ---

export type ServerEvent =
  | SessionStartEvent
  | SessionEndEvent
  | ActionStartEvent
  | ActionCompleteEvent
  | ActionErrorEvent
  | StateChangeEvent
  | ThoughtEvent
  | EventsBatchEvent
  | CursorAckEvent

// --- EventStream Interface ---

export type EventCallback<T extends BaseEvent = BaseEvent> = (event: T) => void
export type Unsubscribe = () => void

export interface IEventStream {
  readonly sessionId: string

  // Emit (adds eventId + eventTimestamp for persistable)
  emit<T extends BaseEvent>(event: Omit<T, 'eventId' | 'eventTimestamp'>): T

  // Subscribe
  subscribe(callback: EventCallback): Unsubscribe
  subscribeToTypes<T extends BaseEvent>(types: T['type'][], callback: EventCallback<T>): Unsubscribe

  // Query (cursor-based, matches session-agent)
  getEvents(options?: {
    afterEventId?: string   // cursor
    limit?: number
  }): PersistableEvent[]

  getLastEventId(): string | null

  // Persistence
  export(): string          // JSONL
}

// --- Replay Interface ---

export interface IReplayEngine {
  play(options?: ReplayOptions): Promise<void>
  stop(): void
  pause(): void
  resume(): void
  seek(eventId: string): void
}

export interface ReplayOptions {
  speed?: number          // 1 = realtime, 0 = instant
  filter?: EventType[]
  onEvent?: EventCallback
  onComplete?: () => void
  fromEventId?: string    // start cursor
}

// --- Agent Interface ---

export interface IAgent<TOptions = unknown, TResult = unknown> {
  readonly name: string
  readonly stream: IEventStream

  run(options: TOptions): Promise<TResult>
  abort(): void
}

// --- Convenience ---

export type NewEvent<T extends BaseEvent> = Omit<T, 'eventId' | 'eventTimestamp'>

/**
 * Storage key for cursor persistence (matches session-agent pattern)
 */
export function cursorStorageKey(sessionId: string): string {
  return `okra-replay-cursor:${sessionId}`
}
