import urllib.request
import re

url = "https://travelmidwest.com/static/js/main.311ec286.js"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
js = urllib.request.urlopen(req).read().decode('utf-8')

# Let's find snippets that contain "incidents.json" or "congestionMap.json"
snippets = []
for match in re.finditer(r'.{0,150}(incidents\.json|congestionMap\.json|weatherMap\.json).{0,150}', js):
    snippets.append(match.group(0))

with open("js_snippets.txt", "w") as f:
    for s in snippets:
        f.write(s + "\n---\n")
