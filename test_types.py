import urllib.request
import json

base = "https://travelmidwest.com/lmiga"
eps = [
    "/incidentMap.json?type=points",
    "/incidentMap.json?type=lines",
    "/constructionMap.json?type=points",
    "/constructionMap.json?type=lines",
    "/congestionMap.json?type=lines",
    "/weatherMap.json?type=points"
]
res = {}
for ep in eps:
    try:
        req = urllib.request.Request(base+ep, headers={'User-Agent': 'Mozilla/5.0'})
        res[ep] = urllib.request.urlopen(req).read(100).decode()
    except Exception as e:
        res[ep] = "Error: " + str(e)

with open("test_types.json", "w") as f:
    json.dump(res, f, indent=2)
