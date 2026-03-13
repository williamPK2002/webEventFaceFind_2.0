# Docker Dependency Analysis Report

**Date**: January 23, 2026  
**Project**: PhotoFinder - AI-Powered Campus Photo Discovery System

---

## Summary

✅ **Overall Status**: Docker configuration appears **well-structured** with proper dependency management. All necessary dependencies are declared and should be pulled correctly.

---

## 1. API Service (Node.js/NestJS)

### Dockerfile Analysis
**Status**: ✅ **GOOD**

#### Build Stage (Multi-stage build):
- **Base Image**: `node:20-bullseye-slim` (appropriate for Node.js)
- **System Dependencies Installed**:
  - `build-essential` ✅
  - `python3` ✅ (for node-gyp)
  - `make` ✅
  - `g++` ✅
  - `libvips-dev` ✅ (for sharp image processing)
- **Dependency Installation**: Uses `npm ci` (reproducible) ✅
- **Prisma Client**: Generated before build ✅
- **Build**: `npm run build` ✅
- **Production Optimization**: Dev dependencies removed with `npm prune --production` ✅

#### Runtime Stage:
- **Base Image**: `node:20-bullseye-slim` (optimized, slim version)
- **Node Modules**: Copied from builder stage ✅
- **Environment**: `NODE_ENV=production` ✅
- **Port**: 3000 ✅
- **Startup**: `node dist/src/main` ✅

### NPM Dependencies Check

**Critical Dependencies**:
- ✅ `@nestjs/core` (^11.0.1) - NestJS core
- ✅ `@nestjs/platform-express` (^11.0.1) - Express adapter
- ✅ `@prisma/client` (^5.22.0) - Database ORM
- ✅ `prisma` (^5.22.0) - Schema/migrations
- ✅ `minio` (^8.0.6) - Object storage client
- ✅ `sharp` (^0.34.5) - Image processing
- ✅ `weaviate-ts-client` (^2.2.0) - Vector database client
- ✅ `axios` (^1.13.2) - HTTP client
- ✅ `prom-client` (^15.1.3) - Prometheus metrics

**Potential Issues**: None identified

---

## 2. AI Service (Python/FastAPI)

### Dockerfile Analysis
**Status**: ✅ **GOOD**

#### Build:
- **Base Image**: `python:3.10-slim` ✅
- **System Dependencies**:
  - `libgl1` ✅ (OpenCV requirement)
  - `libglib2.0-0` ✅ (OpenCV requirement)
  - `gcc` ✅ (for C extensions)
  - `g++` ✅ (for C++ extensions)
- **Python Requirements**: Installed with `pip install --no-cache-dir` ✅
- **Model Download**: InsightFace buffalo_l model pre-downloaded during build ✅ (avoids runtime delays)
- **Port**: 8000 ✅
- **Startup**: `uvicorn main:app --host 0.0.0.0 --port 8000` ✅

### Python Dependencies Check

**Declared in requirements.txt**:
- ✅ `fastapi` - Web framework
- ✅ `uvicorn` - ASGI server
- ✅ `python-multipart` - Form handling
- ✅ `numpy` - Numerical computing
- ✅ `opencv-python-headless` - Computer vision (headless for container)
- ✅ `insightface` - Face detection & recognition
- ✅ `onnxruntime` - ONNX model runtime
- ✅ `Pillow` - Image processing
- ✅ `prometheus-fastapi-instrumentator` - Metrics

**Potential Issues**: None identified

---

## 3. Database & Services

### Docker Compose Configuration
**Status**: ✅ **GOOD**

All required services are properly configured:

| Service | Image | Port | Status |
|---------|-------|------|--------|
| PostgreSQL | `postgres:15-alpine` | 5432 | ✅ Configured |
| Weaviate | `semitechnologies/weaviate:1.24.1` | 8080 | ✅ Configured |
| MinIO | `minio/minio` | 9000, 9001 | ✅ Configured |
| AI Service | Custom build | 8000 | ✅ Configured |
| API Service | Custom build | 3000 | ✅ Configured |
| Prometheus | `prom/prometheus:latest` | 9090 | ✅ Configured |
| Grafana | `grafana/grafana:latest` | 3002 | ✅ Configured |

### Environment Configuration

**Status**: ⚠️ **NEEDS ATTENTION**

