import axios from 'axios';

export class SpotifyClient {
    constructor(auth) {
        this.auth = auth;
        this.baseUrl = 'https://api.spotify.com/v1';
    }

    async searchTrack(trackName, artistName, albumName = '') {
        try {
            const token = await this.auth.getValidAccessToken();
            
            let query = `track:"${trackName}" artist:"${artistName}"`;
            if (albumName) {
                query += ` album:"${albumName}"`;
            }

            const response = await axios.get(`${this.baseUrl}/search`, {
                headers: this.auth.getAuthHeaders(),
                params: {
                    q: query,
                    type: 'track',
                    limit: 5
                }
            });

            const tracks = response.data.tracks.items;
            
            if (tracks.length === 0) {
                query = `"${trackName}" "${artistName}"`;
                const fallbackResponse = await axios.get(`${this.baseUrl}/search`, {
                    headers: this.auth.getAuthHeaders(),
                    params: {
                        q: query,
                        type: 'track',
                        limit: 5
                    }
                });
                return fallbackResponse.data.tracks.items;
            }

            return tracks;
        } catch (error) {
            console.warn(`Search failed for "${trackName}" by "${artistName}":`, error.response?.data?.error?.message || error.message);
            return [];
        }
    }

    findBestMatch(searchResults, originalTrack) {
        if (searchResults.length === 0) return null;
        if (searchResults.length === 1) return searchResults[0];

        const normalizeString = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
        
        const originalTrackNorm = normalizeString(originalTrack.name);
        const originalArtistNorm = normalizeString(originalTrack.artist);

        let bestMatch = searchResults[0];
        let bestScore = 0;

        for (const track of searchResults) {
            const trackNameNorm = normalizeString(track.name);
            const artistNameNorm = normalizeString(track.artists[0].name);
            
            let score = 0;
            
            if (trackNameNorm === originalTrackNorm) score += 10;
            else if (trackNameNorm.includes(originalTrackNorm) || originalTrackNorm.includes(trackNameNorm)) score += 5;
            
            if (artistNameNorm === originalArtistNorm) score += 10;
            else if (artistNameNorm.includes(originalArtistNorm) || originalArtistNorm.includes(artistNameNorm)) score += 5;

            if (originalTrack.album) {
                const originalAlbumNorm = normalizeString(originalTrack.album);
                const albumNameNorm = normalizeString(track.album.name);
                
                if (albumNameNorm === originalAlbumNorm) score += 3;
                else if (albumNameNorm.includes(originalAlbumNorm) || originalAlbumNorm.includes(albumNameNorm)) score += 1;
            }

            if (originalTrack.duration && track.duration_ms) {
                const durationDiff = Math.abs(originalTrack.duration - (track.duration_ms / 1000));
                if (durationDiff <= 2) score += 2;
                else if (durationDiff <= 5) score += 1;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = track;
            }
        }

        return bestMatch;
    }

    async getCurrentUser() {
        try {
            const token = await this.auth.getValidAccessToken();
            const response = await axios.get(`${this.baseUrl}/me`, {
                headers: this.auth.getAuthHeaders()
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get current user: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    async createPlaylist(userId, name, description = '', isPublic = false) {
        try {
            const token = await this.auth.getValidAccessToken();
            const response = await axios.post(`${this.baseUrl}/users/${userId}/playlists`, {
                name: name,
                description: description,
                public: isPublic
            }, {
                headers: this.auth.getAuthHeaders()
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to create playlist: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    async addTracksToPlaylist(playlistId, trackUris, batchSize = 100) {
        try {
            const token = await this.auth.getValidAccessToken();
            const results = [];

            for (let i = 0; i < trackUris.length; i += batchSize) {
                const batch = trackUris.slice(i, i + batchSize);
                const response = await axios.post(`${this.baseUrl}/playlists/${playlistId}/tracks`, {
                    uris: batch
                }, {
                    headers: this.auth.getAuthHeaders()
                });
                results.push(response.data);

                if (i + batchSize < trackUris.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return results;
        } catch (error) {
            throw new Error(`Failed to add tracks to playlist: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    async searchAndMatchTracks(appleTracks) {
        const results = {
            found: [],
            notFound: [],
            total: appleTracks.length
        };

        console.log(`Searching for ${appleTracks.length} tracks on Spotify...`);

        for (let i = 0; i < appleTracks.length; i++) {
            const track = appleTracks[i];
            console.log(`[${i + 1}/${appleTracks.length}] Searching: "${track.name}" by "${track.artist}"`);

            const searchResults = await this.searchTrack(track.name, track.artist, track.album);
            const bestMatch = this.findBestMatch(searchResults, track);

            if (bestMatch) {
                results.found.push({
                    original: track,
                    spotify: bestMatch,
                    uri: bestMatch.uri
                });
                console.log(`  ✓ Found: "${bestMatch.name}" by "${bestMatch.artists[0].name}"`);
            } else {
                results.notFound.push(track);
                console.log(`  ✗ Not found`);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return results;
    }
}