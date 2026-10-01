Browser Overlay Detection Dashboard

1. Problem Overview

Online exams can be undermined by browser overlays and extensions such as AI assistants, writing tools, and other injected UI. Traditional tab-switch detection may miss these because an overlay can appear while the candidate remains on the exam tab.

This project builds a real-time exam-integrity dashboard that:

Detects multiple browser-overlay and extension-related signals.

Batches and sends signals from the candidate's exam page.

Scores signals on the server and raises reviewable flags.

Shows live session status and flags to proctors.

Supports approximately 500 concurrent candidates through optimized real-time architecture.

Provides post-exam reports and review workflows.


> Important limitation: No in-page detector can detect 100% of browser extensions. The system uses layered signals and assists a human proctor; it does not automatically accuse or punish a candidate.




---

2. Objectives

Browser Detection

MutationObserver-based DOM monitoring

Fixed/high-z-index overlay detection

Known extension fingerprint detection

Shadow DOM and foreign-root detection

Focus/blur and visibility monitoring

DOM/node-count integrity checks

Best-effort extension-resource probing

DevTools, paste, and shortcut signals


Real-Time Systems

WebSocket-based live communication

Exam-based rooms

Signal batching and throttling

Redis pub/sub for horizontal scaling

Backpressure and lightweight payloads


Scalability

Target: 500 concurrent candidates

Avoid per-mutation network requests

Persist flags instead of every raw signal

Keep live counters/recent windows in Redis

Virtualize and paginate proctor dashboards


Dashboard

Live candidate session grid

Real-time flag feed

Candidate drill-down

Flag timeline

Review notes and verdicts

Post-exam reports



---

3. Key Concepts

Term	Meaning

Overlay	UI rendered above the exam page, usually using fixed/absolute positioning and a high z-index
Content Script	JavaScript injected by a browser extension
Shadow DOM	Encapsulated DOM tree that may be used by extensions
Fingerprint	Known signature such as an element selector, iframe source, or global variable
Signal	One suspicious observation
Flag	Reviewable event created when signals cross a scoring threshold
Session	One candidate's monitored exam attempt
Heartbeat	Periodic message showing that monitoring is alive
Batching	Grouping multiple signals into one network message



---

4. Layered Detection Strategy

No single detector is reliable enough. The system combines several weak signals.

4.1 MutationObserver

Observe document.body for newly added nodes.

Look for nodes that are:

position: fixed or absolute

Very high z-index

Large relative to the viewport

Not part of the exam application's own UI


The application's own components should be marked with a data attribute so they can be excluded.

Example signal:

FIXED_HIGH_Z_NODE


---

4.2 High-Z-Index Overlay Scan

Periodically scan for elements satisfying conditions such as:

position = fixed
z-index > 9999
large viewport coverage

A large fixed panel can be a strong supporting signal.


---

4.3 Known Extension Fingerprints

Maintain configurable fingerprints for known tools.

Possible fingerprints:

Element IDs/classes

Injected iframes

chrome-extension:// iframe/resource URLs

Known global variables


Example:

KNOWN_FINGERPRINT
tool = sider

Fingerprints should be configurable so new tools can be added without redeploying the application.


---

4.4 Shadow DOM / Foreign Roots

Monitor unexpected open shadow roots and foreign nodes attached outside expected application containers.


---

4.5 Focus and Visibility

Monitor:

window.blur

window.focus

visibilitychange

Pointer leaving the viewport


These are supporting signals only because normal user behavior can also trigger them.


---

4.6 DOM Integrity

Record a baseline at exam start:

initial node count
important container structure

Large unexplained changes can produce a supporting signal.


---

4.7 Extension Resource Probing

Best-effort checks for known:

chrome-extension://

resources.

This is inherently limited because extensions can restrict resource access.


---

4.8 DevTools / Paste / Shortcut Signals

Monitor:

DevTools-related signals

Large paste events

Known keyboard shortcuts


These should be treated as supporting evidence, not proof of misconduct.


---

