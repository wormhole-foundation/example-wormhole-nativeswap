use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg};
use crate::state::{config, config_read, reply_state, ConfigInfo, ReplyState};
use cosmwasm_std::{
    coin, entry_point, to_binary, BankMsg, Binary, Coin, CosmosMsg, DepsMut, Env, MessageInfo,
    QueryRequest, Reply, Response, StdError, StdResult, SubMsg, WasmQuery,
};
use cosmwasm_std::{from_binary, WasmMsg};
use token_bridge_terra::msg::WormholeQueryMsg;
use token_bridge_terra::state::{
    Action, TokenBridgeMessage, TransferInfo, TransferWithPayloadInfo,
};
use wormhole::byte_utils::ByteUtils;
use wormhole::state::ParsedVAA;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(_deps: DepsMut, _env: Env, _msg: MigrateMsg) -> StdResult<Response> {
    Ok(Response::new())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    let state = ConfigInfo {
        token_bridge_contract: msg.token_bridge_contract,
        wormhole_contract: msg.wormhole_contract,
    };
    config(deps.storage).save(&state)?;

    Ok(Response::default())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(deps: DepsMut, env: Env, info: MessageInfo, msg: ExecuteMsg) -> StdResult<Response> {
    match msg {
        ExecuteMsg::SubmitVaa { data } => redeem_payload(deps, env, info, &data),
    }
}

// (1) get a VAA
// (2) forward VAA to the token bridge (send tokens to us)
// (3) send tokens to actual recipient

fn redeem_payload(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vaa: &Binary,
) -> StdResult<Response> {
    let parsed_vaa = parse_vaa(deps.branch(), env.block.time.seconds(), vaa)?;
    let data = parsed_vaa.payload;

    // TODO: maybe expose a token bridge query endpoint for this?
    let message = TokenBridgeMessage::deserialize(&data)?;

    if message.action != Action::TRANSFER_WITH_PAYLOAD {
        return Err(StdError::generic_err(
            "Only transfers with payload are supported",
        ));
    }

    let transfer_with_payload = TransferWithPayloadInfo::deserialize(&message.payload)?;

    let target_address = (&transfer_with_payload.transfer_info.recipient.as_slice()).get_address(0);
    let target_address_humanized = deps.api.addr_humanize(&target_address)?;

    if target_address_humanized != env.contract.address {
        return Err(StdError::generic_err(format!(
            "Transfer recipient must be {}",
            env.contract.address
        )));
    }

    let real_target_address = (&transfer_with_payload.payload.as_slice()).get_address(0);
    let real_target_address_humanized = deps.api.addr_humanize(&real_target_address)?;

    if reply_state(deps.storage).load().is_ok() {
        return Err(StdError::generic_err("Re-entrancy"));
    }

    if transfer_with_payload.transfer_info.token_address.as_slice()[0] != 1 {
        return Err(StdError::generic_err("Only native tokens are allowed"));
    }

    // Wipe the native byte marker and extract the serialized denom.
    let mut token_address = transfer_with_payload.transfer_info.token_address.clone();
    let token_address = token_address.as_mut_slice();
    token_address[0] = 0;

    let mut denom = token_address.to_vec();
    denom.retain(|&c| c != 0);
    let denom = String::from_utf8(denom).unwrap();

    let amount = transfer_with_payload.transfer_info.amount;
    let fee = transfer_with_payload.transfer_info.fee;

    // TODO: figure out fees
    let (not_supported_amount, mut amount) = amount;
    let (not_supported_fee, fee) = fee;

    amount = amount.checked_sub(fee).unwrap();

    // Check high 128 bit of amount value to be empty
    if not_supported_amount != 0 || not_supported_fee != 0 {
        return Err(StdError::generic_err("Amount too high"));
    }

    let state = ReplyState {
        amount,
        fee,
        denom,
        recipient: real_target_address_humanized,
        relayer: info.sender,
    };

    reply_state(deps.storage).save(&state)?;

    let cfg = config_read(deps.storage).load()?;

    let submessages = vec![SubMsg::reply_on_success(
        CosmosMsg::Wasm(WasmMsg::Execute {
            contract_addr: cfg.token_bridge_contract,
            msg: to_binary(&token_bridge_terra::msg::ExecuteMsg::SubmitVaa { data: vaa.clone() })?,
            funds: vec![],
        }),
        1,
    )];

    Ok(Response::new().add_submessages(submessages))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn reply(mut deps: DepsMut, _env: Env, _msg: Reply) -> StdResult<Response> {
    let ReplyState {
        amount,
        fee,
        denom,
        recipient,
        relayer,
    } = reply_state(deps.storage).load()?;
    reply_state(deps.storage).remove();

    let mut messages = vec![CosmosMsg::Bank(BankMsg::Send {
        to_address: recipient.to_string(),
        amount: coins_after_tax(deps.branch(), vec![coin(amount, &denom)])?,
    })];

    if fee != 0 {
        messages.push(CosmosMsg::Bank(BankMsg::Send {
            to_address: relayer.to_string(),
            amount: coins_after_tax(deps, vec![coin(fee, &denom)])?,
        }));
    }

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "reply_handler")
        .add_attribute("recipient", recipient)
        .add_attribute("denom", denom)
        .add_attribute("amount", amount.to_string())
        .add_attribute("fee", fee.to_string()))
}

// TODO: figure out if this is needed
pub fn coins_after_tax(_deps: DepsMut, coins: Vec<Coin>) -> StdResult<Vec<Coin>> {
    Ok(coins)
}
//     let mut res = vec![];
//     for coin in coins {
//         let asset = Asset {
//             amount: coin.amount.clone(),
//             info: AssetInfo::NativeToken {
//                 denom: coin.denom.clone(),
//             },
//         };
//         res.push(asset.deduct_tax(&deps.querier)?);
//     }
//     Ok(res)
// }

pub fn parse_vaa(deps: DepsMut, block_time: u64, data: &Binary) -> StdResult<ParsedVAA> {
    let cfg = config_read(deps.storage).load()?;
    let vaa: ParsedVAA = deps.querier.query(&QueryRequest::Wasm(WasmQuery::Smart {
        contract_addr: cfg.wormhole_contract.clone(),
        msg: to_binary(&WormholeQueryMsg::VerifyVAA {
            vaa: data.clone(),
            block_time,
        })?,
    }))?;
    Ok(vaa)
}
