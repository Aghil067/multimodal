import importlib
import traceback

packages = [
    "fastapi",
    "uvicorn",
    "pydantic",
    "pydantic_core",
    "numpy",
    "pandas",
    "torch",
    "transformers",
    "sklearn",
    "sqlalchemy",
    "dotenv"
]

for pkg in packages:
    try:
        print(f"Testing {pkg}...", end=" ")
        importlib.import_module(pkg)
        print("OK")
    except Exception as e:
        print(f"FAIL: {e}")
        # traceback.print_exc()
