use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg};
use crate::state::{config, config_read, recipient, ConfigInfo};
use cosmwasm_std::{
    coin, entry_point, to_binary, Addr, BankMsg, Binary, CosmosMsg, DepsMut, Env, Event,
    MessageInfo, QueryRequest, Reply, Response, StdError, StdResult, SubMsg, Uint128, WasmMsg,
    WasmQuery,
};
use cw20_base::msg::ExecuteMsg as TokenMsg;
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
    _info: MessageInfo,
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
    let real_recipient = recipient(deps.storage).load()?;
    recipient(deps.storage).remove();

    let events = msg
        .result
        .into_result()
        .map_err(|e| StdError::generic_err(e))?
        .events;

    let last_event: &Event = events
        .last()
        .ok_or(StdError::generic_err("No events received"))?;

    match TransferCompletedEvent::from_event(last_event)? {
        TransferCompletedEvent::CompleteTransferTerraNative {
            recipient,
            denom,
            amount,
        } => complete_transfer_terra_native(env, recipient, real_recipient, denom, amount),
        TransferCompletedEvent::CompleteTransferCW20 {
            recipient,
            contract,
            amount,
        } => complete_transfer_cw20(env, recipient, real_recipient, contract, amount),
    }
}

fn complete_transfer_cw20(
    env: Env,
    recipient: Addr,
    real_recipient: Addr,
    contract: String,
    amount: String,
) -> StdResult<Response> {
    assert_eq!(recipient, env.contract.address);
    let coin_amount =
        u128::from_str_radix(&amount, 10).map_err(|err| StdError::generic_err(err.to_string()))?;

    let messages = vec![CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: contract,
        msg: to_binary(&TokenMsg::Transfer {
            recipient: real_recipient.to_string(),
            amount: Uint128::from(coin_amount),
        })?,
        funds: vec![],
    })];
    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "complete_transfer_cw20")
        .add_attribute("recipient", "real_recipient"))
}

fn complete_transfer_terra_native(
    env: Env,
    recipient: Addr,
    real_recipient: Addr,
    denom: String,
    amount: String,
) -> StdResult<Response> {
    assert_eq!(recipient, env.contract.address);
    // TODO(csongor): handle tax here?
    let coin_amount =
        u128::from_str_radix(&amount, 10).map_err(|err| StdError::generic_err(err.to_string()))?;

    let messages = vec![CosmosMsg::Bank(BankMsg::Send {
        to_address: real_recipient.to_string(),
        amount: vec![coin(coin_amount, denom)],
    })];

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "complete_transfer_terra_native")
        .add_attribute("recipient", "real_recipient"))
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

enum TransferCompletedEvent {
    CompleteTransferTerraNative {
        recipient: Addr,
        denom: String,
        amount: String,
    },
    // either native cw20 or wrapped cw20
    CompleteTransferCW20 {
        recipient: Addr,
        contract: String,
        amount: String,
    },
}

impl TransferCompletedEvent {
    fn from_event(event: &Event) -> StdResult<Self> {
        assert_eq!(event.ty, "wasm");
        let mut attrs = event.clone().attributes;
        let _contract_address = attrs.remove(0);
        let action = attrs.remove(0);
        assert_eq!(action.key, "action");
        match action.value.as_str() {
            "complete_transfer_native" | "complete_transfer_wrapped" => {
                if let [recipient, contract, amount, ..] = attrs.as_slice() {
                    assert_eq!(recipient.key, "recipient");
                    assert_eq!(contract.key, "contract");
                    assert_eq!(amount.key, "amount");

                    Ok(Self::CompleteTransferCW20 {
                        recipient: Addr::unchecked(recipient.clone().value),
                        contract: contract.clone().value,
                        amount: amount.clone().value,
                    })
                } else {
                    Err(StdError::generic_err("Ill-formed attributes"))
                }
            }
            "complete_transfer_terra_native" => {
                if let [recipient, denom, amount, ..] = attrs.as_slice() {
                    assert_eq!(recipient.key, "recipient");
                    assert_eq!(denom.key, "denom");
                    assert_eq!(amount.key, "amount");

                    Ok(Self::CompleteTransferTerraNative {
                        recipient: Addr::unchecked(recipient.clone().value),
                        denom: denom.clone().value,
                        amount: amount.clone().value,
                    })
                } else {
                    Err(StdError::generic_err("Ill-formed attributes"))
                }
            }
            _ => Err(StdError::generic_err(format!(
                "Invalid action: {}",
                action.key
            ))),
        }
    }
}
