import urllib.request
import json

url = "https://travelmidwest.com/lmiga/incidentMap.json?type=points"
headers = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}
body = json.dumps({"bbox": [-88.78, 41.13, -86.32, 43.20]}).encode('utf-8')

req = urllib.request.Request(url, data=body, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
        print("SUCCESS points:", len(data.get("features", [])))
except Exception as e:
    print("ERROR points:", e)

url_lines = "https://travelmidwest.com/lmiga/incidentMap.json?type=lines"
req_lines = urllib.request.Request(url_lines, data=body, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req_lines) as response:
        data = json.loads(response.read().decode('utf-8'))
        print("SUCCESS lines:", len(data.get("features", [])))
except Exception as e:
    print("ERROR lines:", e)
