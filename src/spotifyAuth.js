import axios from 'axios';
import crypto from 'crypto';
import { URLSearchParams } from 'url';
import open from 'open';
import http from 'http';

export class SpotifyAuth {
    constructor(clientId, clientSecret, redirectUri = 'http://127.0.0.1:3000/callback') {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.scopes = 'playlist-modify-public playlist-modify-private';
    }


    getAuthUrl() {
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            scope: this.scopes
        });

        return `https://accounts.spotify.com/authorize?${params.toString()}`;
    }

    async authenticate() {
        return new Promise((resolve, reject) => {
            const authUrl = this.getAuthUrl();
            console.log('Opening browser for Spotify authentication...');
            console.log('If browser doesn\'t open automatically, visit:', authUrl);
            
            open(authUrl);

            const server = http.createServer(async (req, res) => {
                const url = new URL(req.url, `http://${req.headers.host}`);
                
                if (url.pathname === '/callback') {
                    const code = url.searchParams.get('code');
                    const error = url.searchParams.get('error');

                    if (error) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end('<h1>Authentication failed</h1><p>You can close this window.</p>');
                        server.close();
                        reject(new Error(`Authentication failed: ${error}`));
                        return;
                    }

                    if (code) {
                        try {
                            await this.exchangeCodeForToken(code);
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end('<h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p>');
                            server.close();
                            resolve();
                        } catch (error) {
                            res.writeHead(500, { 'Content-Type': 'text/html' });
                            res.end('<h1>Authentication failed</h1><p>You can close this window.</p>');
                            server.close();
                            reject(error);
                        }
                    }
                }
            });

            server.listen(3000, () => {
                console.log('Waiting for authentication...');
            });

            setTimeout(() => {
                server.close();
                reject(new Error('Authentication timeout'));
            }, 300000); // 5 minutes timeout
        });
    }

    async exchangeCodeForToken(code) {
        try {
            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            
            const response = await axios.post('https://accounts.spotify.com/api/token', 
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: this.redirectUri
                }),
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

            return this.accessToken;
        } catch (error) {
            throw new Error(`Failed to exchange code for token: ${error.response?.data?.error_description || error.message}`);
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            
            const response = await axios.post('https://accounts.spotify.com/api/token',
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken
                }),
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

            if (response.data.refresh_token) {
                this.refreshToken = response.data.refresh_token;
            }

            return this.accessToken;
        } catch (error) {
            throw new Error(`Failed to refresh token: ${error.response?.data?.error_description || error.message}`);
        }
    }

    async getValidAccessToken() {
        if (!this.accessToken) {
            throw new Error('Not authenticated. Please run authenticate() first.');
        }

        if (Date.now() >= this.tokenExpiry - 60000) { // Refresh 1 minute before expiry
            await this.refreshAccessToken();
        }

        return this.accessToken;
    }

    getAuthHeaders() {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        return {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
        };
    }
}