/**
 * Redis cache client with robust connection handling and graceful degradation
 */

const redis = require('redis');
const { logger } = require('../utils/logger');
const config = require('./index');

/**
 * Redis Cache Manager - handles Redis operations with error handling and reconnection
 * Follows the project structure best practices from coding instructions
 */
class RedisCacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = config.redis.retryAttempts;
    this.retryDelay = config.redis.retryDelay;
    this.connectTimeout = config.redis.connectTimeout;
  }

  /**
   * Initialize Redis connection with proper error handling
   */
  async initialize() {
    try {
      // Configure Redis client options
      const redisOptions = {
        socket: {
          host: config.redis.host,
          port: config.redis.port,
          connectTimeout: this.connectTimeout,
          reconnectStrategy: (attempts) => {
            if (attempts >= this.maxRetries) {
              logger.warn(`Maximum Redis reconnection attempts (${this.maxRetries}) reached`);
              return false; // stop retrying
            }
            
            const delay = Math.min(Math.pow(2, attempts) * this.retryDelay, 30000); // Exponential backoff capped at 30s
            logger.info(`Redis reconnecting in ${delay}ms (attempt ${attempts + 1}/${this.maxRetries})`);
            return delay;
          }
        }
      };

      // Add password if configured
      if (config.redis.password) {
        redisOptions.password = config.redis.password;
      }

      // Create Redis client instance
      this.client = redis.createClient(redisOptions); 
      
      // Set up event handlers
      this._setupEventHandlers();
      
      // Attempt connection with timeout
      logger.info(`Connecting to Redis at ${config.redis.host}:${config.redis.port}...`);
      await this._connectWithTimeout();
      
      return this.isConnected;
    } catch (error) {
      logger.error(`Redis initialization error: ${error.message}`, { error });
      // Continue without Redis - application will work without caching
      return false;
    }
  }

  /**
   * Set up Redis event handlers
   */
  _setupEventHandlers() {
    this.client.on('error', (err) => {
      // Only log errors if we were previously connected (avoid log spam during reconnection)
      if (this.isConnected) {
        logger.error(`Redis client error: ${err.message}`, { error: err });
        this.isConnected = false;
      }
    });

    this.client.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    this.client.on('ready', () => {
      logger.info('Redis client connected and ready');
      this.isConnected = true;
      this.connectionAttempts = 0;
    });

    this.client.on('reconnecting', () => {
      this.connectionAttempts++;
      logger.info(`Redis client reconnecting... (attempt ${this.connectionAttempts})`);
    });

    this.client.on('end', () => {
      logger.info('Redis connection closed');
      this.isConnected = false;
    });
  }

  /**
   * Connect to Redis with timeout to avoid hanging application
   */
  async _connectWithTimeout() {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        const timeout = setTimeout(() => {
          clearTimeout(timeout);
          reject(new Error('Redis connection timeout'));
        }, this.connectTimeout);
      });

      // Race connection against timeout
      await Promise.race([
        this.client.connect(),
        timeoutPromise
      ]);
      
      this.isConnected = true;
      logger.info('Successfully connected to Redis');
    } catch (error) {
      logger.error(`Redis connection failed: ${error.message}`, { 
        host: config.redis.host, 
        port: config.redis.port,
        timeout: this.connectTimeout
      });
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} - Cached value or null if not found
   */
  async get(key) {
    try {
      if (!this.isConnected || !this.client?.isReady) return null;
      
      const cachedData = await this.client.get(key);
      return cachedData ? JSON.parse(cachedData) : null;
    } catch (error) {
      logger.error(`Cache get error: ${error.message}`, { key, error });
      return null; // Fail gracefully - continue without cache
    }
  }

  /**
   * Set value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, data, ttlSeconds = config.redis.cacheTtl) {
    try {
      if (!this.isConnected || !this.client?.isReady) return false;
      
      await this.client.set(key, JSON.stringify(data), {
        EX: ttlSeconds
      });
      return true;
    } catch (error) {
      logger.error(`Cache set error: ${error.message}`, { key, error });
      return false; // Fail gracefully - continue without cache
    }
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success status
   */
  async del(key) {
    try {
      if (!this.isConnected || !this.client?.isReady) return false;
      
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error: ${error.message}`, { key, error });
      return false;
    }
  }

  /**
   * Delete keys matching pattern
   * @param {string} pattern - Key pattern to match
   * @returns {Promise<boolean>} - Success status
   */
  async deleteByPattern(pattern) {
    try {
      if (!this.isConnected || !this.client?.isReady) return false;
      
      let cursor = 0;
      let keys = [];
      
      do {
        const result = await this.client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100
        });
        
        cursor = result.cursor;
        keys = keys.concat(result.keys);
      } while (cursor !== 0);
      
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.info(`Deleted ${keys.length} cache keys matching pattern: ${pattern}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Cache pattern delete error: ${error.message}`, { pattern, error });
      return false;
    }
  }

  /**
   * Check if Redis is connected and ready
   * @returns {boolean} - Connection status
   */
  isReady() {
    return this.isConnected && this.client?.isReady;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      if (this.isConnected && this.client?.isReady) {
        await this.client.quit();
        logger.info('Redis connection closed gracefully');
      }
    } catch (error) {
      logger.error(`Error closing Redis connection: ${error.message}`, { error });
    } finally {
      this.isConnected = false;
    }
  }
}

// Create singleton instance
const redisCache = new RedisCacheManager();

// Initialize Redis - don't block application startup, but initialize in background
(async () => {
  try {
    await redisCache.initialize();
  } catch (err) {
    logger.error(`Failed to initialize Redis: ${err.message}`);
    // Application will continue without caching
  }
})();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await redisCache.shutdown();
});

process.on('SIGTERM', async () => {
  await redisCache.shutdown();
});

module.exports = redisCache;