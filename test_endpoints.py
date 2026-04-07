import urllib.request
import json
import time

endpoints = [
    "/congestion.json",
    "/realTimeTrafficMap.json",
    "/incidents.json",
    "/weatherMap.json",
    "/chicagoQuickTraffic.json",
    "/congestionMap.json",
    "/winterConditionMap.json",
    "/cameraMap.json",
    "/dmsMap.json"
]

base_url = "https://travelmidwest.com/lmiga"
results = {}

req_headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://travelmidwest.com/lmiga/map.jsp',
    'Origin': 'https://travelmidwest.com',
}

for ep in endpoints:
    url = base_url + ep
    try:
        req = urllib.request.Request(url, headers=req_headers)
        response = urllib.request.urlopen(req)
        data = response.read(200).decode('utf-8')
        results[ep] = {"status": response.getcode(), "data": data}
    except Exception as e:
        results[ep] = {"status": "Error", "error": str(e)}
    time.sleep(1)

with open("test_results.json", "w") as f:
    json.dump(results, f, indent=2)
