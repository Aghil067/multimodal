# 🛡️ ChiGuard: Multimodal AI for Supply Chain Disruption Awareness

**Situational Awareness of Supply Chain Disruptions during Disaster Response Operations – Case Study: Chicago**

An AI-powered system that monitors supply chain disruptions in Chicago during disasters (floods, storms, emergencies) by fusing multimodal data from traffic, social media, infrastructure, and news sources.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Dashboard (Vite)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Map View │ │ Alerts   │ │ Charts   │ │ Data Feed│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP/REST
┌───────────────────────┴─────────────────────────────────────┐
│                    FastAPI Backend                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────┐      │
│  │ Collectors │ │ Processors │ │ Fusion + Detection  │      │
│  │ • Traffic  │ │ • NLP      │ │ • Data Fusion       │      │
│  │ • Social   │ │ • Traffic  │ │ • Disruption Detect │      │
│  │ • OSM      │ │ • Infra    │ │ • Alert Generation  │      │
│  │ • News     │ │            │ │                     │      │
│  └────────────┘ └────────────┘ └────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
         │              │              │            │
    City of        OpenStreetMap    Reddit       NWS
    Chicago           Overpass       API        Weather
    SODA API           API                       API
```

---

## 📦 Data Sources

| Source | Type | Cost | Used For |
|--------|------|------|----------|
| [Chicago Traffic Tracker](https://data.cityofchicago.org/Transportation/Chicago-Traffic-Tracker-Congestion-Estimates-by-Se/n4j6-wkkf) | Traffic | Free | Real-time congestion data |
| [OpenStreetMap Overpass](https://overpass-api.de/) | Infrastructure | Free | Store/station/hospital locations |
| [NWS Weather API](https://api.weather.gov/) | Weather | Free | Active weather alerts |
| [Reddit API](https://www.reddit.com/dev/api/) | Social Media | Free | Community disruption reports |
| [HERE Traffic API](https://developer.here.com/) | Traffic | Freemium | Flow data & incidents |
| [News API](https://newsapi.org/) | News | Free tier | Disaster news articles |

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Git**

### 1. Clone & Setup Backend

```bash
cd multimodal/backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Copy env file and add your API keys
copy .env.example .env       # Windows
# cp .env.example .env       # Mac/Linux

# Edit .env with your API keys (see API Keys section below)
```

### 2. Setup Frontend

```bash
cd multimodal/frontend

# Install dependencies (already done if you cloned properly)
npm install
```

### 3. Run the System

**Terminal 1 - Backend:**
```bash
cd multimodal/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd multimodal/frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 🔑 API Keys

The system uses the following APIs (all have free tiers):

### Required (Free, No Key):
- ✅ **Chicago Traffic Tracker** - No key needed
- ✅ **OpenStreetMap Overpass** - No key needed
- ✅ **NWS Weather API** - No key needed

### Optional (Free with Registration):
- 📧 **HERE API** - [Sign up](https://developer.here.com/) → 250K free requests/month
- 📧 **News API** - [Sign up](https://newsapi.org/) → 100 requests/day free
- 📧 **Reddit API** - [Create app](https://www.reddit.com/prefs/apps) → Free (falls back to public API)

Add keys to `backend/.env`:
```env
HERE_API_KEY=your_here_api_key
NEWS_API_KEY=your_newsapi_key
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_secret
```

> The system works without optional keys! Chicago Traffic, OSM, and NWS APIs are fully free.

---

## 🖥️ Features

### Dashboard
- **Stats Cards** - Real-time overview of disruptions, alerts, traffic status
- **Interactive Map** - Chicago map with traffic, infrastructure, and disruption markers
- **Alert Feed** - Severity-filtered disruption alerts with contributing factors
- **Analytics Charts** - Congestion distribution, disruption types, data source overview

### Detection Pipeline
1. **Data Collection** - Fetches traffic, social, infrastructure, and news data in parallel
2. **NLP Processing** - Classifies social posts into 7 disruption categories
3. **Traffic Analysis** - Detects congestion anomalies near critical infrastructure
4. **Data Fusion** - Weighted combination of all signals (30% traffic, 30% social, 20% infrastructure, 20% news)
5. **Disruption Detection** - Rule-based + optional ML detection with deduplication
6. **Alert Generation** - Human-readable alerts with severity classification

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/traffic/chicago` | Real-time Chicago traffic data |
| GET | `/api/traffic/near?lat=&lng=` | Traffic near a location |
| GET | `/api/social/reddit` | Reddit disruption posts |
| POST | `/api/social/analyze?text=` | Analyze text for disruptions |
| GET | `/api/infrastructure/chicago` | Chicago stores/stations/hospitals |
| GET | `/api/disruptions/detect` | **Run full detection pipeline** |
| GET | `/api/disruptions/summary` | Quick status summary |
| GET | `/api/alerts/weather` | NWS weather alerts |
| GET | `/api/alerts/news` | Disaster news articles |
| GET | `/api/alerts/all` | Combined alerts feed |
| GET | `/docs` | Interactive API documentation |

---

## 🧪 Testing the System

1. Start both backend and frontend
2. Open http://localhost:5173
3. Click **"Run Detection"** to fetch live data and analyze
4. Click **"Quick Status"** for a fast traffic summary
5. Explore the **Map**, **Analytics**, and **Data Feed** tabs
6. Click on disruption markers on the map for details

---

## 📂 Project Structure

```
multimodal/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Environment settings
│   │   ├── database.py          # Database connection
│   │   ├── models/
│   │   │   ├── db_models.py     # SQLAlchemy ORM models
│   │   │   └── schemas.py       # Pydantic validation schemas
│   │   ├── collectors/
│   │   │   ├── chicago_traffic.py
│   │   │   ├── here_traffic.py
│   │   │   ├── social_media.py
│   │   │   ├── osm_infrastructure.py
│   │   │   └── news_collector.py
│   │   ├── processors/
│   │   │   ├── nlp_engine.py
│   │   │   ├── traffic_analyzer.py
│   │   │   └── infrastructure_mapper.py
│   │   ├── fusion/
│   │   │   ├── data_fusion.py
│   │   │   └── disruption_detector.py
│   │   ├── alerts/
│   │   │   └── alert_generator.py
│   │   └── routes/
│   │       ├── traffic.py
│   │       ├── social.py
│   │       ├── infrastructure.py
│   │       ├── disruptions.py
│   │       └── alerts.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/ChicagoMap.jsx
│   │   │   ├── Alerts/AlertsPanel.jsx
│   │   │   ├── Charts/AnalyticsCharts.jsx
│   │   │   └── Dashboard/
│   │   │       ├── StatsCards.jsx
│   │   │       └── DataFeed.jsx
│   │   ├── services/api.js
│   │   ├── hooks/useApiData.js
│   │   ├── App.jsx
│   │   └── App.css
│   └── package.json
└── README.md
```

---

## 🔬 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, Python 3.10+, uvicorn |
| AI/NLP | HuggingFace Transformers, scikit-learn |
| Frontend | React 18, Vite |
| Maps | Leaflet.js, React-Leaflet |
| Charts | Recharts |
| HTTP | httpx (backend), Axios (frontend) |
| Database | PostgreSQL + SQLAlchemy (optional) |
