FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a package so the calendar/ folder doesn't shadow Python's stdlib calendar module
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
