# Apple Music to Spotify Playlist Converter

A CLI tool to convert Apple Music playlists (exported as tab-delimited text files) into Spotify playlists using the Spotify Web API.

## Features

- Parse Apple Music playlist exports in tab-delimited text format
- Search for tracks on Spotify with intelligent matching
- Create new Spotify playlists
- Handle authentication via Spotify Web API
- Provide detailed conversion reports
- Save lists of tracks that couldn't be found

## Prerequisites

- Node.js 18 or higher
- A Spotify account
- Spotify Developer App credentials

## Setup

1. **Install the tool:**
   ```bash
   npm install -g .
   ```

2. **Get Spotify API credentials:**
   ```bash
   apple-to-spotify setup
   ```
   
   Follow the instructions to create a Spotify app and get your Client ID and Client Secret.

3. **Configure credentials** (choose one method):
   
   **Option A: Environment variables**
   ```bash
   export SPOTIFY_CLIENT_ID="your_client_id"
   export SPOTIFY_CLIENT_SECRET="your_client_secret"
   ```
   
   **Option B: .env file**
   Create a `.env` file in your working directory:
   ```
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```
   
   **Option C: Command line arguments**
   Use `--client-id` and `--client-secret` flags with each command.

## Usage

### Export Apple Music Playlist

1. Open Apple Music (or iTunes)
2. Select your playlist
3. Go to **File > Library > Export Playlist**
4. Choose **Text Files (.txt)** as the format
5. Save the file

### Convert to Spotify

```bash
apple-to-spotify convert -f "My Playlist.txt"
```

**Options:**
- `-f, --file <path>` - Path to Apple Music playlist text file (required)
- `-n, --name <name>` - Name for the Spotify playlist (defaults to filename)
- `-d, --description <description>` - Description for the playlist
- `--public` - Make the playlist public (default: private)
- `--client-id <id>` - Spotify Client ID
- `--client-secret <secret>` - Spotify Client Secret

### Examples

```bash
# Basic conversion
apple-to-spotify convert -f "My Playlist.txt"

# Custom name and description
apple-to-spotify convert -f "playlist.txt" -n "My Converted Playlist" -d "Converted from Apple Music"

# Public playlist
apple-to-spotify convert -f "playlist.txt" --public

# With inline credentials
apple-to-spotify convert -f "playlist.txt" --client-id "your_id" --client-secret "your_secret"
```

## How It Works

1. **Parse**: Reads the Apple Music tab-delimited text file
2. **Authenticate**: Opens browser for Spotify OAuth authentication
3. **Search**: Searches Spotify for each track using intelligent matching:
   - Exact matches get highest priority
   - Partial matches for track name, artist, album
   - Duration comparison for better accuracy
4. **Create**: Creates a new Spotify playlist
5. **Add**: Adds found tracks to the playlist
6. **Report**: Shows conversion results and saves unfound tracks

## Apple Music Export Format

The tool expects Apple Music playlists exported in tab-delimited text format with these key columns:
- **Name** - Song title
- **Artist** - Artist name  
- **Album** - Album name (optional, helps with matching)
- **Time** - Duration (optional, helps with matching)
- **Year** - Release year (optional)

## Troubleshooting

### Authentication Issues
- Make sure your Spotify app has `http://127.0.0.1:3000/callback` as a redirect URI
- Check that your Client ID and Client Secret are correct
- Ensure you're using the correct Spotify account

### Track Matching Issues
- The tool uses fuzzy matching to find the best matches
- Some tracks may not be available on Spotify
- Tracks not found are saved to a separate file for manual review

### Rate Limiting
- The tool includes automatic delays to respect Spotify's rate limits
- Large playlists may take several minutes to process

## File Structure

```
apple-to-spotify-converter/
├── src/
│   ├── applePlaylistParser.js  # Parse Apple Music exports
│   ├── spotifyAuth.js          # Spotify authentication
│   └── spotifyClient.js        # Spotify API client
├── index.js                    # Main CLI interface
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## License

MIT