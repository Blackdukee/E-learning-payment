# Use the official Node.js image based on Alpine
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy .env to ensure DATABASE_URL is available during build
COPY .env ./

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy Prisma schema files
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy application source code
COPY . .

# Create necessary directories (logs and temp)
RUN mkdir -p logs temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5002

# Expose the app's port
EXPOSE 5002

# Start the application
CMD ["npm", "run", "start"]
