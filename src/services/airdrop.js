/**
 * Airdrop Service for HopiumCore API
 * 
 * Fetches airdrop opportunities from the backend
 * Based on: docs/API_INTEGRATION_GUIDE.md - AirdropAlpha API
 * 
 * NOTE: All endpoints are PUBLIC - no authentication required!
 * Users do NOT need to be signed in to view airdrops.
 */

import API_CONFIG from '../config/api'

class AirdropService {
  /**
   * List all airdrops with optional filtering
   * @param {string} status - Filter by status ('Active', 'Ended', 'Coming Soon')
   * @param {number} limit - Number of results (default: 50, max: 100)
   * @param {number} offset - Pagination offset (default: 0)
   * @returns {Promise<{airdrops: Array, total: number, limit: number, offset: number}>}
   */
  async listAirdrops(status = null, limit = 50, offset = 0) {
    try {
      const params = new URLSearchParams()
      if (status) params.append('status', status)
      params.append('limit', limit.toString())
      params.append('offset', offset.toString())

      const url = `/api/airdrops?${params.toString()}`
      console.log('[AirdropService] Fetching airdrops:', url)

      // Public endpoint - no auth required
      const data = await API_CONFIG.fetch(url, { includeAuth: false })
      
      console.log('[AirdropService] Fetched', data.airdrops?.length || 0, 'airdrops')
      return data
    } catch (error) {
      console.error('[AirdropService] Failed to list airdrops:', error)
      throw error
    }
  }

  /**
   * Get specific airdrop by ID
   * @param {number} id - Airdrop ID
   * @returns {Promise<Object>} Airdrop object
   */
  async getAirdrop(id) {
    try {
      console.log('[AirdropService] Fetching airdrop:', id)

      // Public endpoint - no auth required
      const data = await API_CONFIG.fetch(`/api/airdrops/${id}`, { includeAuth: false })
      
      console.log('[AirdropService] Fetched airdrop:', data.name)
      return data
    } catch (error) {
      console.error('[AirdropService] Failed to get airdrop:', error)
      throw error
    }
  }

  /**
   * Get active airdrops (convenience method)
   * @returns {Promise<Array>} Array of active airdrops
   */
  async getActiveAirdrops() {
    const result = await this.listAirdrops('Active', 50, 0)
    return result.airdrops || []
  }

  /**
   * Get upcoming airdrops (convenience method)
   * @returns {Promise<Array>} Array of upcoming airdrops
   */
  async getUpcomingAirdrops() {
    const result = await this.listAirdrops('Coming Soon', 50, 0)
    return result.airdrops || []
  }
}

// Export singleton instance
const airdropService = new AirdropService()
export default airdropService

