use cosmwasm_std::{Addr, Storage};
use cosmwasm_storage::{singleton, singleton_read, ReadonlySingleton, Singleton};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub static CONFIG_KEY: &[u8] = b"config";
pub static REPLY_STATE_KEY: &[u8] = b"reply_state";

type HumanAddr = String;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ConfigInfo {
    pub token_bridge_contract: HumanAddr,
    pub wormhole_contract: HumanAddr,
}

pub fn config(storage: &mut dyn Storage) -> Singleton<ConfigInfo> {
    singleton(storage, CONFIG_KEY)
}

pub fn config_read(storage: &dyn Storage) -> ReadonlySingleton<ConfigInfo> {
    singleton_read(storage, CONFIG_KEY)
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ReplyState {
    pub amount_buf: [u8; 16],
    pub fee_buf: [u8; 16],
    pub denom: String,
    pub recipient: Addr,
    pub relayer: Addr,
}

pub fn reply_state(storage: &mut dyn Storage) -> Singleton<ReplyState> {
    singleton(storage, REPLY_STATE_KEY)
}
