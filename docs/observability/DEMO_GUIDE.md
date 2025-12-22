# OpenTelemetry Observability Stack - Demo Guide

**Quick Reference for Team Demos**  
**Last Updated:** December 22, 2025

---

## 🚀 Quick Start (5 Minutes Before Demo)

### 1. Start Observability Stack

```bash
cd /Users/moayyadfaris/projects/kuybi-project/kuybi
docker-compose -f docker-compose.observability.yml up -d
```

### 2. Verify Services Running

```bash
docker ps | grep kuybi
# Should see: kuybi_jaeger, kuybi_prometheus, kuybi_grafana
```

### 3. Start Application

```bash
npm run start:dev
# Wait for: "OpenTelemetry SDK started successfully"
```

### 4. Generate Sample Data

```bash
# Login to get token
TOKEN=$(curl -s -X POST http://localhost:4040/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kuybi.dev","password":"Admin@123"}' | jq -r '.accessToken')

# Create some stories
for i in {1..5}; do
  curl -s -X POST http://localhost:4040/api/v1/stories \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Demo Story $i\",\"content\":\"Sample content\",\"type\":\"text\",\"status\":\"draft\"}" > /dev/null
done

# Make some public API calls
curl -s "http://localhost:4040/api/web/v1/stories?limit=10" > /dev/null
```

---

## 📊 Dashboard URLs

| Service              | URL                              | Credentials   | Purpose                |
| -------------------- | -------------------------------- | ------------- | ---------------------- |
| **Jaeger**           | http://localhost:16686           | None          | Distributed Tracing    |
| **Prometheus**       | http://localhost:9090            | None          | Metrics Database       |
| **Grafana**          | http://localhost:3001            | admin / admin | Visualization          |
| **Metrics Endpoint** | http://localhost:4040/metrics    | None          | Raw Prometheus Metrics |
| **API Health**       | http://localhost:4040/api/health | None          | Application Health     |

---

## 🎯 What Each Tool Does (Elevator Pitch)

### Jaeger - "The Request Detective"

**Show this when someone asks:** _"Why is this API call slow?"_

- Traces a single request end-to-end
- Shows timeline of every operation
- Identifies bottlenecks visually
- Like a GPS tracker for your API request

### Prometheus - "The Numbers Guy"

**Show this when someone asks:** _"How many users logged in today?"_

- Collects metrics every 5 seconds
- Stores numbers & trends over time
- Enables alerting on thresholds
- Like a fitness tracker for your app

### Grafana - "The Dashboard Master"

**Show this when someone asks:** _"Give me an overview of everything"_

- Beautiful dashboards combining all data
- Real-time visualization
- Alerting & notifications
- Like your car's dashboard but for software

---

## 🎬 Demo Flow (10 Minutes)

### Part 1: The Big Picture (2 min)

**Opening Line:**

> "We've added OpenTelemetry observability - industry standard used by Google, Netflix, Uber. Three tools: Jaeger for tracing, Prometheus for metrics, Grafana for dashboards. Let me show you what this means in practice."

**Show:** Grafana dashboard (even if empty, explain what goes there)

---

### Part 2: Jaeger - Tracing Demo (3 min)

#### Open Jaeger

**URL:** http://localhost:16686

#### Steps:

1. Select **Service:** `kuybi-backend`
2. Click **"Find Traces"**
3. Click on **any trace** to expand
4. Point out:
   - **Total duration** at the top
   - **Span timeline** - each bar is an operation
   - **Tags** - request details (HTTP method, status, etc.)

#### What to Say:

> "This is a single API request. See how it flows through our system?
>
> - Started with HTTP request
> - JWT validation took 5ms
> - Database query took 150ms ← This is our bottleneck
> - Cache update took 3ms
> - Total: 200ms
>
> Before this, if someone said 'API is slow,' we'd be guessing. Now we see exactly where time is spent."

#### Key Traces to Show:

- `POST /api/v1/stories` - Story creation (has DB + cache)
- `GET /api/web/v1/stories` - Public API (has cache hit/miss)
- `POST /api/v1/auth/login` - Login (has validation + session)

---

### Part 3: Prometheus - Metrics Demo (2 min)

#### Open Prometheus

**URL:** http://localhost:9090

#### Queries to Run:

**Query 1: Story Creation Rate**

```promql
rate(stories_created_total[5m])
```

_Click "Graph" tab to visualize_

**What to Say:**

> "This shows stories created per second over the last 5 minutes. Right now it's near zero because we're in demo mode, but in production this shows feature adoption trends."

**Query 2: User Logins by Role**

```promql
sum by (role) (user_logins_total)
```

**What to Say:**

> "Total logins broken down by role. We can track who's using the system and when."

**Query 3: Memory Usage**

```promql
nodejs_heap_size_used_bytes / 1024 / 1024
```

**What to Say:**

