import sys
print(sys.version)
try:
    import fastapi
    print("FastAPI OK")
except Exception as e:
    print(f"FastAPI FAIL: {e}")

try:
    import uvicorn
    print("Uvicorn OK")
except Exception as e:
    print(f"Uvicorn FAIL: {e}")
