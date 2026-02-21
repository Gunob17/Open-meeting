# Combined Dockerfile - Full application in one container
# Builds both frontend and backend, serves via nginx with backend as upstream

# Stage 1: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
RUN npm run build

# Stage 2: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
ENV REACT_APP_API_URL=/api
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS production

# Install nginx and supervisor
RUN apk add --no-cache nginx supervisor

WORKDIR /app

# Copy backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev
RUN mkdir -p /app/backend/data

# Copy frontend build to nginx
COPY --from=frontend-builder /app/frontend/build /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# Copy supervisor configuration
COPY docker/supervisord.conf /etc/supervisord.conf

# Create directories
RUN mkdir -p /var/log/supervisor /run/nginx

WORKDIR /app

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose port 80 for nginx
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/api/health || exit 1

# Start supervisor (manages both nginx and node)
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
