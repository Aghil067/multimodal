import urllib.request
import json
import time

endpoints = [
    "/congestion.json",
    "/realTimeTrafficMap.json",
    "/incidents.json",
    "/weatherMap.json",
    "/congestionMap.json",
    "/cameraMap.json",
    "/dmsMap.json"
]

base_url = "https://travelmidwest.com/lmiga"
results = {}

req_headers = {
    'User-Agent': 'Mozilla/5.0'
}

for ep in endpoints:
    url = base_url + ep + "?path=gateway"
    try:
        req = urllib.request.Request(url, headers=req_headers)
        response = urllib.request.urlopen(req)
        data = response.read(100).decode('utf-8')
        results[ep] = {"status": response.getcode(), "data": data}
    except Exception as e:
        results[ep] = {"status": "Error", "error": str(e)}
    time.sleep(1)

with open("test_results2.json", "w") as f:
    json.dump(results, f, indent=2)
