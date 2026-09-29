import json
import urllib.request

url = "https://api.inspecthero.pl/rest/v1/maengelanzeige_items?select=*&limit=1"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ"
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print("COLUMNS IN maengelanzeige_items:", list(data[0].keys()) if data else "empty")
except Exception as e:
    print("ERROR:", e)

url_p = "https://api.inspecthero.pl/rest/v1/maengelanzeige_photos?select=*&limit=1"
req_p = urllib.request.Request(url_p, headers=headers)
try:
    with urllib.request.urlopen(req_p) as resp:
        data_p = json.loads(resp.read().decode())
        print("COLUMNS IN maengelanzeige_photos:", list(data_p[0].keys()) if data_p else "empty")
except Exception as e:
    print("ERROR PHOTOS:", e)
