# TeleGrammy Backend Architecture & System Design

Visual reference for how the backend is structured and how its main flows work. All diagrams are
[Mermaid](https://mermaid.js.org/) and render automatically on GitHub. See [README.md](README.md) for
setup and the feature list.

---

## 1. System context

Where the backend sits between clients and the external services it depends on.

```mermaid
flowchart LR
  Web["Web / Mobile client"]

  subgraph Backend["TeleGrammy backend (Node.js)"]
    REST["REST API (Express)"]
    WS["Realtime (Socket.IO)"]
  end

  Mongo[("MongoDB")]
  Redis[("Redis")]
  S3[("AWS S3")]
  FCM["Firebase FCM"]
  STUN["STUN / TURN"]
  SG["SendGrid / SES"]
  OAuth["Google / GitHub / Facebook"]

  Web -->|HTTPS| REST
  Web -->|WebSocket| WS
  Web -. "WebRTC media" .-> STUN

  REST --> Mongo
  WS --> Mongo
  WS <-->|"pub/sub fan-out"| Redis
  REST --> S3
  WS --> S3
  REST --> SG
  WS --> FCM
  REST --> OAuth
```

## 2. Layered architecture

The request path is **routes → controllers/handlers → services → models → MongoDB**. All database
access is confined to the services layer; controllers (REST) and event handlers (sockets) share it.

```mermaid
flowchart TD
  subgraph Edge["Entry (src/index.js → server.js)"]
    EXP["expressApp.js (REST)"]
    IOA["ioApp.js (Socket.IO)"]
  end

  RT["Routes (routes/)"]
  CT["Controllers (controllers/)"]
  EH["Socket handlers (eventHandlers/)"]
  SV["Services (services/)"]
  MD["Models (models/)"]
  MW["Middlewares (auth, AWS/S3, AI moderation)"]
  DB[("MongoDB")]

  EXP --> RT --> CT
  IOA --> EH
  CT --> SV
  EH --> SV
  SV --> MD --> DB
  CT -.uses.-> MW
  EH -.uses.-> MW
```

## 3. Runtime wiring

How the single Node process boots the HTTP/HTTPS server, the socket server, and the DB connection.

```mermaid
flowchart TD
  Idx["src/index.js"] --> Srv["src/server.js"]
  Srv -->|"dev"| HTTP["http.createServer"]
  Srv -->|"prod"| HTTPS["https.createServer (TLS certs)"]
  Srv --> App["expressApp (REST + Swagger /api-docs)"]
  Srv --> Mongoose["mongoose.connect(DB_HOST)"]
  Srv --> IO["ioApp.createIoApp(server)"]
  IO --> Guard["io.use(JWT handshake guard)"]
  Guard --> NS1["default: 1:1 messaging + calls"]
  Guard --> NS2["group namespace"]
  Guard --> NS3["channel namespace"]
  IO <--> RedisAd["Redis adapter"]
  Srv --> FB["Firebase init"]
```

## 4. One-to-one message send (sequence)

Includes block enforcement, optional AI moderation, persistence, and the event-logged fan-out.

```mermaid
sequenceDiagram
  autonumber
  participant A as Sender
  participant IO as Socket.IO handler
  participant CS as chatService
  participant MS as messageService
  participant EV as Event log
  participant B as Recipient(s)

  A->>IO: message:send {chatId, ...}
  IO->>CS: getBasicChatById + getChatParticipants
  IO->>IO: block check (isBlockedBy)
  alt either side blocked
    IO-->>A: {status:"error", "User is blocked"}
  else allowed
    opt group has AI filter
      IO->>IO: classify text/image; redact if flagged
    end
    IO->>MS: createMessage
    MS->>EV: logThenEmit("message:sent")
    EV-->>B: message:sent (to chat room)
    IO-->>A: ack {id}
    B->>IO: event:ack
    IO->>MS: updateMessageRecivers
    IO-->>A: message:delivered
    B->>IO: message:seen
    IO-->>A: message:seen (if reader's readReceipts on)
  end
```

## 5. Event-sourced delivery & offline replay

Every state-changing emit is persisted to a per-chat, monotonically-indexed event log first, so a
reconnecting client can replay exactly what it missed (at-least-once delivery).

```mermaid
flowchart LR
  Change["State change (send / edit / seen / call)"] --> LTE["logThenEmit()"]
  LTE --> Store[("Event log — per-chat index")]
  LTE --> Room["emit to chat:room"]

  Reconnect["Client (re)connects"] --> SME["sendMissedEvents(chatId, offset)"]
  Store --> SME
  SME --> Replay["re-emit events where index > offset"]
  Replay --> Ack["event:ack advances user's offset"]
  Ack --> Store
```

## 6. Message delivery state

```mermaid
stateDiagram-v2
  [*] --> sending
  sending --> sent: persisted to DB
  sent --> delivered: recipients ack receipt
  delivered --> seen: recipients view it
  sending --> failed: error
  seen --> [*]
```

## 7. WebRTC call signaling (sequence)

The server is a **signaling relay**, not a media server: SDP offers/answers and ICE candidates are
relayed over sockets and stored per participant-pair so late joiners can catch up. Media flows
peer-to-peer (or via TURN).

```mermaid
sequenceDiagram
  autonumber
  participant C as Caller
  participant IO as Socket.IO relay
  participant DB as Call document
  participant R as Callee

  C->>IO: call:createCall {chatId}
  IO->>DB: create Call (caller as participant)
  IO-->>R: call:incomingCall
  C->>IO: call:offer {SDP}
  IO->>DB: store callObjects[caller][callee].offer
  IO-->>R: call:incomingOffer
  R->>IO: call:answer {SDP}
  IO->>DB: store answer
  IO-->>C: call:incomingAnswer
  par ICE trickle
    C->>IO: call:addIce
    IO-->>R: call:addedICE
  and
    R->>IO: call:addIce
    IO-->>C: call:addedICE
  end
  Note over C,R: media flows P2P / via TURN
  C->>IO: call:end
  IO->>DB: status = ended
  IO-->>R: call:endedCall
```

## 8. Privacy visibility decision

The shared `canView(target, requester, setting)` helper (`src/utils/visibility.js`) gates profile
picture, stories, and last seen the same way.

```mermaid
flowchart TD
  Start["Request to view target's attribute"] --> Self{"requester is the target?"}
  Self -->|yes| Allow["ALLOW"]
  Self -->|no| Blocked{"target blocked requester?"}
  Blocked -->|yes| Deny["DENY"]
  Blocked -->|no| Setting{"visibility setting"}
  Setting -->|Nobody| Deny
  Setting -->|EveryOne| Allow
  Setting -->|Contacts| InContacts{"requester in target's contacts?"}
  InContacts -->|yes| Allow
  InContacts -->|no| Deny
```

## 9. Data model (key collections)

Simplified entity-relationship view of the main Mongoose models.

```mermaid
erDiagram
  USER ||--o{ STORY : posts
  USER ||--o{ MESSAGE : sends
  USER }o--o{ CHAT : "participates in"
  USER }o--o{ USER : "contacts / blocks"
  CHAT ||--o{ MESSAGE : contains
  CHAT ||--o{ EVENT : logs
  CHAT ||--o{ CALL : hosts
  CHAT }o--o| GROUP : "backs"
  CHAT }o--o| CHANNEL : "backs"

  USER {
    string username
    string email
    string picture
    string profilePictureVisibility
    string storiesVisibility
    string lastSeenVisibility
    bool readReceipts
    string whoCanAddMe
    array contacts
  }
  CHAT {
    array participants
    bool isGroup
    bool isChannel
    ObjectId lastMessage
  }
  MESSAGE {
    ObjectId senderId
    ObjectId chatId
    string messageType
    string status
    array viewers
    array recievers
    date expiresAt
  }
  STORY {
    ObjectId userId
    map viewers
    date expiresAt
  }
  CALL {
    array participants
    object callObjects
    string status
  }
  EVENT {
    string name
    ObjectId chatId
    string index
    object payload
  }
```

## 10. Deployment

```mermaid
flowchart TD
  Dev["Developer push"] --> CI["Jenkins CI"]
  CI --> Image["Docker image (node:18-slim)"]
  Image --> Container["Container — NODE_ENV=production, port 8080, HTTPS"]
  Container --> Mongo[("MongoDB")]
  Container --> Redis[("Redis")]
  Container --> S3[("AWS S3")]
  Container --> FCM["Firebase FCM"]
  Container -. signaling .- TURN["STUN / TURN"]
```

---

_Diagrams reflect the code as of this revision. If a flow changes, update the corresponding block here._
