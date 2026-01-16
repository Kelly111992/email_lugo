FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY . .

# Expose port
EXPOSE 4000

# Start the application
CMD ["node", "server.js"]
