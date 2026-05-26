# ===== CareerPilot Frontend Dockerfile =====
FROM node:20-alpine

WORKDIR /app

# Copy package files first (Docker layer caching)
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 3000

# Set environment variable for the backend URL
ENV NEXT_PUBLIC_API_URL=http://backend:8000

# Start development server
CMD ["npm", "run", "dev"]
