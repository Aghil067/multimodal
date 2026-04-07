import urllib.request
import json

base_url = "https://travelmidwest.com/lmiga"
endpoints = [
    "/incidentMap.json?type=lines",
    "/congestionMap.json?type=encoded_lines",
    "/weatherMap.json"
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Referer': 'https://travelmidwest.com/lmiga/map.jsp',
    'Origin': 'https://travelmidwest.com'
}

# Example bbox for Chicago area
payload = {
    "bbox": [-88.7571, 41.5229, -86.9993, 42.0880]
}

results = {}

for ep in endpoints:
    url = base_url + ep
    print(f"Testing {url}...")
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            # Just store a snippet or the whole thing if it's small
            results[ep] = json.loads(res_data)
            print(f"Success for {ep}")
    except Exception as e:
        results[ep] = {"error": str(e)}
        print(f"Failed for {ep}: {e}")

with open("test_post_results.json", "w") as f:
    json.dump(results, f, indent=2)
