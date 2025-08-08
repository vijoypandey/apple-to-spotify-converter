import fs from 'fs-extra';
import xml2js from 'xml2js';

export class AppleXmlParser {
    constructor() {
        this.tracks = [];
        this.playlists = [];
    }

    async parseFile(filePath) {
        try {
            const xmlContent = await fs.readFile(filePath, 'utf8');
            const parser = new xml2js.Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(xmlContent);

            const plist = result.plist;
            if (!plist || !plist.dict) {
                throw new Error('Invalid iTunes/Apple Music XML format');
            }

            const mainDict = plist.dict;
            this.extractTracks(mainDict);
            this.extractPlaylists(mainDict);

            return this.tracks;
        } catch (error) {
            throw new Error(`Error parsing Apple Music XML: ${error.message}`);
        }
    }

    extractTracks(mainDict) {
        // The main dict has keys and corresponding values
        // We need to find the 'Tracks' key and get its corresponding dict value
        const keys = Array.isArray(mainDict.key) ? mainDict.key : [mainDict.key];
        const tracksIndex = keys.indexOf('Tracks');
        
        if (tracksIndex === -1) {
            console.warn('No Tracks key found in XML file');
            return;
        }

        // Get the tracks dict - it should be the single dict in mainDict.dict
        const tracksDict = mainDict.dict;
        
        if (!tracksDict || !tracksDict.key || !tracksDict.dict) {
            console.warn('No tracks dict found');
            return;
        }

        const trackIds = Array.isArray(tracksDict.key) ? tracksDict.key : [tracksDict.key];
        const trackDicts = Array.isArray(tracksDict.dict) ? tracksDict.dict : [tracksDict.dict];

        console.log(`Found ${trackIds.length} track entries`);

        for (let i = 0; i < trackIds.length && i < trackDicts.length; i++) {
            const trackId = trackIds[i];
            const trackData = trackDicts[i];
            
            const track = this.parseDict(trackData);
            if (track && track.Name && (track.Artist || track['Album Artist'])) {
                track['Track ID'] = parseInt(trackId);
                this.tracks.push(track);
            }
        }
    }

    extractPlaylists(mainDict) {
        // Find the 'Playlists' key and get its corresponding array value
        const keys = Array.isArray(mainDict.key) ? mainDict.key : [mainDict.key];
        const playlistsIndex = keys.indexOf('Playlists');
        
        if (playlistsIndex === -1) {
            console.warn('No Playlists key found in XML file');
            return;
        }

        // Get the playlists array - it should be the single array in mainDict.array
        const playlistsArray = mainDict.array;
        
        if (!playlistsArray || !playlistsArray.dict) {
            console.warn('No playlists array found');
            return;
        }

        const playlistDicts = Array.isArray(playlistsArray.dict) ? playlistsArray.dict : [playlistsArray.dict];

        for (const playlistData of playlistDicts) {
            const playlist = this.parseDict(playlistData);
            if (playlist && playlist.Name) {
                this.playlists.push(playlist);
            }
        }
    }

