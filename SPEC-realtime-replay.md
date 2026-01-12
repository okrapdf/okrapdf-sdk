# Real-Time Replay for Agentic Work

Self-encapsulating event capture and replay system for okrapdf-sdk.

---

## Existing: @steventsao/agent-session

Already has mature event system in `~/dev/session-agent`:

| Feature | session-agent | okrapdf-sdk (needed) |
|---------|--------------|----------------------|
| Event IDs | `eventId` + `eventTimestamp` | Reuse pattern |
| Persistable vs Ephemeral | `EPHEMERAL_EVENT_TYPES` set | Reuse pattern |
| Cursor-based replay | `lastEventId` + `EVENTS_BATCH` | Reuse pattern |
| Storage | Durable Object (500 event window) | JSONL file / in-memory |
| Transport | WebSocket | Local-first, optional WS |
| Redux integration | `slice.ts` + `sessionSocketManager` | Optional |

**What to reuse from session-agent:**
- Event shape: `{ type, eventId?, eventTimestamp? }`
- `isPersistableEvent()` pattern
- `EVENTS_BATCH` for bulk replay
- Cursor storage key pattern: `okra-replay-cursor:{sessionId}`

**What's new for okrapdf-sdk:**
- `ACTION_START/COMPLETE/ERROR` for API call tracing
- `STATE_CHANGE` for entity/page transitions
- `THOUGHT/DECISION` for agent reasoning
- Self-contained replay (no server needed)

---

## Goals

1. **Capture** all agentic operations as immutable events
2. **Stream** events in real-time to observers
3. **Replay** event sequences for debugging/demo/audit
4. **Self-encapsulating** - zero external dependencies, works standalone
5. **Compatible** with session-agent patterns for future integration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      OkraClient                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  documents  │  │  ocrJobs    │  │  chat       │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          ▼                                   │
│              ┌───────────────────────┐                       │
│              │   EventCapture (new)  │ ◄── intercepts all    │
│              └───────────┬───────────┘     resource calls    │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           ▼
              ┌───────────────────────┐
              │    EventStream        │ ◄── pub/sub + storage
              ├───────────────────────┤
              │ • emit(event)         │
              │ • subscribe(cb)       │
              │ • replay(filter)      │
              │ • export() → JSONL    │
              └───────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      [Console]      [WebSocket]      [File/JSONL]
      observer        observer         persistence
```

---

## Event Schema

**Aligned with session-agent.** See `packages/client/src/events/types.ts`.

```typescript
// Base shape (matches session-agent)
interface BaseEvent {
  type: EventType
  eventId?: string        // Only on persistable events (UUID)
  eventTimestamp?: number // Only on persistable events
}

// Persistable = stored + replayed
// Ephemeral = broadcast only (EVENTS_BATCH, CURSOR_ACK)

type EventType =
  | 'SESSION_START' | 'SESSION_END'
  | 'ACTION_START' | 'ACTION_COMPLETE' | 'ACTION_ERROR'
  | 'STATE_CHANGE'
  | 'THOUGHT' | 'DECISION'
  | 'EVENTS_BATCH' | 'CURSOR_ACK'  // ephemeral
```

**Comparison with session-agent:**

| session-agent | okrapdf-sdk | Purpose |
|---------------|-------------|---------|
| `AGENT_MESSAGE` | `ACTION_COMPLETE` | Track operation results |
| `AGENT_STARTED` | `SESSION_START` | Session lifecycle |
| `AGENT_DONE` | `SESSION_END` | Session lifecycle |
| `LIFECYCLE` | `STATE_CHANGE` | Status transitions |
| - | `THOUGHT` | Agent reasoning (new) |
| - | `DECISION` | Agent choices (new) |

---

## Implementation

### 1. EventStream Class

```typescript
// packages/client/src/events/event-stream.ts

import { ulid } from './ulid'  // self-contained ULID impl

