import urllib.request
import re
import json

url = "https://travelmidwest.com/static/js/main.311ec286.js"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    # Find all path-like strings looking like "/api/..." or starting with "https://travelmidwest.com/api/"
    apis = []
    
    # regex for relative paths that look like endpoints, e.g. /api/... or something json
    paths = set(re.findall(r'"(/[^" ]+\.json)"', html) + re.findall(r'"(/api/[^"]+)"', html) + re.findall(r'"(/lmiga[^"]+)"', html))
    with open("endpoints.json", "w") as f:
        json.dump(list(paths), f, indent=2)
except Exception as e:
    with open("endpoints.json", "w") as f:
        f.write(str(e))
