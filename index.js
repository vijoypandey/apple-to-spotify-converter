#!/usr/bin/env node

import { program } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';
import { ApplePlaylistParser } from './src/applePlaylistParser.js';
import { AppleXmlParser } from './src/appleXmlParser.js';
import { SpotifyAuth } from './src/spotifyAuth.js';
import { SpotifyClient } from './src/spotifyClient.js';

dotenv.config();

# Converting from Apple Music to Spotify
program
  .name('apple-to-spotify')
  .description('Convert Apple Music playlists to Spotify playlists')
  .version('1.0.0');

program
  .command('convert')
  .description('Convert an Apple Music playlist to Spotify')
  .requiredOption('-f, --file <path>', 'Path to the Apple Music playlist file (.txt or .xml)')
  .option('-n, --name <name>', 'Name for the new Spotify playlist (defaults to filename)')
  .option('-d, --description <description>', 'Description for the new Spotify playlist')
  .option('-p, --playlist <playlistName>', 'Specific playlist name to convert (only for XML files)')
  .option('--public', 'Make the playlist public (default: private)')
  .option('--client-id <clientId>', 'Spotify Client ID (can also use SPOTIFY_CLIENT_ID env var)')
  .option('--client-secret <clientSecret>', 'Spotify Client Secret (can also use SPOTIFY_CLIENT_SECRET env var)')
  .action(async (options) => {
    try {
      await convertPlaylist(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('list-playlists')
  .description('List all playlists in an iTunes/Apple Music XML library file')
  .requiredOption('-f, --file <path>', 'Path to the Apple Music XML library file')
  .action(async (options) => {
    try {
      await listPlaylists(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Set up Spotify API credentials')
  .action(() => {
    console.log('\\n🎵 Apple Music to Spotify Converter Setup\\n');
    console.log('To use this tool, you need to register a Spotify app and get credentials:\\n');
    console.log('1. Go to https://developer.spotify.com/dashboard');
    console.log('2. Log in with your Spotify account');
    console.log('3. Click "Create an App"');
    console.log('4. Fill in the app name and description');
    console.log('5. Add "http://127.0.0.1:3000/callback" as a redirect URI');
    console.log('6. Copy your Client ID and Client Secret\\n');
    console.log('You can provide credentials via:');
    console.log('  • Command line: --client-id <id> --client-secret <secret>');
    console.log('  • Environment variables: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET');
    console.log('  • .env file in the project directory\\n');
  });

async function convertPlaylist(options) {
  const clientId = options.clientId || process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = options.clientSecret || process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Spotify credentials not provided.');
    console.error('Run "apple-to-spotify setup" for instructions on getting credentials.');
    process.exit(1);
  }

  if (!await fs.pathExists(options.file)) {
    throw new Error(`File not found: ${options.file}`);
  }

  const fileExt = path.extname(options.file).toLowerCase();
  let parser, playlistInfo, appleTracks;

  if (fileExt === '.xml') {
    console.log('🍎 Parsing Apple Music XML library...');
    parser = new AppleXmlParser();
    await parser.parseFile(options.file);
    
    if (options.playlist) {
      playlistInfo = parser.getPlaylistInfo(options.playlist);
      appleTracks = parser.getTracksForSpotify(options.playlist);
      console.log(`📊 Playlist "${options.playlist}": ${playlistInfo.totalTracks} total tracks, ${appleTracks.length} valid for conversion`);
    } else {
      playlistInfo = parser.getPlaylistInfo();
      appleTracks = parser.getTracksForSpotify();
      console.log(`📊 Library: ${playlistInfo.totalTracks} total tracks, ${appleTracks.length} valid for conversion`);
      
      if (playlistInfo.playlists && playlistInfo.playlists.length > 0) {
        console.log('\n📋 Available playlists:');
        playlistInfo.playlists.forEach(p => {
          console.log(`  • ${p.name} (${p.itemCount} tracks)`);
        });
        console.log('\n💡 Use -p "playlist name" to convert a specific playlist instead of the entire library');
      }
    }
  } else {
    console.log('🍎 Parsing Apple Music playlist...');
    parser = new ApplePlaylistParser();
    await parser.parseFile(options.file);
    
    playlistInfo = parser.getPlaylistInfo();
    appleTracks = parser.getTracksForSpotify();
    console.log(`📊 Parsed ${playlistInfo.totalTracks} total tracks, ${appleTracks.length} valid for conversion`);
  }

  if (appleTracks.length === 0) {
    throw new Error('No valid tracks found in the playlist file');
  }

  console.log('\\n🔐 Authenticating with Spotify...');
  const auth = new SpotifyAuth(clientId, clientSecret);
  await auth.authenticate();
  
  const client = new SpotifyClient(auth);
  const user = await client.getCurrentUser();
  console.log(`✅ Authenticated as: ${user.display_name || user.id}`);

  console.log('\\n🔍 Searching for tracks on Spotify...');
  const searchResults = await client.searchAndMatchTracks(appleTracks);

  console.log(`\\n📋 Search Results:`);
  console.log(`  ✅ Found: ${searchResults.found.length}/${searchResults.total}`);
  console.log(`  ❌ Not found: ${searchResults.notFound.length}/${searchResults.total}`);

  if (searchResults.notFound.length > 0) {
    console.log('\\n❌ Tracks not found on Spotify:');
    searchResults.notFound.forEach(track => {
      console.log(`  • "${track.name}" by "${track.artist}"`);
    });
  }

  if (searchResults.found.length === 0) {
    throw new Error('No tracks were found on Spotify');
  }

  let defaultName;
  if (fileExt === '.xml' && options.playlist) {
    defaultName = options.playlist;
  } else {
    defaultName = path.basename(options.file, path.extname(options.file));
  }
  
  const playlistName = options.name || defaultName;
  const description = options.description || `Converted from Apple Music ${fileExt === '.xml' ? 'library' : 'playlist'} • ${new Date().toLocaleDateString()}`;

  console.log(`\\n📝 Creating Spotify playlist: "${playlistName}"`);
  const playlist = await client.createPlaylist(user.id, playlistName, description, options.public || false);
  console.log(`✅ Playlist created: ${playlist.external_urls.spotify}`);

  console.log('\\n🎵 Adding tracks to playlist...');
  const trackUris = searchResults.found.map(result => result.uri);
  await client.addTracksToPlaylist(playlist.id, trackUris);
  
  console.log(`\\n🎉 Success! Converted ${searchResults.found.length} tracks to Spotify playlist.`);
  console.log(`🔗 Playlist URL: ${playlist.external_urls.spotify}`);

  if (searchResults.notFound.length > 0) {
    const failedFile = `${playlistName}_not_found.txt`;
    const failedContent = searchResults.notFound
      .map(track => `${track.name}\\t${track.artist}\\t${track.album}`)
      .join('\\n');
    
    await fs.writeFile(failedFile, `Name\\tArtist\\tAlbum\\n${failedContent}`);
    console.log(`📄 Tracks not found saved to: ${failedFile}`);
  }
}

async function listPlaylists(options) {
  if (!await fs.pathExists(options.file)) {
    throw new Error(`File not found: ${options.file}`);
  }

  const fileExt = path.extname(options.file).toLowerCase();
  if (fileExt !== '.xml') {
    throw new Error('list-playlists command only works with XML library files');
  }

  console.log('🍎 Parsing Apple Music XML library...');
  const parser = new AppleXmlParser();
  await parser.parseFile(options.file);
  
  const playlists = parser.listPlaylists();
  const libraryInfo = parser.getPlaylistInfo();

  console.log(`📊 Library contains ${libraryInfo.totalTracks} tracks`);
  console.log(`📋 Found ${playlists.length} playlists:\n`);

  if (playlists.length === 0) {
    console.log('No playlists found in the library.');
  } else {
    playlists.forEach((playlist, index) => {
      console.log(`${index + 1}. ${playlist.name} (${playlist.itemCount} tracks)`);
    });
    
    console.log(`\n💡 To convert a specific playlist, use:`);
    console.log(`   node index.js convert -f "${options.file}" -p "playlist name"`);
  }
}

program.parse();
