FROM node:22-alpine AS verify
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev --ignore-scripts
COPY backend ./backend
COPY addin ./addin
COPY admin ./admin
COPY public ./public
COPY reset-password.html ./
RUN cd backend && npm run check && npm test

FROM node:22-alpine
ENV NODE_ENV=production PORT=5000
WORKDIR /app
COPY --from=verify --chown=node:node /app /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.js"]