> "Current memory usage in megabytes. If this grows unbounded, we have a memory leak. Set an alert at 500MB and we'll know before the system crashes."

**Query 4: HTTP Request Rate**

```promql
rate(http_requests_total[1m])
```

**What to Say:**

> "Requests per second. This helps with capacity planning - do we need more servers?"

---

### Part 4: Grafana - Dashboard Demo (3 min)

#### Open Grafana

**URL:** http://localhost:3001  
**Login:** admin / admin (skip password change)

#### First-Time Setup (if needed):

**Add Prometheus Data Source:**

1. Click **⚙️ Configuration** → **Data sources**
2. Click **"Add data source"**
3. Select **"Prometheus"**
4. **URL:** `http://prometheus:9090` (in Docker) or `http://localhost:9090`
5. Click **"Save & Test"** (should see green checkmark)

#### Create Quick Dashboard:

**Panel 1: Story Creation Rate**

1. Click **"+"** → **"Dashboard"** → **"Add visualization"**
2. Select **Prometheus**
3. Query: `sum(rate(stories_created_total[5m])) by (type)`
4. Title: **"Story Creation Rate"**
5. Click **"Apply"**

**Panel 2: User Logins**

1. Add new panel
2. Query: `sum by (role) (user_logins_total)`
3. Visualization type: **Pie chart**
4. Title: **"User Logins by Role"**

**Panel 3: Memory Usage**

1. Add new panel
2. Query: `nodejs_heap_size_used_bytes / 1024 / 1024`
3. Visualization type: **Gauge**
4. Title: **"Memory Usage (MB)"**
5. Set thresholds: Green 0-300, Yellow 300-400, Red >400

#### What to Say:

> "Instead of jumping between tools, Grafana brings everything together. One dashboard shows:
>
> - Business metrics (story creation, user logins)
> - System health (memory, CPU, event loop)
> - Performance (API response times)
> - Alerts (notify Slack if error rate spikes)
>
> This is what ops/devops teams monitor 24/7."

---

## 🎯 Key Talking Points by Audience

### For Product/Business Team:

✅ "Track feature usage in real-time - which features are popular?"  
✅ "Understand user behavior - peak usage times, drop-off points"  
✅ "Make data-driven decisions - prove ROI of new features"  
✅ "Competitive advantage - know your system better than competitors"

### For Engineering Team:

✅ "Find bottlenecks in minutes, not days"  
✅ "Debug production issues without redeploying"  
✅ "No more 'works on my machine' - see actual production behavior"  
✅ "Industry standard tools - skills transfer across companies"

### For Management/Leadership:

✅ "Reduces mean time to resolution (MTTR) - fix issues faster"  
✅ "Proactive vs reactive - catch issues before users complain"  
✅ "Open source, no vendor lock-in - used by Google, Netflix, Uber"  
✅ "Enables SLAs - prove 99.9% uptime with data"

---

## 📊 Before & After Scenarios

### Scenario 1: "API is Slow"

| Before                       | After                            |
| ---------------------------- | -------------------------------- |
| Check logs manually          | Open Jaeger                      |
| Add console.log() statements | Find the exact trace             |
| Redeploy and wait            | See bottleneck in 30 seconds     |
| Guess what's wrong           | Know exactly which query is slow |
| Hours to debug               | Minutes to fix                   |

### Scenario 2: "How Many Users Used Feature X?"

| Before             | After                  |
| ------------------ | ---------------------- |
| Write SQL query    | Open Grafana dashboard |
| Manual counting    | Real-time numbers      |
| Wait for report    | Instant answer         |
| Point-in-time data | Trend over time        |

### Scenario 3: "System Down at 3am"

| Before                     | After                              |
| -------------------------- | ---------------------------------- |
| Wake up to angry customers | Alert triggers before crash        |
| Check logs, guess cause    | Grafana shows memory spike         |
| Trial and error            | Fix root cause                     |
| 2+ hours downtime          | 15 minutes (or prevented entirely) |

---

## 💡 Demo Tips & Tricks

### If Services Won't Start:

```bash
# Check what's using ports
lsof -i :16686  # Jaeger
lsof -i :9090   # Prometheus
lsof -i :3001   # Grafana

# Force restart
docker-compose -f docker-compose.observability.yml down
docker-compose -f docker-compose.observability.yml up -d
```

### If No Traces Appear:

```bash
# Check OTel is enabled
grep OBSERVABILITY_TRACING_ENABLED .env
# Should be: true

# Check app logs
npm run start:dev | grep OpenTelemetry
# Should see: "OpenTelemetry SDK started successfully"

# Make test request
curl http://localhost:4040/api/health

# Wait 5-10 seconds, refresh Jaeger
```

### If Metrics Missing:

```bash
# Check metrics endpoint
curl http://localhost:4040/metrics | grep stories_created

# Check Prometheus targets
# Open: http://localhost:9090/targets
# Should see: kuybi_backend (UP)
```

