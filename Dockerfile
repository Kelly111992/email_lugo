FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY . .

# Create data directory for persistence
RUN mkdir -p /app/data

# Expose port
EXPOSE 4000

# Start the application
CMD ["node", "server.js"]