5. Signal Scoring

Each signal has:

Code

Severity

Weight

Timestamp

Optional metadata


Example:

Signal	Severity	Weight

Window blur	LOW	1
Large DOM change	LOW	2
Fixed high-z node	MEDIUM	5
Known extension fingerprint	HIGH	10


The server maintains a short scoring window.

Example:

KNOWN_FINGERPRINT = 10
FIXED_HIGH_Z_NODE = 5
---------------------
Combined score = 15

This can raise one HIGH review flag.

Debouncing

A persistent overlay should not generate hundreds of identical flags.

Therefore:

Flag when an overlay first appears.

Do not repeatedly flag the same unchanged node.

Raise another flag only after a meaningful change or disappearance/reappearance.

Use a short scoring window.



---

6. Architecture

┌─────────────────────┐
                    │     Candidate       │
                    │   Exam Web Page     │
                    └──────────┬──────────┘
                               │
                    Detector + Batching
                               │
                         WebSocket
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Node/WS Server    │
                    │ Signal Scoring      │
                    └──────────┬──────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
                  ▼                         ▼
              Redis                    MongoDB
        live state/pub-sub         raised flags/reports
                  │
                  ▼
          ┌─────────────────┐
          │ Proctor Server  │
          │ / WebSocket     │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ Proctor         │
          │ Dashboard       │
          └─────────────────┘

Suggested Stack

Frontend

React

TypeScript

Tailwind CSS


Backend

Node.js

Express

Socket.IO or ws


Real-time scaling

Redis

Redis pub/sub / Socket.IO Redis adapter


Database

MongoDB


Authentication

JWT

Role-based access control


Testing

k6 / Artillery / custom Node socket-client load test



---

7. Scaling to 500 Candidates

Client

Do not send every DOM mutation.

Instead:

DOM mutations
     ↓
debounce
     ↓
signal buffer
     ↓
flush every 2–3 seconds
     ↓
WebSocket

Strong signals can trigger an immediate flush.


---

Server

Use:

Candidate → exam room → WebSocket server

Proctors subscribe to the relevant exam room.


---

Redis

Redis stores:

Live counters

Recent signal windows

Presence

Pub/sub events

Multi-server synchronization



---

MongoDB

Do not store every raw signal.

Store:

raised flags
evidence
timestamps
review status
notes

This significantly reduces database write pressure.


---

Proctor Dashboard

Do not stream every raw signal to the browser.

Send:

Session status

Flag events

Counters

Summary updates


Use pagination/virtualization for large session grids.


---

8. User Roles

Candidate

Log in

Join assigned exam

See monitoring notice

Take exam

Detector runs during monitored session

Session ends


Proctor

View assigned exam

View live session grid

Receive real-time flags

Open candidate timeline

Review evidence

Add notes

Mark flags reviewed

Export reports for permitted exams


Admin

Create exams

Assign candidates/proctors

Configure sensitivity

Manage fingerprints

Configure thresholds

View analytics

Export reports



---

9. Permission Matrix

Action	Candidate	Proctor	Admin

Take monitored exam	✓	—	—
View live session grid	—	✓	✓
View candidate timeline	—	✓	✓
Mark flag reviewed	—	✓	✓
Add note	—	✓	✓
Create/configure exam	—	—	✓
Manage fingerprints	—	—	✓
Assign candidates/proctors	—	—	✓
Export integrity report	—	✓*	✓


* Only for exams the proctor is authorized to access.


---

10. Main User Flow

Candidate

Login
  ↓
Open assigned exam
  ↓
Monitoring notice
  ↓
Start exam
  ↓
Detector starts
  ↓
Signals collected
  ↓
Signals batched
  ↓
Server scoring
  ↓
Session ends
  ↓
Report available

Proctor

Login
  ↓
Open live exam
  ↓
View session grid
  ↓
Receive live flag
  ↓
Open candidate
  ↓
Review timeline/evidence
  ↓
Add note
  ↓
Mark reviewed
  ↓
Export report


---

