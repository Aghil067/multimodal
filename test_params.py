import urllib.request
import json
import itertools

params = ['path=gateway', 'path=chicago', 'region=chicago', 'state=IL', 'type=all', 'type=points', 'bbox=-88,41,-87,42']
endpoints = ['/incidents.json', '/congestion.json']

urls = []
for ep in endpoints:
    for p in params:
        urls.append(ep + "?" + p)

results = {}
for u in urls:
    url = "https://travelmidwest.com/lmiga" + u
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        resp = urllib.request.urlopen(req)
        results[u] = "200: " + resp.read(100).decode()
    except Exception as e:
        results[u] = "Error: " + str(e)

with open("test_params.json", "w") as f:
    json.dump(results, f, indent=2)
