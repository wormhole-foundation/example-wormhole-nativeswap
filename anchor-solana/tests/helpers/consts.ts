import { hexToUint8Array } from "@certusone/wormhole-sdk";
import { web3 } from "@project-serum/anchor";

// wormhole
//export const CORE_BRIDGE_ADDRESS = new web3.PublicKey("Bridge1p5gheXUvJ6jGWGeCsgPKgnE3YgdGKRVCMY9o");
export const CORE_BRIDGE_ADDRESS = new web3.PublicKey(process.env.CORE_BRIDGE_ADDRESS);
export const TOKEN_BRIDGE_ADDRESS = new web3.PublicKey(process.env.TOKEN_BRIDGE_ADDRESS);
