import fs from 'fs-extra';

export class ApplePlaylistParser {
    constructor() {
        this.headers = [];
        this.tracks = [];
    }

    async parseFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());
            
            if (lines.length === 0) {
                throw new Error('File is empty');
            }

            this.headers = lines[0].split('\t');
            this.tracks = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split('\t');
                const track = {};
                
                this.headers.forEach((header, index) => {
                    track[header] = values[index] || '';
                });
                
                this.tracks.push(track);
            }

            return this.tracks;
        } catch (error) {
            throw new Error(`Error parsing Apple Music playlist: ${error.message}`);
        }
    }

    getTracksForSpotify() {
        return this.tracks.map(track => ({
            name: track.Name || '',
            artist: track.Artist || '',
            album: track.Album || '',
            year: track.Year || '',
            duration: this.parseTime(track.Time),
            originalTrack: track
        })).filter(track => track.name && track.artist);
    }

    parseTime(timeString) {
        if (!timeString) return 0;
        
        const parts = timeString.split(':');
        if (parts.length === 2) {
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        } else if (parts.length === 3) {
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
        
        return parseInt(timeString) || 0;
    }

    getPlaylistInfo() {
        return {
            totalTracks: this.tracks.length,
            validTracks: this.getTracksForSpotify().length,
            headers: this.headers
        };
    }
}