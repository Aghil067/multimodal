import urllib.request
import re
import json

url = "https://travelmidwest.com/static/js/main.311ec286.js"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    # Find all path-like strings looking like "/api/..."
    apis = set(re.findall(r'"(/api/[^"]+)"', html) + re.findall(r'"(https://[^"]+)"', html))
    print(json.dumps(list(apis), indent=2))
except Exception as e:
    print("Error:", e)
