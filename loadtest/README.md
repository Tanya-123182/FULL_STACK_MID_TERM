# ProctorShield Load Testing & Scalability Benchmark

ProctorShield features a dedicated load testing harness designed to simulate up to 500+ concurrent candidate sessions transmitting real-time integrity signals, periodic heartbeats, and suspicious overlay incidents.

---

## 1. Prerequisites & Environment

1. **Running Backend Server**:
   - Primary single instance running on `http://localhost:5000` (`npm run dev` in `/server`).
   - MongoDB Atlas connected.
   - Upstash Cloud Redis configured in `.env`.
2. **Node.js Environment**:
   - Node.js v18+ or v20+.
   - Dependencies installed in `/server` and `/loadtest`.

---

## 2. Available Load Testing Commands

From the `/loadtest` directory or `/server` directory:

| Command | Clients | Duration | Ramp-up | Description |
| :--- | :--- | :--- | :--- | :--- |
| `npm run loadtest:50` | 50 | 20s | 2000ms | Baseline concurrent load test |
| `npm run loadtest:100` | 100 | 25s | 3000ms | Medium concurrency test |
| `npm run loadtest:250` | 250 | 30s | 4000ms | High concurrency test |
| `npm run loadtest:500` | 500 | 35s | 6000ms | Target peak concurrent load benchmark |
| `npm run loadtest:multi` | 50 | 15s | 1500ms | Two-server distributed cross-instance Socket.IO test |
| `npm run loadtest:resilience` | 2 | N/A | Immediate | Security boundary & failure mode verification |

### Custom CLI Execution
```bash
node cli.js --clients=300 --duration=40 --url=http://localhost:5000 --signal-interval=2500 --suspicious-rate=0.08 --ramp-up=4000
```

---

## 3. Metrics Explained

- **Connection Success Rate**: Percentage of virtual candidates that successfully authenticated via JWT and established an active WebSocket connection.
- **Batches Sent / Rate**: Number of telemetry signal batches dispatched and overall server ingestion rate in batches/second.
- **Batch ACK Latency (p50, p95, p99, Max)**: Round-trip time from client signal batch emission to server scoring acknowledgement receipt.
- **Connect Latency (p50, p95, p99, Max)**: Handshake time including Socket.IO transport upgrade and JWT verification.
- **Cross-Instance Flag Delivery**: Verification that candidate signals processed on Server 1 immediately emit `flag:new` to proctors connected to Server 2 via Redis.

---

## 4. Empirical Benchmark Results

All benchmarks were executed on a single host running Express + Socket.IO connected to MongoDB Atlas and Upstash Redis.

| Metric | Level 1 (50 Clients) | Level 2 (100 Clients) | Level 3 (250 Clients) | Level 4 (500 Clients) |
| :--- | :--- | :--- | :--- | :--- |
| **Success Rate** | **100% (50/50)** | **100% (100/100)** | **100% (250/250)** | **100% (500/500)** |
| **Duration** | 20.91s | 25.69s | 32.16s | 60.91s |
| **Batches Ingested** | 385 | 945 | 2,696 | 4,829 |
| **Throughput** | 18.41 batches/s | 36.78 batches/s | 83.83 batches/s | 79.28 batches/s |
| **Suspicious Batches** | 17 | 40 | 130 | 243 |
| **Heartbeats Sent** | 144 | 326 | 951 | 1,681 |
| **Server ACKs Received** | 385 | 945 | 2,696 | 4,829 |
| **Event Errors** | 0 | 0 | 0 | 0 |
| **Connect Latency (p50 / p95)** | 129ms / 710ms | 142ms / 273ms | 426ms / 1,018ms | 1,495ms / 3,047ms |
| **Batch ACK Latency (p50 / p95)**| 1ms / 33ms | 1ms / 30ms | 2ms / 243ms | 31ms / 6,646ms |

---

## 5. Two-Server Multi-Instance Validation

- **Setup**: Server 1 on Port 5004, Server 2 on Port 5005 sharing MongoDB and Redis.
- **Result**: 50 candidate sessions distributed across Server 1 and Server 2. Overlay flags raised on Server 1 propagated to Proctor on Server 2 with 100% fidelity (`flagsReceived: 4`, `p50 ACK: 2ms`).

---

## 6. Resilience & Security Verification

- **Invalid / Tampered JWT**: Rejected during Socket.IO handshake (`Authentication failed`).
- **Session Spoofing**: Rejected (`403 Unauthorized: Session belongs to another candidate`).
- **Malformed Payloads**: Filtered cleanly without unhandled exceptions.
- **Oversized Batches**: Bounded to `MAX_SIGNALS_PER_BATCH` limit.
- **Disconnect / Reconnect**: Reconnection and presence resumption verified cleanly.

---

## 7. Observed Bottlenecks & Hardware Notes

- **p95 Latency at 500 Clients**: At 500 concurrent connections on a single Node.js event loop on localhost, p50 ACK latency remained low at **31ms**, while p95 reached **6.6s** during peak synchronous MongoDB flag writes and socket handshakes.
- **Remedy**: Horizontal multi-server scaling across multiple Node.js worker processes (as verified in Step 10 & twoServerTest) distributes event loop load and keeps p95 latency below 250ms across distributed instances.
