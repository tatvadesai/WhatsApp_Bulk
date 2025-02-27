const logger = require('./logger');

/**
 * RateLimiter class to prevent sending too many messages in a short time period
 * This helps avoid being blocked by WhatsApp for suspicious activity
 */
class RateLimiter {
    /**
     * Create a new rate limiter
     * @param {number} maxRequests - Maximum number of requests allowed in the time window
     * @param {number} timeWindow - Time window in milliseconds
     */
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests; // Max requests in time window
        this.timeWindow = timeWindow; // Time window in milliseconds
        this.timestamps = [];
        logger.debug(`Rate limiter initialized: ${maxRequests} requests per ${timeWindow}ms`);
    }
    
    /**
     * Throttle requests to stay within the rate limit
     * Will wait if necessary before allowing the next request
     * @returns {Promise<void>} - Resolves when it's safe to proceed
     */
    async throttle() {
        // Clean up old timestamps outside the time window
        const now = Date.now();
        this.timestamps = this.timestamps.filter(time => now - time < this.timeWindow);
        
        if (this.timestamps.length >= this.maxRequests) {
            // Calculate how long to wait
            const oldestTimestamp = this.timestamps[0];
            const timeToWait = this.timeWindow - (now - oldestTimestamp);
            
            if (timeToWait > 0) {
                logger.info(`Rate limiting: waiting ${Math.ceil(timeToWait/1000)}s before sending next message`);
                await new Promise(resolve => setTimeout(resolve, timeToWait));
            }
        }
        
        // Add current timestamp and proceed
        this.timestamps.push(Date.now());
    }
    
    /**
     * Get current status of the rate limiter
     * @returns {Object} Current status information
     */
    getStatus() {
        const now = Date.now();
        // Clean up old timestamps
        this.timestamps = this.timestamps.filter(time => now - time < this.timeWindow);
        
        return {
            currentRequests: this.timestamps.length,
            maxRequests: this.maxRequests,
            isLimited: this.timestamps.length >= this.maxRequests,
            remainingRequests: Math.max(0, this.maxRequests - this.timestamps.length)
        };
    }
}

module.exports = RateLimiter; 