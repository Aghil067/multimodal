"""
Social Media collector using Reddit API (PRAW).
Monitors Chicago-related subreddits for supply chain disruption reports.
"""
import asyncio
import httpx
import logging
import time
from typing import List, Dict, Any
from datetime import datetime, timezone
from app.config import settings

logger = logging.getLogger(__name__)

# ── Simple in-memory TTL cache ──────────────────────────────────────────────
_cache: Dict[str, Any] = {}
_CACHE_TTL = 300  # 5 minutes

def _get_cached(key: str):
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]
    return None

def _set_cached(key: str, data):
    _cache[key] = {"data": data, "ts": time.monotonic()}

# Reddit OAuth endpoint
REDDIT_AUTH_URL = "https://www.reddit.com/api/v1/access_token"
REDDIT_API_BASE = "https://oauth.reddit.com"

# Chicago-related subreddits to monitor
CHICAGO_SUBREDDITS = ["chicago", "ChicagoSuburbs", "ChicagolandArea"]

# Keywords related to supply chain disruptions
DISRUPTION_KEYWORDS = [
    "shortage", "out of stock", "empty shelves", "no fuel", "no gas",
    "flood", "flooding", "storm", "tornado", "power outage",
    "road closed", "road blocked", "traffic jam", "highway closed",
    "grocery", "panic buying", "long lines", "evacuate", "emergency",
    "food shortage", "water shortage", "supply chain", "disruption",
    "gas station", "fuel station", "store closed", "boil order",
    "disaster", "blocked", "inaccessible", "congestion"
]


async def get_reddit_token() -> str:
    """Authenticate with Reddit API and get access token."""
    if not settings.REDDIT_CLIENT_ID or not settings.REDDIT_CLIENT_SECRET:
        return ""

    auth = httpx.BasicAuth(settings.REDDIT_CLIENT_ID, settings.REDDIT_CLIENT_SECRET)
    data = {
        "grant_type": "client_credentials"
    }
    headers = {
        "User-Agent": settings.REDDIT_USER_AGENT
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                REDDIT_AUTH_URL,
                auth=auth,
                data=data,
                headers=headers,
                timeout=15.0
            )
            response.raise_for_status()
            return response.json().get("access_token", "")
    except Exception as e:
        logger.error(f"Reddit auth failed: {e}")
        return ""


