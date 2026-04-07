import urllib.request
import urllib.parse
import json
import http.cookiejar

url_base = "https://travelmidwest.com/lmiga"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# First request the map page to get cookies
req1 = urllib.request.Request("https://travelmidwest.com/lmiga/map.jsp", headers={'User-Agent': 'Mozilla/5.0'})
try:
    opener.open(req1)
except Exception as e:
    pass

eps = [
    "/incidentMap.json?type=points",
    "/congestionMap.json",
    "/weatherMap.json"
]
res = {}
for ep in eps:
    try:
        req = urllib.request.Request(url_base+ep, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, text/plain, */*'})
        res[ep] = opener.open(req).read((500)).decode()
    except Exception as e:
        res[ep] = "Error: " + str(e)

with open("test_cookies.json", "w") as f:
    json.dump(res, f, indent=2)
