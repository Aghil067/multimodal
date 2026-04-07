import urllib.request
import json

base_url = "https://travelmidwest.com/lmiga"
# Testing real-time traffic map which might have more city streets or different density
endpoints = [
    "/realTimeTrafficMap.json?type=encoded_lines",
    "/realTimeTrafficMap.json",
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Referer': 'https://travelmidwest.com/lmiga/map.jsp',
    'Origin': 'https://travelmidwest.com'
}

payload = {
    "bbox": [-88.1, 41.5, -87.5, 42.1]
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
            results[ep] = json.loads(res_data)
            print(f"Success for {ep}")
    except Exception as e:
        results[ep] = {"error": str(e)}
        print(f"Failed for {ep}: {e}")

with open("test_traffic_types.json", "w") as f:
    json.dump(results, f, indent=2)