async def fetch_reddit_posts(
    subreddits: List[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Fetch recent posts from Chicago-related subreddits.
    Filters for disruption-related content using keyword matching.
    """
    subs = subreddits or CHICAGO_SUBREDDITS
    token = await get_reddit_token()

    if not token:
        logger.warning("Reddit authentication failed or not configured. Using public API fallback.")
        return await fetch_reddit_public(subs, limit)

    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": settings.REDDIT_USER_AGENT
    }

    all_posts = []

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            for subreddit in subs:
                url = f"{REDDIT_API_BASE}/r/{subreddit}/new"
                params = {"limit": limit}

                response = await client.get(url, headers=headers, params=params)
                if response.status_code != 200:
                    logger.warning(f"Failed to fetch r/{subreddit}: {response.status_code}")
                    continue

                data = response.json()
                posts = data.get("data", {}).get("children", [])

                for post in posts:
                    post_data = post.get("data", {})
                    title = post_data.get("title", "")
                    selftext = post_data.get("selftext", "")
                    combined_text = f"{title} {selftext}".lower()

                    # Check if post is related to disruptions
                    if not any(kw in combined_text for kw in DISRUPTION_KEYWORDS):
                        continue

                    created_utc = post_data.get("created_utc", 0)

                    all_posts.append({
                        "source": "reddit",
                        "subreddit": subreddit,
                        "text": f"{title}. {selftext}"[:1000],  # Truncate
                        "author": post_data.get("author", "anonymous"),
                        "url": f"https://reddit.com{post_data.get('permalink', '')}",
                        "score": post_data.get("score", 0),
                        "posted_at": datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat(),
                        "latitude": None,
                        "longitude": None,
                    })

        logger.info(f"Fetched {len(all_posts)} disruption-related Reddit posts")
        return all_posts

    except Exception as e:
        logger.error(f"Error fetching Reddit posts: {e}")
        return []


async def _fetch_single_subreddit(
    client: httpx.AsyncClient,
    subreddit: str,
    limit: int,
    headers: dict,
) -> List[Dict[str, Any]]:
    """Fetch a single subreddit's posts (used for parallel gathering)."""
    url = f"https://www.reddit.com/r/{subreddit}/new.json"
    posts_out = []
    try:
        response = await client.get(url, headers=headers, params={"limit": limit})
        if response.status_code != 200:
            logger.warning(f"Reddit API returned {response.status_code} for r/{subreddit}")
            return []
        data = response.json()
        posts = data.get("data", {}).get("children", [])
        for post in posts:
            try:
                post_data = post.get("data", {})
                if not post_data:
                    continue
                title = post_data.get("title", "")
                selftext = post_data.get("selftext", "")
                combined_text = f"{title} {selftext}".lower()
                is_disruption_related = any(kw in combined_text for kw in DISRUPTION_KEYWORDS)
                if len(title) < 5 and len(selftext) < 5:
                    continue
                created_utc = post_data.get("created_utc", 0)
                posts_out.append({
                    "source": "reddit",
                    "subreddit": subreddit,
                    "text": f"{title}. {selftext}"[:2000],
                    "author": post_data.get("author", "anonymous"),
                    "url": f"https://reddit.com{post_data.get('permalink', '')}",
                    "score": post_data.get("score", 0),
                    "posted_at": datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat(),
                    "latitude": None,
                    "longitude": None,
                    "disruption_suspected": is_disruption_related,
                })
            except Exception as e:
                logger.debug(f"Error parsing individual Reddit post: {e}")
    except Exception as e:
        logger.warning(f"Error fetching r/{subreddit}: {e}")
    return posts_out


async def fetch_reddit_public(
    subreddits: List[str],
    limit: int = 25
) -> List[Dict[str, Any]]:
    """
    Fallback: fetch posts from Reddit's public JSON endpoint (no auth needed).
    All subreddits are fetched IN PARALLEL for speed. Results are cached for
    5 minutes to avoid redundant external calls.
    """
    cache_key = f"reddit_public_{','.join(sorted(subreddits))}_{limit}"
    cached = _get_cached(cache_key)
    if cached is not None:
        logger.info(f"Returning {len(cached)} cached Reddit posts")
        return cached

    headers = {"User-Agent": settings.REDDIT_USER_AGENT}
    all_posts = []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            results = await asyncio.gather(
                *[_fetch_single_subreddit(client, sub, limit, headers) for sub in subreddits],
                return_exceptions=True
            )
        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"Subreddit fetch error: {result}")
            else:
                all_posts.extend(result)
    except Exception as e:
        logger.error(f"Error fetching Reddit public posts: {e}")
        return []

    logger.info(f"Fetched {len(all_posts)} posts via public Reddit API (parallel)")
    _set_cached(cache_key, all_posts)
    return all_posts


async def search_reddit_disruptions(query: str = "chicago shortage OR flood OR storm") -> List[Dict]:
    """Search Reddit for specific disruption-related queries."""
    headers = {"User-Agent": settings.REDDIT_USER_AGENT}
    url = "https://www.reddit.com/search.json"
    params = {
        "q": query,
        "sort": "new",
        "limit": 50,
        "restrict_sr": False
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url, headers=headers, params=params)
            if response.status_code != 200:
                return []

            data = response.json()
            posts = data.get("data", {}).get("children", [])

            results = []
            for post in posts:
                post_data = post.get("data", {})
                created_utc = post_data.get("created_utc", 0)
                results.append({
                    "source": "reddit_search",
                    "text": f"{post_data.get('title', '')}. {post_data.get('selftext', '')}"[:1000],
                    "author": post_data.get("author", "anonymous"),
                    "subreddit": post_data.get("subreddit", ""),
                    "score": post_data.get("score", 0),
                    "posted_at": datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat(),
                    "latitude": None,
                    "longitude": None,
                })

            return results

    except Exception as e:
        logger.error(f"Error searching Reddit: {e}")
        return []