- **API Service**: Requires `.env` file (currently only `.env.example` exists)
  ```
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/facesearch?schema=public"
  WEAVIATE_HOST="weaviate:8080"  (note: "localhost" in example should be "weaviate" in docker-compose)
  MINIO_ENDPOINT="minio"  (note: "localhost" in example should be "minio" in docker-compose)
  ```

- **Database Credentials**: Using environment variables from docker-compose ✅
  - `DB_USER`, `DB_PASSWORD`, `DB_NAME` with defaults provided

---

## 4. Frontend (Next.js)

### Package Dependencies
**Status**: ✅ **GOOD**

**Critical Dependencies Installed**:
- ✅ `next@16.0.0` - Next.js framework
- ✅ `react@19.2.0` - React library
- ✅ `react-dom@19.2.0` - DOM rendering
- ✅ `typescript@^5` - TypeScript
- ✅ `tailwindcss@^4.1.9` - Styling
- ✅ Radix UI components ✅
- ✅ React Hook Form ✅
- ✅ Zod (validation) ✅

**Note**: No Dockerfile for Next.js found in workspace. This would need to be created for containerization.

---

## 5. Resource Limits

**Status**: ✅ **GOOD**

Proper resource constraints set in docker-compose:

```
AI Service:     2G limit / 1G reserved
PostgreSQL:     1G limit / 512M reserved
Weaviate:       2G limit / 1G reserved
API Service:    512M limit / 256M reserved
MinIO:          512M limit / 256M reserved
Prometheus:     512M limit / 256M reserved
Grafana:        256M limit / 128M reserved
```

---

## Issues & Recommendations

### 🔴 Critical Issues

1. **Missing `.env` file for API Service**
   - **Impact**: Docker container will fail without environment variables
   - **Fix**: Copy `.env.example` to `.env` and update with correct service hostnames
   ```bash
   cp api/.env.example api/.env
   # Update hostnames for docker-compose networking:
   WEAVIATE_HOST="weaviate:8080"  # NOT localhost
   MINIO_ENDPOINT="minio"         # NOT localhost
   DATABASE_URL="postgresql://postgres:postgres@postgres:5432/facesearch?schema=public"
   ```

2. **Service Hostname Mismatch in .env.example**
   - **Issue**: `.env.example` uses `localhost` instead of Docker service names
   - **Impact**: API will fail to connect to dependent services
   - **Fix**: Use Docker Compose service names internally (postgres, weaviate, minio)

### ⚠️ Warnings

1. **JWT_SECRET**: Example uses weak secret
   - **Recommendation**: Change to strong random value in production
   ```bash
   openssl rand -base64 32
   ```

2. **No Dockerfile for Next.js Frontend**
   - **Impact**: Frontend cannot be containerized
   - **Recommendation**: Create a Dockerfile for Next.js service

3. **Prisma Migrations**: Not run automatically in docker-compose
   - **Recommendation**: Consider adding migration step in docker-entrypoint or CI/CD

### ✅ Strengths

- ✅ Multi-stage builds reduce image sizes
- ✅ All system dependencies properly declared
- ✅ Proper network isolation with docker-compose network
- ✅ Resource limits prevent runaway containers
- ✅ Volume mounts for persistence
- ✅ Service dependency declaration (depends_on)
- ✅ Pre-download of AI models during build (avoids runtime delays)

---

## Checklist for Running Docker

- [ ] Copy `.env.example` to `.env`
- [ ] Update `.env` with Docker service hostnames (weaviate, minio, postgres - not localhost)
- [ ] Update `.env` with strong JWT secret
- [ ] Ensure Docker Desktop is running
- [ ] Run `docker-compose up -d` from `api/` directory
- [ ] Verify all services are healthy: `docker-compose ps`
- [ ] Run Prisma migrations: `docker-compose exec api npx prisma migrate deploy`
- [ ] Access services:
  - API: http://localhost:3000
  - Weaviate: http://localhost:8080
  - MinIO: http://localhost:9001
  - Prometheus: http://localhost:9090
  - Grafana: http://localhost:3002

---

## Conclusion

Docker configuration is **well-structured** with all necessary dependencies properly declared. The main blocker is the missing `.env` file and incorrect hostnames in the example configuration. Once these are corrected, the project should run successfully.

**Next Steps**:
1. Create proper `.env` file with Docker-compatible hostnames
2. Create Dockerfile for Next.js frontend
3. Test full docker-compose stack

