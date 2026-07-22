// App-level directory key for Lobby Beacons (allows global discovery without spamming personal profiles)
import { getPublicKey } from 'nostr-tools';
import { hexToBytes } from './nostr';

// A deterministic key for the Bloom App Directory
const DIRECTORY_SK_HEX = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
export const DIRECTORY_SK = hexToBytes(DIRECTORY_SK_HEX);
export const DIRECTORY_PK = getPublicKey(DIRECTORY_SK);
