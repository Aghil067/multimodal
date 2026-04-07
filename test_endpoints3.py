import urllib.request
import json
import time

endpoints = [
    "/tpimsMap.json",
    "/realTimeTrafficMap.json",
    "/cameraMap.json",
    "/transitEventMap.json",
    "/wssMap.json",
    "/weatherMap.json",
    "/ferryMap.json",
    "/congestionMap.json",
    "/dmsMap.json",
    "/transitStopMap.json",
    "/milepostsMap.json",
    "/travelTimeMap.json",
    "/winterConditionMap.json"
]

base_url = "https://travelmidwest.com/lmiga"
results = {}

req_headers = {
    'User-Agent': 'Mozilla/5.0'
}

for ep in endpoints:
    url = base_url + ep
    try:
        req = urllib.request.Request(url, headers=req_headers)
        response = urllib.request.urlopen(req)
        data = response.read(300).decode('utf-8')
        results[ep] = {"status": response.getcode(), "data": data}
    except Exception as e:
        results[ep] = {"status": "Error", "error": str(e)}
    time.sleep(0.5)

with open("test_results3.json", "w") as f:
    json.dump(results, f, indent=2)