    parseDict(dictData) {
        if (!dictData || !dictData.key) {
            return {};
        }

        const result = {};
        const keys = Array.isArray(dictData.key) ? dictData.key : [dictData.key];
        
        // Get all value arrays
        const strings = dictData.string ? (Array.isArray(dictData.string) ? dictData.string : [dictData.string]) : [];
        const integers = dictData.integer ? (Array.isArray(dictData.integer) ? dictData.integer : [dictData.integer]) : [];
        const dates = dictData.date ? (Array.isArray(dictData.date) ? dictData.date : [dictData.date]) : [];
        const trues = dictData.true !== undefined ? (Array.isArray(dictData.true) ? dictData.true.length : 1) : 0;
        const falses = dictData.false !== undefined ? (Array.isArray(dictData.false) ? dictData.false.length : 1) : 0;
        const arrays = dictData.array ? (Array.isArray(dictData.array) ? dictData.array : [dictData.array]) : [];

        // Track indices for each value type
        let stringIndex = 0, integerIndex = 0, dateIndex = 0, trueCount = 0, falseCount = 0, arrayIndex = 0;

        // Match keys with values in order
        for (const key of keys) {
            let value = null;

            // Try each value type in order until we find one
            if (stringIndex < strings.length) {
                value = this.cleanString(strings[stringIndex]);
                stringIndex++;
            } else if (integerIndex < integers.length) {
                value = parseInt(integers[integerIndex]);
                integerIndex++;
            } else if (dateIndex < dates.length) {
                value = new Date(dates[dateIndex]);
                dateIndex++;
            } else if (trueCount < trues) {
                value = true;
                trueCount++;
            } else if (falseCount < falses) {
                value = false;
                falseCount++;
            } else if (arrayIndex < arrays.length) {
                const arrayData = arrays[arrayIndex];
                if (key === 'Playlist Items' && arrayData.dict) {
                    value = this.parsePlaylistItems(arrayData);
                } else {
                    value = arrayData;
                }
                arrayIndex++;
            }

            if (value !== null && value !== undefined) {
                result[key] = value;
            }
        }

        return result;
    }

    parsePlaylistItems(arrayData) {
        const items = [];
        const itemDicts = Array.isArray(arrayData.dict) ? arrayData.dict : [arrayData.dict];
        
        for (const itemDict of itemDicts) {
            const item = this.parseDict(itemDict);
            if (item['Track ID']) {
                items.push({ 'Track ID': item['Track ID'] });
            }
        }
        
        return items;
    }

    cleanString(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/&#38;/g, '&')
                  .replace(/&#39;/g, "'")
                  .replace(/&quot;/g, '"')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>');
    }

    getTracksForSpotify(playlistName = null) {
        let tracksToConvert = [];

        if (playlistName) {
            const playlist = this.playlists.find(p => p.Name === playlistName);
            if (!playlist || !playlist['Playlist Items']) {
                throw new Error(`Playlist "${playlistName}" not found or has no tracks`);
            }

            const trackIds = playlist['Playlist Items'].map(item => item['Track ID']).filter(id => id);
            tracksToConvert = this.tracks.filter(track => trackIds.includes(track['Track ID']));
        } else {
            tracksToConvert = this.tracks;
        }

        return tracksToConvert.map(track => ({
            name: this.cleanString(track.Name || ''),
            artist: this.cleanString(track.Artist || track['Album Artist'] || ''),
            album: this.cleanString(track.Album || ''),
            year: track.Year ? track.Year.toString() : '',
            duration: track['Total Time'] ? Math.round(track['Total Time'] / 1000) : 0,
            originalTrack: track
        })).filter(track => track.name && track.artist);
    }

    getPlaylistInfo(playlistName = null) {
        if (playlistName) {
            const playlist = this.playlists.find(p => p.Name === playlistName);
            if (!playlist) {
                throw new Error(`Playlist "${playlistName}" not found`);
            }

            const playlistTracks = this.getTracksForSpotify(playlistName);
            return {
                name: playlist.Name,
                totalTracks: playlist['Playlist Items'] ? playlist['Playlist Items'].length : 0,
                validTracks: playlistTracks.length,
                playlist: playlist
            };
        } else {
            const validTracks = this.getTracksForSpotify();
            return {
                totalTracks: this.tracks.length,
                validTracks: validTracks.length,
                playlists: this.playlists.map(p => ({
                    name: p.Name,
                    itemCount: p['Playlist Items'] ? p['Playlist Items'].length : 0,
                    master: !!p.Master,
                    folder: !!p['Parent Persistent ID']
                })).filter(p => p.name)
            };
        }
    }

    listPlaylists() {
        return this.playlists
            .filter(p => p.Name && !p['Parent Persistent ID'] && !p.Master) // Exclude folders and master library
            .map(p => ({
                name: p.Name,
                itemCount: p['Playlist Items'] ? p['Playlist Items'].length : 0,
                persistent_id: p['Playlist Persistent ID']
            }));
    }
}