/**
 * Aster Finance API Client
 * 
 * Handles all HTTP requests to Aster Finance Futures API
 * Base URL: https://fapi.asterdex.com
 */

const ASTER_API_BASE = 'https://fapi.asterdex.com'

/**
 * Generate HMAC SHA256 signature for Aster API using Web Crypto API
 * @param {string} secretKey - API secret key
 * @param {string} queryString - Query string to sign
 * @returns {Promise<string>} Hex signature
 */
async function generateSignature(secretKey, queryString) {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secretKey)
  const messageData = encoder.encode(queryString)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  const hashArray = Array.from(new Uint8Array(signature))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Build query string from parameters (for signature generation - no encoding)
 * @param {Object} params - Parameters object
 * @returns {string} Query string without URL encoding
 */
function buildQueryStringForSignature(params) {
  return Object.keys(params)
    .sort()
    .map(key => `${key}=${String(params[key])}`)
    .join('&')
}

/**
 * Build query string from parameters (for URL - with encoding)
 * @param {Object} params - Parameters object
 * @returns {string} URL-encoded query string
 */
function buildQueryString(params) {
  return Object.keys(params)
    .sort()
    .map(key => `${key}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

/**
 * Aster Finance API Client
 */
export class AsterApiClient {
  constructor(apiKey, secretKey) {
    this.apiKey = apiKey
    this.secretKey = secretKey
    this.baseUrl = ASTER_API_BASE
  }

  /**
   * Make a signed request to Aster API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Request parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async request(method, endpoint, params = {}, options = {}) {
    const url = `${this.baseUrl}${endpoint}`
    
    // Add timestamp and recvWindow for signed endpoints
    const isSigned = options.signed !== false
    if (isSigned) {
      params.timestamp = Date.now()
      if (options.recvWindow) {
        params.recvWindow = options.recvWindow
      }
    }

    // Generate signature for signed endpoints
    // IMPORTANT: Signature must be generated from query string WITHOUT the signature parameter
    // Signature must be generated from UNENCODED query string
    let signature = null
    if (isSigned && this.secretKey) {
      // Create a copy of params without signature (in case it was accidentally included)
      const paramsForSignature = { ...params }
      delete paramsForSignature.signature
      
      const queryStringForSignature = buildQueryStringForSignature(paramsForSignature)
      signature = await generateSignature(this.secretKey, queryStringForSignature)
      params.signature = signature
    }

    // Build final URL with query string (with encoding for URL)
    // Note: Signature should be appended without encoding since it's already hex
    let finalQueryString
    if (isSigned && signature) {
      // Build query string for all params except signature
      const paramsWithoutSig = { ...params }
      delete paramsWithoutSig.signature
      const encodedQuery = buildQueryString(paramsWithoutSig)
      // Append signature without encoding (hex strings don't need encoding)
      finalQueryString = `${encodedQuery}&signature=${signature}`
    } else {
      finalQueryString = buildQueryString(params)
    }
    const requestUrl = `${url}?${finalQueryString}`

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    }

    if (this.apiKey) {
      headers['X-MBX-APIKEY'] = this.apiKey
    }

    try {
      const response = await fetch(requestUrl, {
        method,
        headers,
        ...options.fetchOptions
      })

      const responseText = await response.text()
      let data
      try {
        data = JSON.parse(responseText)
      } catch (jsonError) {
        // If response is not JSON, log the raw text
        console.error('[AsterApiClient] Non-JSON response:', {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          text: responseText.substring(0, 500)
        })
        throw new Error(`Invalid response format: ${response.status} ${response.statusText}`)
      }

      // Log API errors for debugging
      if (!response.ok || (data.code && data.code < 0)) {
        console.error('[AsterApiClient] API Error:', {
          endpoint,
          status: response.status,
          code: data.code,
          msg: data.msg,
          data: data
        })
      }

      if (!response.ok) {
        throw new Error(data.msg || `HTTP ${response.status}: ${response.statusText}`)
      }

      // Check for Aster API error codes
      if (data.code && data.code < 0) {
        throw new Error(data.msg || `API Error ${data.code}`)
      }

      return data
    } catch (error) {
      // Enhance error messages
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Network error: Unable to connect to Aster Finance API')
      }
      throw error
    }
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}, options = {}) {
    return this.request('GET', endpoint, params, options)
  }

  /**
   * POST request
   */
  async post(endpoint, params = {}, options = {}) {
    return this.request('POST', endpoint, params, options)
  }

  /**
   * DELETE request
   */
  async delete(endpoint, params = {}, options = {}) {
    return this.request('DELETE', endpoint, params, options)
  }

  /**
   * PUT request
   */
  async put(endpoint, params = {}, options = {}) {
    return this.request('PUT', endpoint, params, options)
  }
}

export default AsterApiClient