11. API Design

Authentication

POST /auth/login

Exams

POST /exams
GET /exams
GET /exams/:id
PATCH /exams/:id

Sessions

POST /exams/:id/sessions
POST /sessions/:id/end
GET /exams/:id/sessions

Flags

GET /sessions/:id/flags
PATCH /flags/:id

Signal fallback

POST /sessions/:id/signals

Fingerprints

GET /admin/fingerprints
PATCH /admin/fingerprints
POST /admin/fingerprints

Reports

GET /exams/:id/report?format=csv
GET /exams/:id/report?format=pdf


---

12. WebSocket Events

Candidate → Server

session:join
signals:batch
heartbeat

Proctor → Server

proctor:join

Server → Proctor

flag:new
session:status
exam:summary

Example Signal Batch

{
  "sessionId": "6703aa...",
  "signals": [
    {
      "code": "FIXED_HIGH_Z_NODE",
      "severity": "MED",
      "t": 1738394820120,
      "meta": {
        "zIndex": 2147483647,
        "areaPct": 42,
        "tag": "DIV"
      }
    },
    {
      "code": "KNOWN_FINGERPRINT",
      "severity": "HIGH",
      "t": 1738394820140,
      "meta": {
        "tool": "sider",
        "match": "iframe[src^='chrome-extension://']"
      }
    },
    {
      "code": "WINDOW_BLUR",
      "severity": "LOW"
    }
  ]
}


---

13. Database Design

users

name
email
passwordHash
role
isActive

Roles:

CANDIDATE
PROCTOR
ADMIN

exams

title
startAt
endAt
sensitivity
candidateIds[]
proctorIds[]
fingerprintSetId
createdBy

sessions

examId
candidateId
status
startedAt
endedAt
lastHeartbeat
flagCount
maxSeverity
userAgent
screen

Recommended index:

examId + candidateId

flags

sessionId
examId
code
severity
score
evidence
raisedAt
reviewed
reviewedBy
note
verdict

fingerprints

name
tool
matcher
weight
severity
isActive

thresholds

sensitivity
windowMs
flagScore


---

14. Example End-to-End Scenario

Suppose a candidate opens an AI overlay.

The detector finds:

KNOWN_FINGERPRINT
+
FIXED_HIGH_Z_NODE

Client sends:

signals:batch

Server calculates:

10 + 5 = 15

If the configured threshold is crossed:

HIGH flag raised

The server:

1. Stores the flag.


2. Updates session counters.


3. Publishes the event through Redis.


4. Sends flag:new to proctors in the exam room.



The proctor sees the candidate's status update in real time.

The event should be interpreted as a review signal, not automatic proof of cheating.


---

15. Privacy and Consent

The monitored page should clearly state:

> Integrity monitoring is active during this exam. The system collects integrity-related metadata to assist proctor review.



The system should avoid unnecessary surveillance.

Collect

Detector signals

Timestamps

Session status

Focus/visibility state

Limited technical metadata required for detection


Do Not Collect

Keystroke logging

Screen recordings

Screenshots unless explicitly required and separately consented to

Unnecessary personal information



---

16. Important Detection Limitations

The detector is not perfect.

Possible False Positives

Accessibility tools

Browser UI behavior

Legitimate extensions

Floating widgets

Notifications

User accidentally switching focus


Possible False Negatives

Extensions that hide their DOM

Closed Shadow DOM

Extensions that avoid detectable fingerprints

Browser-level or OS-level overlays

New extensions not present in the fingerprint configuration


Therefore:

Detection signal ≠ proof of misconduct

The final decision should remain with an authorized human proctor.


---

17. Load Testing

The system should include a reproducible load test.

Target:

500 concurrent candidate connections

Measure:

WebSocket connection success rate

Average event latency

P95/P99 latency

CPU usage

Memory usage

Redis throughput

MongoDB write rate

Dropped/reconnected connections


Example:

500 clients
   ↓
connect
   ↓
join exam room
   ↓
heartbeat
   ↓
