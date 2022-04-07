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

pub use api::{
    complete_transfer_and_swap,
    CompleteTransferAndSwap
};

use solitaire::*;

solitaire! {
    CompleteTransferAndSwap => complete_transfer_and_swap,
}
