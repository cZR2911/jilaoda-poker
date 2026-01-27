# Use official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory
WORKDIR /app

# Copy the current directory contents into the container
COPY . /app

# Install any needed packages specified in api/requirements.txt
# Note: We need to move requirements to root or point to it
RUN pip install --no-cache-dir -r api/requirements.txt

# Expose port 8000
EXPOSE 8000

# Run app.py when the container launches
# Pointing to api.index:app because that's where FastAPI instance is
CMD ["uvicorn", "api.index:app", "--host", "0.0.0.0", "--port", "8000"]