send batched signals every 2–3 seconds
   ↓
occasionally generate flags
   ↓
measure latency and errors

The project should report actual measured results rather than claiming a performance number without testing.


---

18. Suggested Project Structure

browser-overlay-detector/
│
├── client/
│   ├── src/
│   │   ├── detector/
│   │   │   ├── mutationObserver.ts
│   │   │   ├── overlayScanner.ts
│   │   │   ├── fingerprints.ts
│   │   │   ├── focusDetector.ts
│   │   │   └── domIntegrity.ts
│   │   ├── exam/
│   │   ├── websocket/
│   │   └── dashboard/
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── auth/
│   │   ├── exams/
│   │   ├── sessions/
│   │   ├── flags/
│   │   ├── detection/
│   │   ├── websocket/
│   │   ├── redis/
│   │   └── reports/
│   └── package.json
│
├── load-test/
│   ├── k6.js
│   └── README.md
│
├── extension-demo/
│   └── README.md
│
├── docker-compose.yml
└── README.md


---

19. MVP / Priority Plan

P0 — Must Have

Authentication + roles

Exam creation

Candidate session creation

Minimal exam UI

At least four detector techniques

MutationObserver

Fixed/high-z-index scan

Fingerprint detection

Focus/visibility detection

Client batching

Server scoring

WebSocket live updates

Proctor dashboard

Candidate timeline

Privacy/monitoring notice


P1 — Should Have

Redis pub/sub

Heartbeat/presence

Configurable fingerprints

Configurable thresholds

500-client load test

CSV/PDF reports

Reference browser extension for testing


P2 — Bonus

Analytics

False-positive tracking

Session replay

Advanced visualizations



---

20. Key Engineering Principles

Principle 1 — Layer Signals

Never rely on one detector.

Multiple weak signals
        ↓
correlation/scoring
        ↓
reviewable flag

Principle 2 — Keep the Browser Lightweight

Avoid:

one mutation = one API request

Prefer:

many mutations
      ↓
debounce
      ↓
aggregate
      ↓
one batch

Principle 3 — Keep Payloads Small

Send:

{
  "code": "FIXED_HIGH_Z_NODE",
  "severity": "MED",
  "t": 1738394820120
}

rather than sending the entire DOM or HTML.

Principle 4 — Persist Only What Matters

Raw signals → Redis / short-lived memory
Raised flags → MongoDB

Principle 5 — Human Review

The system should provide evidence and signals.

Detector
   ↓
Signal
   ↓
Scoring
   ↓
Flag
   ↓
Human review

Not:

Detector → automatic punishment


---

21. Success Criteria

A successful implementation should demonstrate:

Real overlay detection using multiple independent techniques.

Low client overhead.

Batched WebSocket communication.

Correct server-side scoring and debouncing.

Live proctor updates.

Role-based access control.

Redis-backed multi-instance readiness.

MongoDB persistence of reviewable flags.

Clear privacy/consent behavior.

Reproducible load testing at the 500-candidate target.

Honest documentation of false positives and detection limitations.



---

22. Final Architecture Summary

Candidate Exam Page
        │
        ├── MutationObserver
        ├── Overlay Scanner
        ├── Fingerprint Detector
        ├── Shadow DOM Detector
        ├── Focus/Visibility Detector
        └── DOM Integrity Detector
                │
                ▼
        Signal Aggregator
                │
          Batch / Throttle
                │
                ▼
           WebSocket
                │
                ▼
       ┌─────────────────┐
       │ Backend Server   │
       │ Score + Debounce │
       └────────┬────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
      Redis           MongoDB
   live state        raised flags
   pub/sub           reports
        │
        ▼
 Proctor WebSocket
        │
        ▼
 Live Proctor Dashboard
        │
        ▼
 Human Review + Reports

Core Idea

> Build a layered, privacy-conscious, real-time integrity monitoring system where multiple weak browser signals are combined into reviewable flags, while keeping the candidate client lightweight and the backend scalable to hundreds of simultaneous sessions.
