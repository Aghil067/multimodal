import urllib.request
import re
import json

url = "https://travelmidwest.com/static/js/main.311ec286.js"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    # Find functions or objects calling /lmiga/...
    # Let's extract fragments showing .json to see query params
    matches = re.finditer(r'.{0,50}(\/lmiga\/[^"]+\.json|\/[^"]+\.json).*?', html)
    results = [m.group(0)[:150] for m in list(matches)[:100]]
    with open("context.json", "w") as f:
        json.dump(results, f, indent=2)
except Exception as e:
    with open("context.json", "w") as f:
        f.write(str(e))
