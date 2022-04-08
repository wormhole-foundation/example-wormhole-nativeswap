#![feature(adt_const_params)]
#![deny(unused_must_use)]

#[cfg(feature = "wasm")]
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
extern crate wasm_bindgen;

#[cfg(feature = "wasm")]
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
pub mod wasm;

#[cfg(feature = "no-entrypoint")]
pub mod instructions;

pub mod api;
pub mod double_claim_vaa;

pub use api::{
    complete_transfer,
    complete_no_swap,
    CompleteTransfer,
    CompleteNoSwap
};

use solitaire::*;
//use std::error::Error;

pub enum NativeSwapError {
    TokenBridgeNotClaimed,
    VAAAlreadyExecuted,
}

impl From<NativeSwapError> for SolitaireError {
    fn from(t: NativeSwapError) -> SolitaireError {
        SolitaireError::Custom(t as u64)
    }
}


solitaire! {
    CompleteTransfer => complete_transfer,
    CompleteNoSwap => complete_no_swap,

}
