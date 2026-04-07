import urllib.request
import json
import http.cookiejar

url = "https://travelmidwest.com/lmiga/incidentMap.json?type=points"
req = urllib.request.Request(url, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://travelmidwest.com/',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Requested-By': 'XMLHttpRequest'
})
try:
    print(urllib.request.urlopen(req).read(100).decode())
except Exception as e:
    print("Error:", e)