type EventCallback = (event: BaseEvent) => void
type Unsubscribe = () => void

export class EventStream {
  private events: BaseEvent[] = []
  private subscribers: Set<EventCallback> = new Set()
  private sessionId: string

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? ulid()
  }

  // --- Core API ---

  emit<T extends BaseEvent>(event: Omit<T, 'id' | 'timestamp' | 'sessionId'>): T {
    const fullEvent = {
      ...event,
      id: ulid(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
    } as T

    this.events.push(fullEvent)
    this.subscribers.forEach(cb => cb(fullEvent))
    return fullEvent
  }

  subscribe(callback: EventCallback): Unsubscribe {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  subscribeToTypes(types: EventType[], callback: EventCallback): Unsubscribe {
    const filtered: EventCallback = (e) => {
      if (types.includes(e.type)) callback(e)
    }
    return this.subscribe(filtered)
  }

  // --- Query ---

  getEvents(filter?: {
    types?: EventType[]
    after?: string   // event ID
    limit?: number
  }): BaseEvent[] {
    let result = this.events

    if (filter?.types) {
      result = result.filter(e => filter.types!.includes(e.type))
    }
    if (filter?.after) {
      const idx = result.findIndex(e => e.id === filter.after)
      if (idx >= 0) result = result.slice(idx + 1)
    }
    if (filter?.limit) {
      result = result.slice(0, filter.limit)
    }

    return result
  }

  // --- Persistence ---

  export(): string {
    return this.events.map(e => JSON.stringify(e)).join('\n')
  }

  static import(jsonl: string): EventStream {
    const stream = new EventStream()
    stream.events = jsonl
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
    if (stream.events.length > 0) {
      stream.sessionId = stream.events[0].sessionId
    }
    return stream
  }
}
```

### 2. EventCapture Wrapper

```typescript
// packages/client/src/events/event-capture.ts

export function withEventCapture<T extends object>(
  resource: T,
  stream: EventStream,
  resourceName: string
): T {
  return new Proxy(resource, {
    get(target, prop) {
      const value = Reflect.get(target, prop)

      if (typeof value !== 'function') return value

      return async (...args: unknown[]) => {
        const startEvent = stream.emit<ActionEvent>({
          type: 'action_start',
          action: `${resourceName}.${String(prop)}`,
          target: {
            resource: resourceName,
            method: String(prop),
            args: sanitizeArgs(args),
          },
        })

        const startTime = Date.now()

        try {
          const result = await value.apply(target, args)

          stream.emit<ActionEvent>({
            type: 'action_complete',
            action: `${resourceName}.${String(prop)}`,
            target: startEvent.target,
            result: sanitizeResult(result),
            durationMs: Date.now() - startTime,
          })

          return result
        } catch (error) {
          stream.emit<ActionEvent>({
            type: 'action_error',
            action: `${resourceName}.${String(prop)}`,
            target: startEvent.target,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          })
          throw error
        }
      }
    },
  })
}

function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (arg instanceof File || arg instanceof Blob) {
      return { type: 'File', name: (arg as File).name, size: arg.size }
    }
    return arg
  })
}

function sanitizeResult(result: unknown): unknown {
  // Truncate large responses
  const json = JSON.stringify(result)
  if (json.length > 10000) {
    return { truncated: true, preview: json.slice(0, 1000) }
  }
  return result
}
```

### 3. Replay Engine

```typescript
// packages/client/src/events/replay.ts

export interface ReplayOptions {
  speed?: number          // 1 = realtime, 2 = 2x, 0 = instant
  filter?: EventType[]
  onEvent?: (event: BaseEvent) => void
  onComplete?: () => void
}

export class ReplayEngine {
  private stream: EventStream
  private aborted = false

  constructor(stream: EventStream) {
    this.stream = stream
  }