### If Grafana Can't Connect to Prometheus:

- If in Docker: Use `http://prometheus:9090`
- If localhost: Use `http://localhost:9090`
- Check network: `docker network ls | grep kuybi_network`

---

## ❓ FAQ - Quick Answers

**Q: Does this slow down our app?**  
A: No. Metrics are async (<1ms). Tracing samples 10% in production.

**Q: What's the cost?**  
A: $0. Open source, self-hosted. Cloud options exist if we want managed later.

**Q: How long is data kept?**  
A: Jaeger: 7 days, Prometheus: 15 days. Configurable based on storage.

**Q: Can we get alerts?**  
A: Yes! Grafana → Alert rules → Send to Slack/email/PagerDuty.

**Q: What if Jaeger crashes?**  
A: App keeps running normally. Observability is decoupled.

**Q: Do we track user data?**  
A: No PII. Only technical data (request duration, status codes, etc.).

**Q: Can other teams use this?**  
A: Yes! Same stack works for any service. Centralized observability.

---

## 🎨 Visual Demo Aids

### Architecture Diagram (Draw on Whiteboard)

```
┌──────────────────┐
│  Kuybi Backend   │
│                  │
│  ┌────┐ ┌─────┐ │
│  │Logs│ │OTel │ │
│  └─┬──┘ └──┬──┘ │
└────┼───────┼────┘
     │       │
     │       ├─────► Jaeger (Traces)
     │       │
     │       └─────► Prometheus (Metrics)
     │
     └─────────────► Grafana (Visualize All)
```

### Request Flow (for Jaeger explanation)

```
User Request
    │
    ├─ API Gateway (5ms)
    │
    ├─ Auth Middleware (10ms)
    │
    ├─ Controller (2ms)
    │
    ├─ Service Layer (3ms)
    │   │
    │   ├─ Database Query (150ms) ← Slow!
    │   │
    │   └─ Cache Update (5ms)
    │
    └─ Response (2ms)

Total: 177ms
```

---

## 🚀 Next Steps After Demo

### Immediate (This Week):

- [ ] Add team members to Grafana
- [ ] Create bookmarks for all dashboards
- [ ] Document in team wiki
- [ ] Add to onboarding checklist

### Short-term (This Sprint):

- [ ] Create main Grafana dashboard
- [ ] Set up first alert (memory > 500MB)
- [ ] Add more business metrics
- [ ] Train team on basic queries

### Long-term (Next Quarter):

- [ ] SLO dashboard (99.9% uptime)
- [ ] Automated reports
- [ ] Cost optimization metrics
- [ ] Cross-service tracing (when we add microservices)

---

## 🔗 Additional Resources

**Documentation:**

- Full Quality Report: `docs/observability/OPENTELEMETRY_QUALITY_REPORT.md`
- Code Examples: See `src/core/observability/`
- Environment Config: `.env.example` (search for OBSERVABILITY)

**External Links:**

- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Prometheus Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)
- [Grafana Dashboard Gallery](https://grafana.com/grafana/dashboards/)

**Internal:**

- Slack Channel: #observability (create if doesn't exist)
- Code Repository: `feature/observability` branch
- Team Wiki: (add link after documenting)

---

## ✅ Pre-Demo Checklist

**15 Minutes Before:**

- [ ] Start Docker observability stack
- [ ] Start Kuybi backend
- [ ] Generate sample traffic (login, create stories)
- [ ] Open all dashboards in browser tabs
- [ ] Test one query in each tool
- [ ] Have backup slides ready

**During Demo:**

- [ ] Start with problem statement, not tech
- [ ] Show real data, not mockups
- [ ] Keep it simple - avoid jargon
- [ ] Relate to audience's pain points
- [ ] End with clear action items

**After Demo:**

- [ ] Share dashboard links
- [ ] Send follow-up email with resources
- [ ] Schedule training session
- [ ] Collect feedback

---

## 🎤 Opening & Closing Scripts

### Opening (1 min):

> "Quick question: How long does it take us to debug a production issue right now? Hours? Days?
>
> What if I told you we could find the exact slow database query in 30 seconds? Or track how many users use a feature in real-time? Or get alerts before the system crashes?
>
> That's what we've built. Three industry-standard tools used by Google, Netflix, and Uber. Let me show you what this means for us."

### Closing (1 min):

> "To recap: Jaeger shows where time is spent, Prometheus tracks numbers over time, Grafana brings it all together in dashboards.
>
> This isn't just for engineers. Product can see feature adoption. Ops can prevent outages. Management can prove SLAs.
>
> Next steps: Dashboard links are in Slack, full docs are in the wiki, and I'll schedule training sessions next week. Questions?"

---

**Good luck with your demo! 🎉**

_Remember: Focus on value, not technology. Show, don't tell._
