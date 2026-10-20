FROM python:3.11-slim

WORKDIR /app

COPY recommendation/requirements.txt /app/recommendation/requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/recommendation/requirements.txt

COPY recommendation /app/recommendation

ENV PYTHONPATH=/app

CMD ["uvicorn", "recommendation.app.main:app", "--host", "0.0.0.0", "--port", "8000"]