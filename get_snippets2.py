import urllib.request
import re

url = "https://travelmidwest.com/static/js/main.311ec286.js"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
js = urllib.request.urlopen(req).read().decode('utf-8')

# Find all map endpoints
snippets = []
for match in re.finditer(r'name:"([^"]+)",(?:label:"[^"]+",)?(?:title:"[^"]+",)?(?:showOnMenu:!\d+,)?endpoint:"([^"]+)"', js):
    snippets.append(f"Name: {match.group(1)} | Endpoint: {match.group(2)}")

# Also look for the layer format like name:"Incidents",endpoint:"/incidentMap.json..."
for match in re.finditer(r'name:"([^"]+)",endpoint:"([^"]+)"', js):
    snippets.append(f"Layer Name: {match.group(1)} | Endpoint: {match.group(2)}")

# Remove duplicates
snippets = list(set(snippets))
snippets.sort()

with open("js_snippets2.txt", "w") as f:
    for s in snippets:
        f.write(s + "\n")
        