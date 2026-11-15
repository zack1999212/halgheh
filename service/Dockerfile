FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./service/
RUN pip install --no-cache-dir -r service/requirements.txt

COPY service ./service

# Run as a package so the calendar/ folder doesn't shadow Python's stdlib calendar module
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