  async play(options: ReplayOptions = {}): Promise<void> {
    const { speed = 1, filter, onEvent, onComplete } = options

    let events = this.stream.getEvents()
    if (filter) {
      events = events.filter(e => filter.includes(e.type))
    }

    for (let i = 0; i < events.length && !this.aborted; i++) {
      const event = events[i]
      const nextEvent = events[i + 1]

      onEvent?.(event)

      if (speed > 0 && nextEvent) {
        const delay = (nextEvent.timestamp - event.timestamp) / speed
        await sleep(Math.min(delay, 5000)) // cap at 5s
      }
    }

    onComplete?.()
  }

  stop(): void {
    this.aborted = true
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

### 4. Client Integration

```typescript
// packages/client/src/client.ts (modified)

import { EventStream } from './events/event-stream'
import { withEventCapture } from './events/event-capture'

export interface OkraClientOptions {
  apiKey: string
  baseUrl?: string
  enableEventCapture?: boolean  // NEW
}

export class OkraClient {
  readonly events: EventStream  // NEW - always available

  constructor(options: OkraClientOptions) {
    this.events = new EventStream()

    // ... existing init ...

    if (options.enableEventCapture) {
      this._documents = withEventCapture(this._documents, this.events, 'documents')
      this._ocrJobs = withEventCapture(this._ocrJobs, this.events, 'ocrJobs')
      this._chat = withEventCapture(this._chat, this.events, 'chat')
      this._extractions = withEventCapture(this._extractions, this.events, 'extractions')
    }
  }
}
```

---

## Auto-Review Agent Example

```typescript
// packages/cli/src/agents/auto-review.ts

import { OkraClient, EventStream, ReplayEngine } from '@okrapdf/sdk'

interface AutoReviewOptions {
  jobId: string
  confidenceThreshold?: number
  dryRun?: boolean
}

export async function autoReview(
  client: OkraClient,
  options: AutoReviewOptions
): Promise<void> {
  const { jobId, confidenceThreshold = 0.9, dryRun = false } = options
  const stream = client.events

  // Emit session start
  stream.emit({ type: 'session_start' })

  // Emit decision context
  stream.emit<ThoughtEvent>({
    type: 'thought',
    content: `Starting auto-review with threshold ${confidenceThreshold}`,
    context: { jobId, confidenceThreshold, dryRun },
  })

  // Get verification tree
  const tree = await client.ocrJobs.getVerificationTree(jobId)

  for (const page of tree.pages) {
    if (page.status !== 'pending') continue

    // Get entities for this page
    const entities = await client.ocrJobs.getEntities(jobId, undefined, {
      pageRange: [page.pageNumber, page.pageNumber],
    })

    const highConfidence = entities.filter(e => e.confidence >= confidenceThreshold)
    const lowConfidence = entities.filter(e => e.confidence < confidenceThreshold)

    // Emit decision
    stream.emit<ThoughtEvent>({
      type: 'decision',
      content: `Page ${page.pageNumber}: ${highConfidence.length} auto-verify, ${lowConfidence.length} manual review`,
      context: {
        pageNumber: page.pageNumber,
        highConfidenceCount: highConfidence.length,
        lowConfidenceCount: lowConfidence.length,
      },
    })

    if (dryRun) continue

    // Auto-verify high confidence entities
    if (highConfidence.length > 0 && lowConfidence.length === 0) {
      await client.ocrJobs.resolvePageStatus(jobId, page.pageNumber, {
        status: 'verified',
        resolution: 'approved',
        reason: `Auto-verified: all ${highConfidence.length} entities above ${confidenceThreshold} threshold`,
      })

      stream.emit<StateChangeEvent>({
        type: 'state_change',
        entity: { type: 'page', id: `${jobId}:${page.pageNumber}` },
        transition: {
          from: 'pending',
          to: 'verified',
          reason: 'auto_review_high_confidence',
        },
      })
    }
  }

  stream.emit({ type: 'session_end' })
}

// --- Replay example ---

async function replayAutoReview(jsonlPath: string): Promise<void> {
  const jsonl = await Deno.readTextFile(jsonlPath)
  const stream = EventStream.import(jsonl)
  const replay = new ReplayEngine(stream)

  await replay.play({
    speed: 2,
    onEvent: (event) => {
      console.log(`[${event.type}]`, event)
    },
  })
}
```

---

## CLI Commands

```bash
# Run auto-review with capture
okra agent auto-review <jobId> --capture ./session.jsonl

# Replay a captured session
okra replay ./session.jsonl --speed 2

# Stream events to console
okra agent auto-review <jobId> --stream

# Export events from running session
okra events export --session <sessionId> --output ./events.jsonl
```

---

## File Structure

```
packages/client/src/
├── events/
│   ├── index.ts           # re-exports
│   ├── types.ts           # BaseEvent, ActionEvent, etc
│   ├── event-stream.ts    # EventStream class
│   ├── event-capture.ts   # Proxy wrapper
│   ├── replay.ts          # ReplayEngine
│   └── ulid.ts            # Self-contained ULID
├── client.ts              # Modified: enableEventCapture option
└── index.ts               # Export events module

packages/cli/src/
├── agents/
│   ├── auto-review.ts     # Auto-review agent
│   └── index.ts
└── commands/
    ├── agent.ts           # okra agent <type>
    └── replay.ts          # okra replay <file>
```

---

## Implementation Checklist

### Phase 1: Core Event System
- [ ] `events/ulid.ts` - self-contained ULID generator
- [ ] `events/types.ts` - event type definitions
- [ ] `events/event-stream.ts` - EventStream class
- [ ] `events/index.ts` - exports

### Phase 2: Capture Layer
- [ ] `events/event-capture.ts` - Proxy wrapper
- [ ] Modify `client.ts` - add `enableEventCapture` option
- [ ] Add `events` getter to OkraClient

### Phase 3: Replay
- [ ] `events/replay.ts` - ReplayEngine
- [ ] CLI command: `okra replay`

### Phase 4: Auto-Review Agent
- [ ] `agents/auto-review.ts` - agent implementation
- [ ] CLI command: `okra agent auto-review`
- [ ] `--capture` flag for JSONL export
- [ ] `--stream` flag for real-time console

### Phase 5: Polish
- [ ] Tests for EventStream
- [ ] Tests for ReplayEngine
- [ ] Tests for auto-review agent
- [ ] Documentation

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| `eventId` + `eventTimestamp` | Matches session-agent pattern |
| Persistable vs ephemeral | Matches session-agent; skip replay-only events |
| Cursor-based replay | Matches session-agent `EVENTS_BATCH` pattern |
| UUID over ULID | session-agent uses UUID; consistency |
| Proxy over decorators | No build-time transformation needed |
| JSONL over JSON | Streaming-friendly, append-only |
| In-memory + export | Simple; no external deps |

---

## Integration Path

**Phase 1: Local-only (this spec)**
- EventStream in-memory
- JSONL export/import
- CLI replay

**Phase 2: session-agent bridge (future)**
```typescript
// Forward okrapdf-sdk events to session-agent WebSocket
client.events.subscribe(event => {
  sessionAgent.send({
    type: 'AGENT_MESSAGE',
    message: { content: [{ type: 'text', text: JSON.stringify(event) }] }
  })
})
```

**Phase 3: Unified UI (future)**
- Replay okrapdf events in session-agent UI
- Single event timeline across both systems

---

## Future Extensions

1. **session-agent bridge** - forward events to WebSocket
2. **Diff replay** - compare two sessions side-by-side
3. **Branch replay** - "what if" with modified decisions
4. **Metrics extraction** - time-per-action, error rates
5. **LLM integration** - emit `THOUGHT` events from Claude

---

*Spec version: 1.1 | Updated: 2025-01-11 | Aligned with session-agent*
