use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg};
use crate::state::{config, config_read, recipient, ConfigInfo};
use cosmwasm_std::{
    entry_point, to_binary, Binary, CosmosMsg, DepsMut, Env, MessageInfo, QueryRequest, Reply,
    Response, StdResult, SubMsg, WasmMsg, WasmQuery,
};
use token_bridge_terra::msg::WormholeQueryMsg;
use token_bridge_terra::state::{Action, TokenBridgeMessage, TransferWithPayloadInfo};
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
        ExecuteMsg::RedeemPayload { data } => redeem_payload(deps, env, info, &data),
    }
}

fn redeem_payload(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vaa: &Binary,
) -> StdResult<Response> {
    let parsed_vaa = parse_vaa(deps.branch(), env.block.time.seconds(), vaa)?;
    let data = parsed_vaa.payload;

    let message = TokenBridgeMessage::deserialize(&data)?;
    assert_eq!(
        message.action,
        Action::TRANSFER_WITH_PAYLOAD,
        "Only transfers with payload are supported"
    );

    let transfer_with_payload = TransferWithPayloadInfo::deserialize(&message.payload)?;

    let target_address = (&transfer_with_payload.transfer_info.recipient.as_slice()).get_address(0);
    let target_address_humanized = deps.api.addr_humanize(&target_address)?;

    assert_eq!(
        target_address_humanized, env.contract.address,
        "Transfer recipient must be {}",
        env.contract.address
    );

    let real_target_address = (&transfer_with_payload.payload.as_slice()).get_address(0);
    let real_target_address_humanized = deps.api.addr_humanize(&real_target_address)?;

    assert!(recipient(deps.storage).load().is_err(), "Re-entrancy");
    recipient(deps.storage).save(&real_target_address_humanized)?;

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
pub fn reply(deps: DepsMut, env: Env, msg: Reply) -> StdResult<Response> {
    let real_target_address_humanized = recipient(deps.storage).load()?;
    recipient(deps.storage).remove();

    // let events = msg.result

    Ok(Response::new())
}

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
